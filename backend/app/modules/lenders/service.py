"""
DSA OS — Lender and Lender Application Service Layer
Implements business rules:
- BR-04: Rejection reason code mandatory
- BR-05: Single winning application constraint; only Disbursed can be winning
- BR-08: Disbursed amount cannot exceed sanction amount without override reason
- Optimistic concurrency control via version
"""

import uuid
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.audit.service import AuditService
from app.modules.cases.models import Case, CaseStatusHistory
from app.modules.cases.state_machine import CASE_STATUS_DISBURSED
from app.modules.lenders.models import Lender, LenderApplication
from app.modules.lenders.schemas import (
    LenderApplicationCreateRequest,
    LenderApplicationResponse,
    LenderApplicationUpdateRequest,
    LenderCreateRequest,
    LenderResponse,
    LenderUpdateRequest,
)
from app.modules.workflow.sla import compute_stage_sla
from app.modules.workflow.state_machine import (
    APP_STATUS_DISBURSED,
    validate_application_transition,
)
from app.shared.exceptions import (
    BusinessRuleViolationError,
    ConflictError,
    NotFoundError,
)


class LenderService:
    """Manages the per-org registry of empanelled banks and NBFCs."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.audit = AuditService(session=session)

    async def list_lenders(
        self, org_id: uuid.UUID, is_active: bool | None = None
    ) -> list[LenderResponse]:
        stmt = (
            select(Lender)
            .where(Lender.org_id == org_id, Lender.deleted_at.is_(None))
            .order_by(Lender.name.asc())
        )
        if is_active is not None:
            stmt = stmt.where(Lender.is_active == is_active)

        res = await self.session.execute(stmt)
        return [LenderResponse.model_validate(item) for item in res.scalars().all()]

    async def get_lender(self, org_id: uuid.UUID, lender_id: uuid.UUID) -> Lender:
        stmt = select(Lender).where(
            Lender.id == lender_id,
            Lender.org_id == org_id,
            Lender.deleted_at.is_(None),
        )
        res = await self.session.execute(stmt)
        lender = res.scalar_one_or_none()
        if not lender:
            raise NotFoundError(f"Lender '{lender_id}' not found.")
        return lender

    async def create_lender(
        self,
        org_id: uuid.UUID,
        payload: LenderCreateRequest,
        actor_id: uuid.UUID,
        actor_role: str,
    ) -> LenderResponse:
        # Check duplicate name
        existing_stmt = select(Lender).where(
            Lender.org_id == org_id,
            func.lower(Lender.name) == payload.name.strip().lower(),
            Lender.deleted_at.is_(None),
        )
        existing = (await self.session.execute(existing_stmt)).scalar_one_or_none()
        if existing:
            raise ConflictError(f"Lender with name '{payload.name}' already exists.")

        lender = Lender(
            id=uuid.uuid4(),
            org_id=org_id,
            name=payload.name.strip(),
            code=payload.code.strip() if payload.code else None,
            type=payload.type,
            products=payload.products,
            dsa_code=payload.dsa_code.strip() if payload.dsa_code else None,
            contact_person=payload.contact_person.strip() if payload.contact_person else None,
            contact_email=payload.contact_email.strip() if payload.contact_email else None,
            contact_mobile=payload.contact_mobile.strip() if payload.contact_mobile else None,
            notes=payload.notes,
            is_active=True,
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
        self.session.add(lender)
        await self.session.commit()
        await self.session.refresh(lender)

        await self.audit.log_event(
            org_id=org_id,
            action="lender.created",
            entity_type="lender",
            actor_id=actor_id,
            actor_role=actor_role,
            entity_id=str(lender.id),
            changes={"name": lender.name, "type": lender.type},
        )
        return LenderResponse.model_validate(lender)

    async def update_lender(
        self,
        org_id: uuid.UUID,
        lender_id: uuid.UUID,
        payload: LenderUpdateRequest,
        actor_id: uuid.UUID,
        actor_role: str,
    ) -> LenderResponse:
        lender = await self.get_lender(org_id, lender_id)
        before_state = {"name": lender.name, "is_active": lender.is_active}

        if payload.name is not None:
            lender.name = payload.name.strip()
        if payload.code is not None:
            lender.code = payload.code.strip() if payload.code else None
        if payload.type is not None:
            lender.type = payload.type
        if payload.products is not None:
            lender.products = payload.products
        if payload.dsa_code is not None:
            lender.dsa_code = payload.dsa_code.strip() if payload.dsa_code else None
        if payload.contact_person is not None:
            lender.contact_person = payload.contact_person.strip() if payload.contact_person else None
        if payload.contact_email is not None:
            lender.contact_email = payload.contact_email.strip() if payload.contact_email else None
        if payload.contact_mobile is not None:
            lender.contact_mobile = payload.contact_mobile.strip() if payload.contact_mobile else None
        if payload.notes is not None:
            lender.notes = payload.notes
        if payload.is_active is not None:
            lender.is_active = payload.is_active

        lender.updated_at = datetime.now(UTC)
        await self.session.commit()
        await self.session.refresh(lender)

        await self.audit.log_event(
            org_id=org_id,
            action="lender.updated",
            entity_type="lender",
            actor_id=actor_id,
            actor_role=actor_role,
            entity_id=str(lender.id),
            changes={"before": before_state, "after": {"name": lender.name, "is_active": lender.is_active}},
        )
        return LenderResponse.model_validate(lender)


class LenderApplicationService:
    """Manages multi-lender submissions, sanction terms, winning offers, and disbursals."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.audit = AuditService(session=session)

    async def list_applications(
        self, org_id: uuid.UUID, case_id: uuid.UUID
    ) -> list[LenderApplicationResponse]:
        stmt = (
            select(LenderApplication)
            .options(selectinload(LenderApplication.lender))
            .where(
                LenderApplication.org_id == org_id,
                LenderApplication.case_id == case_id,
                LenderApplication.deleted_at.is_(None),
            )
            .order_by(LenderApplication.created_at.asc())
        )
        res = await self.session.execute(stmt)
        apps = res.scalars().all()

        responses: list[LenderApplicationResponse] = []
        for a in apps:
            sla_info = compute_stage_sla(
                entered_stage_at=a.entered_stage_at,
                status=a.status,
                entity_type="lender_application",
            )
            resp = LenderApplicationResponse(
                id=a.id,
                org_id=a.org_id,
                case_id=a.case_id,
                lender_id=a.lender_id,
                lender_name=a.lender.name if a.lender else None,
                product=a.product,
                login_ref=a.login_ref,
                login_date=a.login_date,
                status=a.status,
                query_notes=a.query_notes,
                sanction_amount=a.sanction_amount,
                sanction_tenure_months=a.sanction_tenure_months,
                sanction_rate=a.sanction_rate,
                sanction_margin_money=a.sanction_margin_money,
                sanction_date=a.sanction_date,
                rejection_reason_code=a.rejection_reason_code,
                rejection_notes=a.rejection_notes,
                disbursal_date=a.disbursal_date,
                disbursal_amount=a.disbursal_amount,
                disbursal_ref=a.disbursal_ref,
                disbursal_override_reason=a.disbursal_override_reason,
                is_winning=a.is_winning,
                version=a.version,
                sla=sla_info,
                created_at=a.created_at,
                updated_at=a.updated_at,
            )
            responses.append(resp)
        return responses

    async def get_application(
        self, org_id: uuid.UUID, case_id: uuid.UUID, application_id: uuid.UUID
    ) -> LenderApplication:
        stmt = (
            select(LenderApplication)
            .options(selectinload(LenderApplication.lender))
            .where(
                LenderApplication.id == application_id,
                LenderApplication.case_id == case_id,
                LenderApplication.org_id == org_id,
                LenderApplication.deleted_at.is_(None),
            )
        )
        res = await self.session.execute(stmt)
        app = res.scalar_one_or_none()
        if not app:
            raise NotFoundError(f"Lender application '{application_id}' not found.")
        return app

    async def create_application(
        self,
        org_id: uuid.UUID,
        case_id: uuid.UUID,
        payload: LenderApplicationCreateRequest,
        actor_id: uuid.UUID,
        actor_role: str,
    ) -> LenderApplicationResponse:
        # Verify Case exists
        case_stmt = select(Case).where(
            Case.id == case_id,
            Case.org_id == org_id,
            Case.deleted_at.is_(None),
        )
        case = (await self.session.execute(case_stmt)).scalar_one_or_none()
        if not case:
            raise NotFoundError(f"Case '{case_id}' not found.")

        # Verify Lender exists
        lender_stmt = select(Lender).where(
            Lender.id == payload.lender_id,
            Lender.org_id == org_id,
            Lender.deleted_at.is_(None),
        )
        lender = (await self.session.execute(lender_stmt)).scalar_one_or_none()
        if not lender:
            raise NotFoundError(f"Lender '{payload.lender_id}' not found.")

        now_dt = datetime.now(UTC)
        app = LenderApplication(
            id=uuid.uuid4(),
            org_id=org_id,
            case_id=case_id,
            lender_id=payload.lender_id,
            product=payload.product,
            login_ref=payload.login_ref.strip() if payload.login_ref else None,
            login_date=payload.login_date,
            status="logged_in",
            is_winning=False,
            version=1,
            entered_stage_at=now_dt,
            created_at=now_dt,
            updated_at=now_dt,
        )
        self.session.add(app)
        await self.session.commit()
        await self.session.refresh(app)

        await self.audit.log_event(
            org_id=org_id,
            action="lender_app.created",
            entity_type="lender_application",
            actor_id=actor_id,
            actor_role=actor_role,
            entity_id=str(app.id),
            changes={
                "case_id": str(case_id),
                "lender_id": str(payload.lender_id),
                "product": payload.product,
                "status": "logged_in",
            },
        )

        sla_info = compute_stage_sla(
            entered_stage_at=app.entered_stage_at,
            status=app.status,
            entity_type="lender_application",
        )

        return LenderApplicationResponse(
            id=app.id,
            org_id=app.org_id,
            case_id=app.case_id,
            lender_id=app.lender_id,
            lender_name=lender.name,
            product=app.product,
            login_ref=app.login_ref,
            login_date=app.login_date,
            status=app.status,
            is_winning=app.is_winning,
            version=app.version,
            sla=sla_info,
            created_at=app.created_at,
            updated_at=app.updated_at,
        )

    async def update_application(
        self,
        org_id: uuid.UUID,
        case_id: uuid.UUID,
        application_id: uuid.UUID,
        payload: LenderApplicationUpdateRequest,
        actor_id: uuid.UUID,
        actor_role: str,
    ) -> LenderApplicationResponse:
        app = await self.get_application(org_id, case_id, application_id)

        # Optimistic locking
        if app.version != payload.version:
            raise ConflictError(
                "Lender application has been modified by another user. Please refresh and retry.",
                code="OPTIMISTIC_LOCK_CONFLICT",
            )

        before_state: dict[str, Any] = {
            "status": app.status,
            "is_winning": app.is_winning,
            "sanction_amount": str(app.sanction_amount) if app.sanction_amount else None,
            "disbursal_amount": str(app.disbursal_amount) if app.disbursal_amount else None,
        }

        # Status transition validation
        if payload.status and payload.status != app.status:
            validate_application_transition(
                current_status=app.status,
                target_status=payload.status,
                rejection_reason_code=payload.rejection_reason_code,
            )
            app.status = payload.status
            app.entered_stage_at = datetime.now(UTC)

        # Sanction terms update
        if payload.sanction_terms:
            st = payload.sanction_terms
            app.sanction_amount = st.sanction_amount
            app.sanction_tenure_months = st.sanction_tenure_months
            app.sanction_rate = st.sanction_rate
            app.sanction_margin_money = st.sanction_margin_money
            app.sanction_date = st.sanction_date or datetime.now(UTC).date()
            if app.status in ("logged_in", "under_verification", "query_raised"):
                app.status = "sanctioned"
                app.entered_stage_at = datetime.now(UTC)

        # Rejection reason update (BR-04)
        if payload.rejection_reason_code:
            app.rejection_reason_code = payload.rejection_reason_code
        if payload.rejection_notes:
            app.rejection_notes = payload.rejection_notes

        # Disbursal recording (BR-08)
        if payload.disbursal:
            d = payload.disbursal
            # BR-08: Disbursed amount cannot exceed sanctioned amount without override reason
            sanctioned = app.sanction_amount or Decimal("0")
            if d.disbursal_amount > sanctioned:
                if not d.disbursal_override_reason or not d.disbursal_override_reason.strip():
                    raise BusinessRuleViolationError(
                        f"BR-08: Disbursed amount (₹{d.disbursal_amount}) exceeds sanctioned amount "
                        f"(₹{sanctioned}). Disbursal override reason is mandatory.",
                        code="DISBURSAL_OVERRIDE_REASON_REQUIRED",
                    )

            app.disbursal_amount = d.disbursal_amount
            app.disbursal_date = d.disbursal_date
            app.disbursal_ref = d.disbursal_ref
            app.disbursal_override_reason = d.disbursal_override_reason
            app.status = APP_STATUS_DISBURSED
            app.entered_stage_at = datetime.now(UTC)

        if payload.query_notes:
            app.query_notes = payload.query_notes

        # Winning application logic (BR-05: Exactly one winning application per case, only if Disbursed)
        if payload.is_winning is True:
            if app.status != APP_STATUS_DISBURSED:
                raise BusinessRuleViolationError(
                    "BR-05: Only an application in 'disbursed' status can be marked as the winning application.",
                    code="WINNING_MUST_BE_DISBURSED",
                )

            # Unset any other winning application for this case
            await self.session.execute(
                update(LenderApplication)
                .where(
                    LenderApplication.case_id == case_id,
                    LenderApplication.org_id == org_id,
                    LenderApplication.id != app.id,
                )
                .values(is_winning=False)
            )
            app.is_winning = True

            # Advance Case status to Disbursed and record amounts
            case_stmt = select(Case).where(Case.id == case_id, Case.org_id == org_id)
            case_obj = (await self.session.execute(case_stmt)).scalar_one_or_none()
            if case_obj:
                old_case_status = case_obj.status
                case_obj.status = CASE_STATUS_DISBURSED
                case_obj.loan_amount_sanctioned = app.sanction_amount
                case_obj.loan_amount_disbursed = app.disbursal_amount
                case_obj.entered_stage_at = datetime.now(UTC)
                case_obj.updated_at = datetime.now(UTC)

                # Record status history
                hist = CaseStatusHistory(
                    id=uuid.uuid4(),
                    org_id=org_id,
                    case_id=case_obj.id,
                    from_status=old_case_status,
                    to_status=CASE_STATUS_DISBURSED,
                    reason=f"Winning lender application {app.id} disbursed",
                    changed_by=actor_id,
                )
                self.session.add(hist)

                await self.audit.log_event(
                    org_id=org_id,
                    action="lender_app.winning_set",
                    entity_type="lender_application",
                    actor_id=actor_id,
                    actor_role=actor_role,
                    entity_id=str(app.id),
                    changes={"case_id": str(case_id), "is_winning": True},
                )
        elif payload.is_winning is False:
            app.is_winning = False

        app.version += 1
        app.updated_at = datetime.now(UTC)

        await self.session.commit()
        await self.session.refresh(app)

        # Trigger PDD auto-creation & Payout expectation upon application disbursal
        if app.status == APP_STATUS_DISBURSED and before_state.get("status") != APP_STATUS_DISBURSED:
            from app.modules.pdd.service import PDDService

            pdd_service = PDDService(self.session)
            await pdd_service.auto_create_pdd_items_on_disbursal(
                org_id=org_id,
                case_id=case_id,
                application_id=app.id,
                disbursal_date=app.disbursal_date or datetime.now(UTC).date(),
                actor_id=actor_id,
                actor_role=actor_role,
            )

            from app.modules.payout.service import PayoutService

            payout_service = PayoutService(self.session)
            await payout_service.calculate_expectation_on_disbursal(
                org_id=org_id,
                case_id=case_id,
                application_id=app.id,
                actor_id=actor_id,
                actor_role=actor_role,
            )

        await self.audit.log_event(
            org_id=org_id,
            action="lender_app.updated",
            entity_type="lender_application",
            actor_id=actor_id,
            actor_role=actor_role,
            entity_id=str(app.id),
            changes={
                "before": before_state,
                "after": {
                    "status": app.status,
                    "is_winning": app.is_winning,
                    "sanction_amount": str(app.sanction_amount) if app.sanction_amount else None,
                    "disbursal_amount": str(app.disbursal_amount) if app.disbursal_amount else None,
                },
            },
        )

        sla_info = compute_stage_sla(
            entered_stage_at=app.entered_stage_at,
            status=app.status,
            entity_type="lender_application",
        )

        return LenderApplicationResponse(
            id=app.id,
            org_id=app.org_id,
            case_id=app.case_id,
            lender_id=app.lender_id,
            lender_name=app.lender.name if app.lender else None,
            product=app.product,
            login_ref=app.login_ref,
            login_date=app.login_date,
            status=app.status,
            query_notes=app.query_notes,
            sanction_amount=app.sanction_amount,
            sanction_tenure_months=app.sanction_tenure_months,
            sanction_rate=app.sanction_rate,
            sanction_margin_money=app.sanction_margin_money,
            sanction_date=app.sanction_date,
            rejection_reason_code=app.rejection_reason_code,
            rejection_notes=app.rejection_notes,
            disbursal_date=app.disbursal_date,
            disbursal_amount=app.disbursal_amount,
            disbursal_ref=app.disbursal_ref,
            disbursal_override_reason=app.disbursal_override_reason,
            is_winning=app.is_winning,
            version=app.version,
            sla=sla_info,
            created_at=app.created_at,
            updated_at=app.updated_at,
        )
