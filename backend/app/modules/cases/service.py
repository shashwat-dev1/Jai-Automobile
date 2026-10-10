"""
DSA OS — Case Domain Service

Orchestrates:
- Case auto-numbering (LOS-10001 per tenant)
- Rapid 6-field intake creating Party + Vehicle + Case in a single transaction
- Duplicate detection on vehicle registration and active applicant loans
- State machine transition validation and chronological status history
- Optimistic locking (version checks)
- Role scoping (Field executives see only their own cases)
"""

import re
import uuid
from datetime import UTC, datetime

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.audit.service import AuditService
from app.modules.auth.models import User
from app.modules.cases.models import (
    Case,
    CaseParty,
    CaseStatusHistory,
    ConsentRecord,
    Vehicle,
)
from app.modules.cases.schemas import (
    BulkAssignResponse,
    CallActivityCreateRequest,
    CallActivityResponse,
    CaseCreate,
    CaseDetailResponse,
    CaseListItemResponse,
    CaseStatusUpdate,
    CaseUpdate,
    ConsentCreate,
    ConsentResponse,
    DuplicateCaseWarning,
    StatusHistoryResponse,
    TelecallerWorkspaceSummary,
    VehicleCreateUpdate,
    VehicleResponse,
)
from app.modules.cases.state_machine import (
    CASE_STATUS_CLOSED,
    CASE_STATUS_LEAD,
    CASE_STATUS_REJECTED,
    CASE_STATUS_WITHDRAWN,
    validate_status_transition,
)
from app.modules.parties.models import Party
from app.modules.parties.schemas import PartyCreate
from app.modules.parties.service import PartyService
from app.modules.sources.models import Source
from app.modules.workflow.sla import compute_stage_sla
from app.shared.encryption import mask_mobile
from app.shared.exceptions import ConflictError, NotFoundError, ValidationError


class CaseService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.audit = AuditService(session=session)
        self.party_service = PartyService(session=session)

    async def _generate_next_case_no(self, org_id: uuid.UUID) -> str:
        """Generate sequential case number per organization: LOS-10001, LOS-10002..."""
        stmt = (
            select(Case.case_no)
            .where(Case.org_id == org_id)
            .order_by(Case.created_at.desc())
            .limit(50)
        )
        res = await self.session.execute(stmt)
        existing_numbers = res.scalars().all()

        highest = 10000
        for num_str in existing_numbers:
            match = re.search(r"\d+", num_str)
            if match:
                val = int(match.group())
                if val > highest:
                    highest = val

        return f"LOS-{highest + 1}"

    async def check_duplicate_cases(
        self,
        org_id: uuid.UUID,
        party_id: uuid.UUID | None,
        registration_no: str | None,
    ) -> list[DuplicateCaseWarning]:
        """Warn if vehicle is active in another file, or applicant has active pipeline case."""
        warnings: list[DuplicateCaseWarning] = []
        terminal_statuses = {CASE_STATUS_CLOSED, CASE_STATUS_REJECTED, CASE_STATUS_WITHDRAWN}

        # 1. Vehicle Registration Check
        if registration_no:
            cleaned_rc = re.sub(r"[\s\-]", "", registration_no).upper()
            stmt_veh = (
                select(Case)
                .join(Vehicle, Vehicle.case_id == Case.id)
                .where(
                    Case.org_id == org_id,
                    Vehicle.registration_no == cleaned_rc,
                    Case.status.not_in(terminal_statuses),
                    Case.deleted_at.is_(None),
                )
            )
            res_veh = await self.session.execute(stmt_veh)
            existing_cases = res_veh.scalars().all()
            for c in existing_cases:
                warnings.append(
                    DuplicateCaseWarning(
                        case_id=c.id,
                        case_no=c.case_no,
                        match_type="vehicle_registration",
                        details=f"Active case {c.case_no} already exists for vehicle {cleaned_rc}.",
                    )
                )

        # 2. Active Applicant Case Check
        if party_id:
            stmt_app = (
                select(Case)
                .join(CaseParty, CaseParty.case_id == Case.id)
                .where(
                    Case.org_id == org_id,
                    CaseParty.party_id == party_id,
                    CaseParty.is_primary.is_(True),
                    Case.status.not_in(terminal_statuses),
                    Case.deleted_at.is_(None),
                )
            )
            res_app = await self.session.execute(stmt_app)
            for c in res_app.scalars().all():
                warnings.append(
                    DuplicateCaseWarning(
                        case_id=c.id,
                        case_no=c.case_no,
                        match_type="applicant_active_case",
                        details=f"Applicant already has active loan file {c.case_no} in status '{c.status}'.",
                    )
                )

        return warnings

    async def create_case(
        self,
        org_id: uuid.UUID,
        payload: CaseCreate,
        actor_id: uuid.UUID,
        actor_role: str,
    ) -> tuple[CaseDetailResponse, list[DuplicateCaseWarning]]:
        """
        Rapid case intake (IF-2):
        1. Create or link primary Party
        2. Auto-generate sequential case number
        3. Create Case entity
        4. Link primary applicant CaseParty
        5. Create Vehicle record
        6. Record initial status history (lead)
        """
        # 1. Find or create party
        party_create = PartyCreate(
            name=payload.party_name,
            mobile_primary=payload.party_mobile,
            pan=payload.party_pan,
            aadhaar_last_four=payload.party_aadhaar_last_four,
        )
        party_resp, _ = await self.party_service.create_party(
            org_id=org_id,
            payload=party_create,
            actor_id=actor_id,
            actor_role=actor_role,
        )

        # 2. Check duplicates for case
        cleaned_rc = (
            re.sub(r"[\s\-]", "", payload.vehicle_registration_no).upper()
            if payload.vehicle_registration_no
            else None
        )
        warnings = await self.check_duplicate_cases(
            org_id=org_id,
            party_id=party_resp.id,
            registration_no=cleaned_rc,
        )

        # 3. Create Case
        case_no = await self._generate_next_case_no(org_id)
        case = Case(
            id=uuid.uuid4(),
            org_id=org_id,
            case_no=case_no,
            product_type=payload.product_type,
            status=CASE_STATUS_LEAD,
            loan_amount_requested=payload.loan_amount_requested,
            source_id=payload.source_id,
            source_executive=payload.source_executive,
            owner_id=actor_id,
            assigned_processor_id=payload.assigned_processor_id,
            version=1,
            notes=payload.notes,
        )
        self.session.add(case)

        # 4. Create primary CaseParty
        case_party = CaseParty(
            id=uuid.uuid4(),
            org_id=org_id,
            case_id=case.id,
            party_id=party_resp.id,
            role="applicant",
            is_primary=True,
        )
        self.session.add(case_party)

        # 5. Create Vehicle
        vehicle = Vehicle(
            id=uuid.uuid4(),
            org_id=org_id,
            case_id=case.id,
            vehicle_type="four_wheeler",
            make=payload.vehicle_make.strip(),
            model=payload.vehicle_model.strip(),
            condition=payload.vehicle_condition,
            registration_no=cleaned_rc,
        )
        self.session.add(vehicle)

        # 6. Status History
        status_hist = CaseStatusHistory(
            id=uuid.uuid4(),
            org_id=org_id,
            case_id=case.id,
            from_status=None,
            to_status=CASE_STATUS_LEAD,
            reason="Initial intake",
            changed_by=actor_id,
        )
        self.session.add(status_hist)

        await self.session.commit()
        await self.session.refresh(case)

        # Audit log
        await self.audit.log_event(
            org_id=org_id,
            actor_id=actor_id,
            actor_role=actor_role,
            action="case.created",
            entity_type="case",
            entity_id=str(case.id),
            changes={"case_no": case.case_no, "product_type": case.product_type},
        )

        detail = await self.get_case_detail(org_id=org_id, case_id=case.id)
        return detail, warnings

    async def get_case_detail(
        self,
        org_id: uuid.UUID,
        case_id: uuid.UUID,
    ) -> CaseDetailResponse:
        """Fetch full case dossier including applicant, vehicle, source, timeline."""
        case = await self._get_case(org_id, case_id)

        # 1. Primary Party
        stmt_party = (
            select(Party)
            .join(CaseParty, CaseParty.party_id == Party.id)
            .where(
                CaseParty.case_id == case.id,
                CaseParty.is_primary.is_(True),
                Party.deleted_at.is_(None),
            )
        )
        res_party = await self.session.execute(stmt_party)
        party = res_party.scalar_one_or_none()
        primary_party_resp = self.party_service._to_response(party) if party else None

        # 2. Vehicle
        stmt_veh = select(Vehicle).where(Vehicle.case_id == case.id, Vehicle.deleted_at.is_(None))
        res_veh = await self.session.execute(stmt_veh)
        vehicle = res_veh.scalar_one_or_none()
        vehicle_resp = VehicleResponse.model_validate(vehicle) if vehicle else None

        # 3. Source Name
        stmt_src = select(Source.name).where(Source.id == case.source_id)
        source_name = (await self.session.execute(stmt_src)).scalar_one_or_none() or "Unknown"

        # 4. Owner & Processor Names
        stmt_owner = select(User.name).where(User.id == case.owner_id)
        owner_name = (await self.session.execute(stmt_owner)).scalar_one_or_none() or "Unknown"

        proc_name = None
        if case.assigned_processor_id:
            stmt_proc = select(User.name).where(User.id == case.assigned_processor_id)
            proc_name = (await self.session.execute(stmt_proc)).scalar_one_or_none()

        # 5. Status History
        stmt_hist = (
            select(CaseStatusHistory, User.name)
            .outerjoin(User, User.id == CaseStatusHistory.changed_by)
            .where(CaseStatusHistory.case_id == case.id)
            .order_by(CaseStatusHistory.created_at.asc())
        )
        res_hist = await self.session.execute(stmt_hist)
        status_history: list[StatusHistoryResponse] = []
        for h, changer in res_hist.all():
            status_history.append(
                StatusHistoryResponse(
                    id=h.id,
                    from_status=h.from_status,
                    to_status=h.to_status,
                    reason=h.reason,
                    changed_by=h.changed_by,
                    changer_name=changer,
                    created_at=h.created_at,
                )
            )

        # 6. Consent Status
        has_consent = False
        if party:
            stmt_consent = select(ConsentRecord).where(
                ConsentRecord.party_id == party.id,
                ConsentRecord.is_given.is_(True),
                ConsentRecord.deleted_at.is_(None),
            )
            has_consent = (
                await self.session.execute(stmt_consent)
            ).scalar_one_or_none() is not None

        stage_sla = compute_stage_sla(
            entered_stage_at=case.entered_stage_at,
            status=case.status,
            entity_type="case",
        )

        # Telecaller name lookup
        telecaller_name = None
        if case.assigned_telecaller_id:
            tc_res = await self.session.execute(
                select(User.name).where(User.id == case.assigned_telecaller_id)
            )
            telecaller_name = tc_res.scalar_one_or_none()

        return CaseDetailResponse(
            id=case.id,
            org_id=case.org_id,
            case_no=case.case_no,
            product_type=case.product_type,
            status=case.status,
            loan_amount_requested=case.loan_amount_requested,
            loan_amount_sanctioned=case.loan_amount_sanctioned,
            loan_amount_disbursed=case.loan_amount_disbursed,
            source_id=case.source_id,
            source_name=source_name,
            source_executive=case.source_executive,
            owner_id=case.owner_id,
            owner_name=owner_name,
            assigned_processor_id=case.assigned_processor_id,
            assigned_processor_name=proc_name,
            assigned_telecaller_id=case.assigned_telecaller_id,
            assigned_telecaller_name=telecaller_name,
            call_outcome=case.call_outcome or "new",
            telecaller_remarks=case.telecaller_remarks,
            follow_up_at=case.follow_up_at,
            call_attempts_count=case.call_attempts_count or 0,
            referral_profile_id=case.referral_profile_id,
            referral_partner_name=case.referral_partner_name,
            notes=case.notes,
            version=case.version,
            is_stuck=stage_sla["is_stuck"],
            sla=stage_sla,
            primary_party=primary_party_resp,
            vehicle=vehicle_resp,
            has_consent=has_consent,
            status_history=status_history,
            created_at=case.created_at,
            updated_at=case.updated_at,
        )

    async def list_cases(
        self,
        org_id: uuid.UUID,
        status: str | None = None,
        product_type: str | None = None,
        source_id: uuid.UUID | None = None,
        owner_id: uuid.UUID | None = None,
        telecaller_id: uuid.UUID | None = None,
        call_outcome: str | None = None,
        party_id: uuid.UUID | None = None,
        search: str | None = None,
        page: int = 1,
        page_size: int = 25,
        actor_role: str = "processor",
        actor_id: uuid.UUID | None = None,
    ) -> tuple[list[CaseListItemResponse], int]:
        """
        List cases with filters and pagination.
        Enforces Field Executive & Telecaller scoping.
        """
        stmt = (
            select(
                Case,
                Party.name.label("party_name"),
                Party.mobile_primary.label("party_mobile"),
                Vehicle.make.label("v_make"),
                Vehicle.model.label("v_model"),
                Source.name.label("source_name"),
                User.name.label("owner_name"),
                Party.id.label("party_id"),
            )
            .join(CaseParty, (CaseParty.case_id == Case.id) & (CaseParty.is_primary.is_(True)))
            .join(Party, Party.id == CaseParty.party_id)
            .outerjoin(Vehicle, Vehicle.case_id == Case.id)
            .join(Source, Source.id == Case.source_id)
            .join(User, User.id == Case.owner_id)
            .where(Case.org_id == org_id, Case.deleted_at.is_(None))
        )

        # RBAC Field Executive restriction
        if actor_role == "field_executive" and actor_id:
            stmt = stmt.where(Case.owner_id == actor_id)

        # RBAC Telecaller restriction: see only assigned leads
        if actor_role == "telecaller" and actor_id:
            stmt = stmt.where(Case.assigned_telecaller_id == actor_id)

        # Filters
        if telecaller_id:
            stmt = stmt.where(Case.assigned_telecaller_id == telecaller_id)
        if call_outcome:
            stmt = stmt.where(Case.call_outcome == call_outcome)
        if party_id:
            stmt = stmt.where(Party.id == party_id)
        if status:
            stmt = stmt.where(Case.status == status)
        if product_type:
            stmt = stmt.where(Case.product_type == product_type)
        if source_id:
            stmt = stmt.where(Case.source_id == source_id)
        if owner_id:
            stmt = stmt.where(Case.owner_id == owner_id)
        if search:
            s_clean = search.strip()
            stmt = stmt.where(
                or_(
                    Case.case_no.ilike(f"%{s_clean}%"),
                    Party.name.ilike(f"%{s_clean}%"),
                    Party.mobile_primary.ilike(f"%{s_clean}%"),
                    Vehicle.registration_no.ilike(f"%{s_clean}%"),
                )
            )

        # Count total
        count_stmt = select(func.count()).select_from(stmt.subquery())
        total = (await self.session.execute(count_stmt)).scalar_one()

        # Paginate
        stmt = stmt.order_by(Case.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
        res = await self.session.execute(stmt)

        now = datetime.now(UTC)
        items: list[CaseListItemResponse] = []
        for row in res.all():
            c: Case = row[0]
            p_name: str = row[1]
            p_mob: str = row[2]
            v_make: str = row[3] or ""
            v_model: str = row[4] or ""
            s_name: str = row[5]
            o_name: str = row[6]
            p_id: uuid.UUID = row[7]

            age = max(0, (now - c.created_at).days)
            veh_summary = f"{v_make} {v_model}".strip() or "Vehicle Pending"

            stage_sla = compute_stage_sla(
                entered_stage_at=c.entered_stage_at,
                status=c.status,
                entity_type="case",
            )

            items.append(
                CaseListItemResponse(
                    id=c.id,
                    case_no=c.case_no,
                    product_type=c.product_type,
                    status=c.status,
                    loan_amount_requested=c.loan_amount_requested,
                    loan_amount_sanctioned=c.loan_amount_sanctioned,
                    loan_amount_disbursed=c.loan_amount_disbursed,
                    party_id=p_id,
                    primary_applicant_name=p_name,
                    primary_applicant_mobile=mask_mobile(p_mob) or p_mob,
                    vehicle_summary=veh_summary,
                    source_name=s_name,
                    owner_name=o_name,
                    assigned_telecaller_id=c.assigned_telecaller_id,
                    call_outcome=c.call_outcome or "new",
                    telecaller_remarks=c.telecaller_remarks,
                    follow_up_at=c.follow_up_at,
                    call_attempts_count=c.call_attempts_count or 0,
                    referral_profile_id=c.referral_profile_id,
                    referral_partner_name=c.referral_partner_name,
                    has_consent=True,
                    age_in_days=age,
                    is_stuck=stage_sla["is_stuck"],
                    sla=stage_sla,
                    version=c.version,
                    created_at=c.created_at,
                    updated_at=c.updated_at,
                )
            )

        return items, total

    async def update_case(
        self,
        org_id: uuid.UUID,
        case_id: uuid.UUID,
        payload: CaseUpdate,
        actor_id: uuid.UUID,
        actor_role: str,
    ) -> CaseDetailResponse:
        """Update case with optimistic locking."""
        case = await self._get_case(org_id, case_id)

        if case.version != payload.version:
            raise ConflictError(
                "Case file has been modified by another user. Please refresh and review.",
                code="OPTIMISTIC_LOCK_CONFLICT",
            )

        update_dict = payload.model_dump(exclude_unset=True, exclude={"version"})
        for k, v in update_dict.items():
            setattr(case, k, v)

        case.version += 1
        case.updated_at = datetime.now(UTC)

        await self.session.commit()
        await self.session.refresh(case)

        await self.audit.log_event(
            org_id=org_id,
            actor_id=actor_id,
            actor_role=actor_role,
            action="case.updated",
            entity_type="case",
            entity_id=str(case.id),
            changes={"updated_fields": list(update_dict.keys()), "version": case.version},
        )

        return await self.get_case_detail(org_id=org_id, case_id=case.id)

    async def change_status(
        self,
        org_id: uuid.UUID,
        case_id: uuid.UUID,
        payload: CaseStatusUpdate,
        actor_id: uuid.UUID,
        actor_role: str,
    ) -> CaseDetailResponse:
        """Enforce state machine transition and record status history with optimistic locking."""
        case = await self._get_case(org_id, case_id)

        if case.version != payload.version:
            raise ConflictError(
                "Case file has been updated by another user. Please refresh.",
                code="OPTIMISTIC_LOCK_CONFLICT",
            )

        # Validate transition
        validate_status_transition(
            current_status=case.status,
            target_status=payload.status,
            user_role=actor_role,
        )

        # BR-03 Document Gate: Check mandatory documents before moving to applied/logged-in
        if payload.status in ("file_logged_in", "applied"):
            from app.modules.workflow.document_gate import DocumentGate

            await DocumentGate.evaluate_gate(
                db=self.session,
                case=case,
                user_role=actor_role,
                user_id=actor_id,
                override_reason=payload.reason,
            )

        old_status = case.status
        case.status = payload.status
        case.entered_stage_at = datetime.now(UTC)
        case.version += 1
        case.updated_at = datetime.now(UTC)

        # Append status history
        hist = CaseStatusHistory(
            id=uuid.uuid4(),
            org_id=org_id,
            case_id=case.id,
            from_status=old_status,
            to_status=payload.status,
            reason=payload.reason,
            changed_by=actor_id,
        )
        self.session.add(hist)

        await self.session.commit()
        await self.session.refresh(case)

        await self.audit.log_event(
            org_id=org_id,
            actor_id=actor_id,
            actor_role=actor_role,
            action="case.status_changed",
            entity_type="case",
            entity_id=str(case.id),
            changes={
                "from_status": old_status,
                "to_status": payload.status,
                "reason": payload.reason,
            },
        )

        return await self.get_case_detail(org_id=org_id, case_id=case.id)

    async def upsert_vehicle(
        self,
        org_id: uuid.UUID,
        case_id: uuid.UUID,
        payload: VehicleCreateUpdate,
        actor_id: uuid.UUID,
        actor_role: str,
    ) -> VehicleResponse:
        """Create or update vehicle asset tied to the loan case."""
        case = await self._get_case(org_id, case_id)

        stmt = select(Vehicle).where(Vehicle.case_id == case.id, Vehicle.deleted_at.is_(None))
        res = await self.session.execute(stmt)
        vehicle = res.scalar_one_or_none()

        cleaned_rc = (
            re.sub(r"[\s\-]", "", payload.registration_no).upper()
            if payload.registration_no
            else None
        )

        if not vehicle:
            vehicle = Vehicle(
                id=uuid.uuid4(),
                org_id=org_id,
                case_id=case.id,
                vehicle_type=payload.vehicle_type,
                make=payload.make,
                model=payload.model,
                variant=payload.variant,
                year_of_manufacture=payload.year_of_manufacture,
                condition=payload.condition,
                registration_no=cleaned_rc,
                chassis_no=payload.chassis_no,
                engine_no=payload.engine_no,
                valuation_amount=payload.valuation_amount,
                ex_showroom_price=payload.ex_showroom_price,
                on_road_price=payload.on_road_price,
                existing_hypothecation=payload.existing_hypothecation,
            )
            self.session.add(vehicle)
        else:
            for k, v in payload.model_dump(exclude_unset=True).items():
                if k == "registration_no":
                    setattr(vehicle, k, cleaned_rc)
                else:
                    setattr(vehicle, k, v)
            vehicle.updated_at = datetime.now(UTC)

        await self.session.commit()
        await self.session.refresh(vehicle)

        await self.audit.log_event(
            org_id=org_id,
            actor_id=actor_id,
            actor_role=actor_role,
            action="case.vehicle_updated",
            entity_type="vehicle",
            entity_id=str(vehicle.id),
            changes={"case_id": str(case.id), "make": vehicle.make, "rc": vehicle.registration_no},
        )

        return VehicleResponse.model_validate(vehicle)

    async def record_consent(
        self,
        org_id: uuid.UUID,
        payload: ConsentCreate,
        actor_id: uuid.UUID,
        actor_role: str,
        ip_address: str | None = None,
    ) -> ConsentResponse:
        """Record explicit DPDP consent for party processing."""
        consent = ConsentRecord(
            id=uuid.uuid4(),
            org_id=org_id,
            party_id=payload.party_id,
            case_id=payload.case_id,
            purpose=payload.purpose,
            consent_type=payload.consent_type,
            is_given=payload.is_given,
            ip_address=ip_address,
            recorded_by=actor_id,
        )
        self.session.add(consent)
        await self.session.commit()
        await self.session.refresh(consent)

        await self.audit.log_event(
            org_id=org_id,
            actor_id=actor_id,
            actor_role=actor_role,
            action="privacy.consent_recorded",
            entity_type="consent_record",
            entity_id=str(consent.id),
            changes={"party_id": str(payload.party_id), "purpose": payload.purpose},
        )

        return ConsentResponse.model_validate(consent)

    async def _get_case(self, org_id: uuid.UUID, case_id: uuid.UUID) -> Case:
        stmt = select(Case).where(
            Case.id == case_id, Case.org_id == org_id, Case.deleted_at.is_(None)
        )
        res = await self.session.execute(stmt)
        case = res.scalar_one_or_none()
        if not case:
            raise NotFoundError(f"Case with ID '{case_id}' not found.")
        return case

    async def assign_cases(
        self,
        org_id: uuid.UUID,
        case_ids: list[uuid.UUID],
        telecaller_id: uuid.UUID,
        actor_id: uuid.UUID,
    ) -> BulkAssignResponse:
        """Assign or reassign multiple leads to an authorized telecaller."""
        u_stmt = select(User).where(User.id == telecaller_id, User.org_id == org_id, User.deleted_at.is_(None))
        u_res = await self.session.execute(u_stmt)
        telecaller = u_res.scalar_one_or_none()
        if not telecaller:
            raise NotFoundError("Assigned telecaller not found in organization.")

        stmt = select(Case).where(
            Case.id.in_(case_ids),
            Case.org_id == org_id,
            Case.deleted_at.is_(None),
        )
        res = await self.session.execute(stmt)
        cases = res.scalars().all()
        now = datetime.now(UTC)

        for c in cases:
            c.assigned_telecaller_id = telecaller_id
            c.assigned_at = now
            c.assigned_by_id = actor_id
            sh = CaseStatusHistory(
                id=uuid.uuid4(),
                org_id=org_id,
                case_id=c.id,
                from_status=c.status,
                to_status=c.status,
                changed_by=actor_id,
                notes=f"Lead assigned to telecaller {telecaller.name}",
                version=1,
            )
            self.session.add(sh)

        await self.session.commit()

        return BulkAssignResponse(
            assigned_count=len(cases),
            telecaller_id=telecaller.id,
            telecaller_name=telecaller.name,
        )

    async def record_call_activity(
        self,
        org_id: uuid.UUID,
        case_id: uuid.UUID,
        payload: CallActivityCreateRequest,
        actor_id: uuid.UUID,
        actor_name: str,
    ) -> CallActivityResponse:
        """Record telecaller call outcome, notes, and schedule callback."""
        case = await self._get_case(org_id, case_id)

        valid_outcomes = ("new", "interested", "not_interested", "follow_up", "not_reachable", "duplicate")
        if payload.outcome not in valid_outcomes:
            raise ValidationError(f"Invalid call outcome '{payload.outcome}'. Allowed: {valid_outcomes}")

        case.call_outcome = payload.outcome
        case.telecaller_remarks = payload.remarks
        case.follow_up_at = payload.follow_up_at
        case.call_attempts_count = (case.call_attempts_count or 0) + 1

        sh = CaseStatusHistory(
            id=uuid.uuid4(),
            org_id=org_id,
            case_id=case.id,
            from_status=case.status,
            to_status=case.status,
            changed_by=actor_id,
            notes=f"Call Attempt #{case.call_attempts_count}: [{payload.outcome.upper()}] {payload.remarks}",
            version=1,
        )
        self.session.add(sh)
        await self.session.commit()
        await self.session.refresh(case)

        return CallActivityResponse(
            case_id=case.id,
            case_no=case.case_no,
            call_outcome=case.call_outcome,
            telecaller_remarks=case.telecaller_remarks or "",
            follow_up_at=case.follow_up_at,
            call_attempts_count=case.call_attempts_count,
            updated_at=case.updated_at,
        )

    async def get_telecaller_workspace(
        self,
        org_id: uuid.UUID,
        telecaller_id: uuid.UUID,
    ) -> TelecallerWorkspaceSummary:
        """Fetch leads and metrics for an individual telecaller workspace."""
        items, total = await self.list_cases(
            org_id=org_id,
            page_size=200,
            actor_role="telecaller",
            actor_id=telecaller_id,
        )
        now = datetime.now(UTC)

        pending = sum(1 for i in items if not i.call_outcome or i.call_outcome in ("new", "not_reachable"))
        follow_ups = sum(1 for i in items if i.follow_up_at and i.follow_up_at.date() <= now.date())
        interested = sum(1 for i in items if i.call_outcome == "interested")
        completed = sum(1 for i in items if i.call_outcome in ("not_interested", "duplicate"))

        return TelecallerWorkspaceSummary(
            total_assigned=total,
            pending_leads=pending,
            follow_ups_due=follow_ups,
            interested_count=interested,
            completed_count=completed,
            leads=items,
        )
