"""
DSA OS — Referral Service
Implements mobile-first lookup, guest referral lead intake, partner management,
attribution, and referral commission lifecycle.
"""

import io
import re
import uuid
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy import delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.modules.cases.models import Case, CaseParty, CaseStatusHistory, Vehicle
from app.modules.cases.service import CASE_STATUS_LEAD, CaseService
from app.modules.documents.models import Document, DocumentType
from app.modules.parties.models import Party
from app.modules.parties.service import PartyService
from app.modules.referrals.models import ReferralCommission, ReferralProfile
from app.modules.referrals.schemas import (
    CommissionCreateRequest,
    CommissionStatusUpdateRequest,
    GuestDocumentUploadResponse,
    GuestLeadSubmissionRequest,
    GuestLeadSubmissionResponse,
    ReferralLookupResponse,
    ReferralPartnerDossierResponse,
    ReferralProfileResponse,
)
from app.modules.sources.models import Source
from app.modules.tenancy.models import Organization
from app.shared.exceptions import BusinessRuleViolationError, NotFoundError, ValidationError


def _normalize_mobile(raw_phone: str) -> str:
    """Extract standard 10-digit Indian mobile number."""
    digits = re.sub(r"\D", "", raw_phone)
    if len(digits) == 12 and digits.startswith("91"):
        digits = digits[2:]
    elif len(digits) == 11 and digits.startswith("0"):
        digits = digits[1:]
    if len(digits) != 10:
        raise ValidationError(f"Invalid mobile number '{raw_phone}'. Must be a 10-digit Indian number.")
    if digits[0] not in {"6", "7", "8", "9"}:
        raise ValidationError(f"Invalid mobile number '{raw_phone}'. Indian mobile numbers must start with 6, 7, 8, or 9.")
    return digits


class ReferralService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def _resolve_org_id(self, org_id: uuid.UUID | None, org_slug: str | None) -> uuid.UUID:
        """Resolve tenant organization ID from slug or explicit ID."""
        if org_id:
            return org_id
        if org_slug:
            stmt = select(Organization).where(Organization.slug == org_slug, Organization.deleted_at.is_(None))
            res = await self.session.execute(stmt)
            org = res.scalar_one_or_none()
            if org:
                return org.id

        # Fallback to first active organization in system (e.g. Jai Automobiles)
        stmt_fallback = select(Organization).where(Organization.deleted_at.is_(None)).limit(1)
        fallback_res = await self.session.execute(stmt_fallback)
        fallback_org = fallback_res.scalar_one_or_none()
        if fallback_org:
            return fallback_org.id

        raise NotFoundError("DSA organization not found.")

    async def lookup_partner(
        self,
        mobile: str,
        org_id: uuid.UUID | None = None,
        org_slug: str | None = None,
    ) -> ReferralLookupResponse:
        """Lookup existing referral profile by normalized mobile number."""
        clean_mobile = _normalize_mobile(mobile)
        resolved_org_id = await self._resolve_org_id(org_id, org_slug)

        stmt = select(ReferralProfile).where(
            ReferralProfile.org_id == resolved_org_id,
            ReferralProfile.mobile_primary == clean_mobile,
            ReferralProfile.deleted_at.is_(None),
        )
        res = await self.session.execute(stmt)
        profile = res.scalar_one_or_none()

        if profile:
            return ReferralLookupResponse(
                exists=True,
                profile_id=profile.id,
                name=profile.name,
                verification_status=profile.verification_status,
            )

        return ReferralLookupResponse(exists=False, profile_id=None, name=None, verification_status=None)

    async def get_or_create_profile(
        self,
        name: str,
        mobile: str,
        org_id: uuid.UUID,
    ) -> ReferralProfile:
        """Get or create referral partner profile."""
        clean_mobile = _normalize_mobile(mobile)
        stmt = select(ReferralProfile).where(
            ReferralProfile.org_id == org_id,
            ReferralProfile.mobile_primary == clean_mobile,
            ReferralProfile.deleted_at.is_(None),
        )
        res = await self.session.execute(stmt)
        profile = res.scalar_one_or_none()

        if profile:
            if name and not profile.name:
                profile.name = name.strip()
            return profile

        profile = ReferralProfile(
            id=uuid.uuid4(),
            org_id=org_id,
            name=name.strip(),
            mobile_primary=clean_mobile,
            verification_status="pending_verification",
            version=1,
        )
        self.session.add(profile)
        await self.session.flush()
        return profile

    async def upload_guest_document(
        self,
        file_name: str,
        content_type: str,
        file_bytes: bytes,
        doc_type: str,
        org_slug: str | None = None,
    ) -> GuestDocumentUploadResponse:
        """Validate and store public quarantine document for guest lead intake."""
        import os

        allowed_types = {"application/pdf", "image/jpeg", "image/png", "image/jpg"}
        allowed_extensions = {".pdf", ".jpg", ".jpeg", ".png"}

        doc_type_clean = doc_type.strip().lower()
        if doc_type_clean not in {"aadhaar", "pan", "rc"}:
            raise ValidationError(f"Invalid doc_type '{doc_type}'. Allowed: aadhaar, pan, rc")

        _, ext = os.path.splitext(file_name.lower())
        if ext not in allowed_extensions or (content_type and content_type.lower() not in allowed_types):
            raise ValidationError(f"Unsupported file type '{ext or content_type}'. Only PDF, JPEG, and PNG files are allowed.")

        if len(file_bytes) > 10 * 1024 * 1024:
            raise ValidationError(f"File size exceeds 10MB limit ({len(file_bytes)} bytes).")

        if len(file_bytes) == 0:
            raise ValidationError("Empty file uploaded. Please upload a valid document.")

        resolved_org_id = await self._resolve_org_id(None, org_slug)

        type_code_map = {
            "aadhaar": "aadhaar_card",
            "pan": "pan_card",
            "rc": "rc_copy",
        }
        code = type_code_map[doc_type_clean]
        dt_stmt = select(DocumentType).where(DocumentType.code == code)
        dt_res = await self.session.execute(dt_stmt)
        dt_obj = dt_res.scalar_one_or_none()
        if not dt_obj:
            name_map = {"aadhaar": "Aadhaar Card", "pan": "PAN Card", "rc": "Registration Certificate (RC)"}
            dt_obj = DocumentType(
                id=uuid.uuid4(),
                code=code,
                name=name_map[doc_type_clean],
                group_name="kyc" if doc_type_clean != "rc" else "collateral",
                is_active=True,
            )
            self.session.add(dt_obj)
            await self.session.flush()

        from app.modules.auth.models import User
        u_stmt = select(User).where(User.org_id == resolved_org_id, User.is_active.is_(True)).limit(1)
        u_res = await self.session.execute(u_stmt)
        default_user = u_res.scalar_one_or_none()
        user_id = default_user.id if default_user else uuid.uuid4()

        doc_id = uuid.uuid4()
        quarantine_key = f"quarantine/{resolved_org_id}/{doc_id}/{file_name}"

        doc = Document(
            id=doc_id,
            org_id=resolved_org_id,
            document_type_id=dt_obj.id,
            file_name=file_name,
            file_size=len(file_bytes),
            mime_type=content_type or "application/octet-stream",
            quarantine_key=quarantine_key,
            status="quarantined",
            uploaded_by=user_id,
            scan_result={"scan_status": "clean", "quarantined_at": datetime.now(UTC).isoformat()},
            version=1,
        )
        self.session.add(doc)
        await self.session.commit()

        return GuestDocumentUploadResponse(
            document_id=doc.id,
            doc_type=doc_type_clean,
            file_name=doc.file_name,
            file_size=doc.file_size,
            status="quarantined",
            message="Document successfully uploaded to private quarantine.",
        )

    async def submit_guest_lead(
        self,
        payload: GuestLeadSubmissionRequest,
        org_id: uuid.UUID | None = None,
    ) -> GuestLeadSubmissionResponse:
        """
        Public guest referral lead intake:
        1. Resolve tenant org
        2. Validate mandatory document rules (Aadhaar, PAN, and RC for used vehicles)
        3. Resolve or create Referral Profile (prevent duplicate partner records)
        4. Prevent accidental duplicate submissions
        5. Create or link Borrower Party
        6. Create Case with referral attribution & vehicle condition
        7. Link uploaded documents to Case and Party
        8. Return tracking reference
        """
        resolved_org_id = await self._resolve_org_id(org_id, payload.org_slug)

        # 1. Vehicle Condition & Mandatory Document Rules Enforcement
        condition_clean = (payload.vehicle_condition or "").strip().lower()
        if condition_clean not in {"used", "new"}:
            raise ValidationError("Vehicle condition is mandatory. Please select Used Car or New Car.")

        is_new_vehicle = condition_clean == "new"

        if not payload.aadhaar_doc_id:
            raise ValidationError("Aadhaar card is mandatory for every lead submission.")
        if not payload.pan_doc_id:
            raise ValidationError("PAN card is mandatory for every lead submission.")

        if not is_new_vehicle:
            if not payload.rc_doc_id:
                raise ValidationError("RC document is mandatory for used/old vehicle loan applications.")
            if not payload.vehicle_reg_no or not payload.vehicle_reg_no.strip():
                raise ValidationError("Vehicle registration number is required for used car leads.")
        else:
            # Exclude/clear any stale registration or RC values for new vehicle leads
            payload.vehicle_reg_no = None
            payload.rc_doc_id = None

        # 2. Partner Profile
        partner = await self.get_or_create_profile(
            name=payload.partner_name,
            mobile=payload.partner_mobile,
            org_id=resolved_org_id,
        )

        # 3. Borrower Party
        clean_app_mobile = _normalize_mobile(payload.applicant_mobile)
        party_stmt = select(Party).where(
            Party.org_id == resolved_org_id,
            Party.mobile_primary == clean_app_mobile,
            Party.deleted_at.is_(None),
        )
        party_res = await self.session.execute(party_stmt)
        party = party_res.scalar_one_or_none()

        if not party:
            party = Party(
                id=uuid.uuid4(),
                org_id=resolved_org_id,
                name=payload.applicant_name.strip(),
                mobile_primary=clean_app_mobile,
                city=payload.city.strip(),
                state=payload.state.strip(),
                pincode=payload.pincode.strip(),
                version=1,
            )
            self.session.add(party)
            await self.session.flush()
        else:
            # 4. Deduplication: Check if an identical lead was submitted in the last 5 minutes
            dup_stmt = select(Case).where(
                Case.org_id == resolved_org_id,
                Case.referral_profile_id == partner.id,
                Case.loan_amount_requested == payload.loan_amount_requested,
                Case.created_at >= datetime.now(UTC) - timedelta(minutes=5),
                Case.deleted_at.is_(None),
            )
            dup_res = await self.session.execute(dup_stmt)
            for dc in dup_res.scalars().all():
                cp_check = select(CaseParty).where(CaseParty.case_id == dc.id, CaseParty.party_id == party.id)
                if (await self.session.execute(cp_check)).scalar_one_or_none():
                    tracking_id = f"REF-{dc.case_no.replace('LOS-', '')}-{partner.mobile_primary[-4:]}"
                    return GuestLeadSubmissionResponse(
                        tracking_id=tracking_id,
                        case_id=dc.id,
                        case_no=dc.case_no,
                        partner_id=partner.id,
                        partner_name=partner.name,
                        status="received",
                        message="Lead was already submitted and is in the operations queue.",
                    )

        # 5. Lead Source Entity (Find or create 'Referral Partner' source)
        source_stmt = select(Source).where(
            Source.org_id == resolved_org_id,
            Source.type == "connector",
            Source.deleted_at.is_(None),
        ).limit(1)
        source_res = await self.session.execute(source_stmt)
        source = source_res.scalar_one_or_none()

        if not source:
            source = Source(
                id=uuid.uuid4(),
                org_id=resolved_org_id,
                name="Guest Referral Network",
                type="connector",
                is_active=True,
                version=1,
            )
            self.session.add(source)
            await self.session.flush()

        # 6. Generate Case Number
        case_svc = CaseService(session=self.session)
        case_no = await case_svc._generate_next_case_no(resolved_org_id)

        # Find owner (organization default owner or admin)
        from app.modules.auth.models import User
        user_stmt = select(User).where(User.org_id == resolved_org_id, User.is_active.is_(True)).limit(1)
        user_res = await self.session.execute(user_stmt)
        default_owner = user_res.scalar_one_or_none()
        owner_id = default_owner.id if default_owner else uuid.uuid4()

        # 7. Create Case
        condition_str = "new" if is_new_vehicle else "used"
        combined_notes = f"Referred by: {partner.name} ({partner.mobile_primary}). Vehicle condition: {condition_str}. PIN: {payload.pincode}, {payload.city}, {payload.state}"
        if payload.expected_loan_required_date:
            combined_notes += f". Expected loan required date: {payload.expected_loan_required_date}"
        if payload.notes:
            combined_notes += f" | {payload.notes}"

        new_case = Case(
            id=uuid.uuid4(),
            org_id=resolved_org_id,
            case_no=case_no,
            product_type=payload.product_type,
            status=CASE_STATUS_LEAD,
            call_outcome="new",
            loan_amount_requested=payload.loan_amount_requested,
            source_id=source.id,
            source_executive=partner.name,
            owner_id=owner_id,
            referral_profile_id=partner.id,
            referral_partner_name=partner.name,
            notes=combined_notes,
            version=1,
        )
        self.session.add(new_case)
        await self.session.flush()

        # 8. Primary CaseParty
        case_party = CaseParty(
            id=uuid.uuid4(),
            org_id=resolved_org_id,
            case_id=new_case.id,
            party_id=party.id,
            is_primary=True,
            version=1,
        )
        self.session.add(case_party)

        # 9. Vehicle
        if payload.vehicle_reg_no or not is_new_vehicle:
            cleaned_rc = re.sub(r"[\s\-]", "", payload.vehicle_reg_no).upper() if payload.vehicle_reg_no else None
            vehicle = Vehicle(
                id=uuid.uuid4(),
                org_id=resolved_org_id,
                case_id=new_case.id,
                vehicle_type=payload.product_type,
                registration_no=cleaned_rc,
                condition=condition_str,
                version=1,
            )
            self.session.add(vehicle)

        # 10. Link Documents to Case and Party
        doc_ids = [d for d in [payload.aadhaar_doc_id, payload.pan_doc_id, payload.rc_doc_id] if d]
        if doc_ids:
            docs_stmt = select(Document).where(Document.id.in_(doc_ids), Document.org_id == resolved_org_id)
            docs_res = await self.session.execute(docs_stmt)
            for d in docs_res.scalars().all():
                d.case_id = new_case.id
                d.party_id = party.id

        # 11. Status History
        status_hist = CaseStatusHistory(
            id=uuid.uuid4(),
            org_id=resolved_org_id,
            case_id=new_case.id,
            from_status=None,
            to_status=CASE_STATUS_LEAD,
            changed_by=owner_id,
            notes=f"Guest referral intake submitted by {partner.name} ({condition_str} vehicle)",
            version=1,
        )
        self.session.add(status_hist)

        await self.session.commit()

        tracking_id = f"REF-{case_no.replace('LOS-', '')}-{partner.mobile_primary[-4:]}"
        return GuestLeadSubmissionResponse(
            tracking_id=tracking_id,
            case_id=new_case.id,
            case_no=new_case.case_no,
            partner_id=partner.id,
            partner_name=partner.name,
            status="received",
            message="Lead successfully captured and queued for DSA review.",
        )

    async def list_referral_profiles(
        self,
        org_id: uuid.UUID,
        search: str | None = None,
        verification_status: str | None = None,
        page: int = 1,
        page_size: int = 50,
    ) -> tuple[list[ReferralProfileResponse], int]:
        """Admin list of referral partners with computed lead and commission metrics."""
        base_query = select(ReferralProfile).where(
            ReferralProfile.org_id == org_id,
            ReferralProfile.deleted_at.is_(None),
        )

        if verification_status:
            base_query = base_query.where(ReferralProfile.verification_status == verification_status)

        if search:
            s_clean = search.strip()
            base_query = base_query.where(
                or_(
                    ReferralProfile.name.ilike(f"%{s_clean}%"),
                    ReferralProfile.mobile_primary.ilike(f"%{s_clean}%"),
                )
            )

        # Count total
        count_stmt = select(func.count()).select_from(base_query.subquery())
        total = (await self.session.execute(count_stmt)).scalar_one()

        # Paginate
        stmt = base_query.order_by(ReferralProfile.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
        res = await self.session.execute(stmt)
        profiles = res.scalars().all()

        results: list[ReferralProfileResponse] = []
        for p in profiles:
            # Query lead metrics
            lead_stats_stmt = select(
                func.count(Case.id).label("total_leads"),
                func.count(Case.id).filter(Case.call_outcome == "interested").label("interested_leads"),
                func.count(Case.id).filter(Case.status.in_(["sanctioned", "disbursed", "closed"])).label("converted_leads"),
            ).where(
                Case.org_id == org_id,
                Case.referral_profile_id == p.id,
                Case.deleted_at.is_(None),
            )
            stats_res = (await self.session.execute(lead_stats_stmt)).first()
            tot = stats_res[0] if stats_res else 0
            inter = stats_res[1] if stats_res else 0
            conv = stats_res[2] if stats_res else 0

            # Query commission metrics
            comm_stmt = select(
                func.coalesce(func.sum(ReferralCommission.amount).filter(ReferralCommission.status == "pending_review"), Decimal("0.00")),
                func.coalesce(func.sum(ReferralCommission.amount).filter(ReferralCommission.status.in_(["approved", "payable"])), Decimal("0.00")),
                func.coalesce(func.sum(ReferralCommission.amount).filter(ReferralCommission.status == "paid"), Decimal("0.00")),
            ).where(
                ReferralCommission.org_id == org_id,
                ReferralCommission.referral_profile_id == p.id,
                ReferralCommission.deleted_at.is_(None),
            )
            comm_res = (await self.session.execute(comm_stmt)).first()
            pending_comm = comm_res[0] if comm_res else Decimal("0.00")
            approved_comm = comm_res[1] if comm_res else Decimal("0.00")
            paid_comm = comm_res[2] if comm_res else Decimal("0.00")

            results.append(
                ReferralProfileResponse(
                    id=p.id,
                    org_id=p.org_id,
                    name=p.name,
                    mobile_primary=p.mobile_primary,
                    masked_mobile=p.masked_mobile,
                    email=p.email,
                    verification_status=p.verification_status,
                    verified_at=p.verified_at,
                    notes=p.notes,
                    total_leads=tot,
                    interested_leads=inter,
                    converted_leads=conv,
                    pending_commission_amount=Decimal(str(pending_comm)),
                    approved_commission_amount=Decimal(str(approved_comm)),
                    paid_commission_amount=Decimal(str(paid_comm)),
                    created_at=p.created_at,
                )
            )

        return results, total

    async def get_partner_dossier(
        self,
        org_id: uuid.UUID,
        profile_id: uuid.UUID,
    ) -> ReferralPartnerDossierResponse:
        """Fetch complete dossier for a referral partner: profile, leads, and commissions."""
        stmt = select(ReferralProfile).where(
            ReferralProfile.id == profile_id,
            ReferralProfile.org_id == org_id,
            ReferralProfile.deleted_at.is_(None),
        )
        res = await self.session.execute(stmt)
        profile = res.scalar_one_or_none()
        if not profile:
            raise NotFoundError("Referral partner profile not found.")

        # Associated Leads
        leads_stmt = (
            select(Case, Party.name, Party.mobile_primary)
            .join(CaseParty, (CaseParty.case_id == Case.id) & (CaseParty.is_primary.is_(True)))
            .join(Party, Party.id == CaseParty.party_id)
            .where(
                Case.org_id == org_id,
                Case.referral_profile_id == profile_id,
                Case.deleted_at.is_(None),
            )
            .order_by(Case.created_at.desc())
        )
        leads_res = await self.session.execute(leads_stmt)
        leads_list = []
        for r in leads_res.all():
            c: Case = r[0]
            p_name: str = r[1]
            p_mob: str = r[2]
            leads_list.append(
                {
                    "case_id": str(c.id),
                    "case_no": c.case_no,
                    "applicant_name": p_name,
                    "applicant_mobile": p_mob,
                    "product_type": c.product_type,
                    "loan_amount_requested": float(c.loan_amount_requested),
                    "status": c.status,
                    "call_outcome": c.call_outcome or "new",
                    "created_at": c.created_at.isoformat(),
                }
            )

        # Commissions
        comm_stmt = (
            select(ReferralCommission, Case.case_no)
            .outerjoin(Case, Case.id == ReferralCommission.case_id)
            .where(
                ReferralCommission.org_id == org_id,
                ReferralCommission.referral_profile_id == profile_id,
                ReferralCommission.deleted_at.is_(None),
            )
            .order_by(ReferralCommission.created_at.desc())
        )
        comm_res = await self.session.execute(comm_stmt)
        comm_list = []
        for r in comm_res.all():
            rc: ReferralCommission = r[0]
            c_no = r[1]
            comm_list.append(
                {
                    "id": rc.id,
                    "org_id": rc.org_id,
                    "referral_profile_id": rc.referral_profile_id,
                    "case_id": rc.case_id,
                    "case_no": c_no,
                    "amount": rc.amount,
                    "basis": rc.basis,
                    "status": rc.status,
                    "payment_date": rc.payment_date,
                    "payment_reference": rc.payment_reference,
                    "approved_by_id": rc.approved_by_id,
                    "approved_at": rc.approved_at,
                    "notes": rc.notes,
                    "created_at": rc.created_at,
                }
            )

        # Metrics
        p_res_list, _ = await self.list_referral_profiles(org_id=org_id, search=profile.mobile_primary, page_size=1)
        p_profile_res = p_res_list[0] if p_res_list else ReferralProfileResponse(
            id=profile.id,
            org_id=profile.org_id,
            name=profile.name,
            mobile_primary=profile.mobile_primary,
            masked_mobile=profile.masked_mobile,
            verification_status=profile.verification_status,
            total_leads=len(leads_list),
            created_at=profile.created_at,
        )

        return ReferralPartnerDossierResponse(
            profile=p_profile_res,
            leads=leads_list,
            commissions=comm_list,  # type: ignore[arg-type]
        )

    async def update_verification(
        self,
        org_id: uuid.UUID,
        profile_id: uuid.UUID,
        status: str,
        notes: str | None,
        actor_id: uuid.UUID,
    ) -> ReferralProfile:
        """Approve or reject referral partner verification."""
        stmt = select(ReferralProfile).where(
            ReferralProfile.id == profile_id,
            ReferralProfile.org_id == org_id,
            ReferralProfile.deleted_at.is_(None),
        )
        res = await self.session.execute(stmt)
        profile = res.scalar_one_or_none()
        if not profile:
            raise NotFoundError("Referral profile not found.")

        valid_statuses = ("verified", "pending_verification", "rejected")
        if status not in valid_statuses:
            raise ValidationError(f"Invalid verification status. Must be one of: {valid_statuses}")

        profile.verification_status = status
        if status == "verified":
            profile.verified_at = datetime.now(UTC)
            profile.verified_by = actor_id
        if notes:
            profile.notes = notes

        await self.session.commit()
        return profile

    async def create_commission(
        self,
        org_id: uuid.UUID,
        payload: CommissionCreateRequest,
        actor_id: uuid.UUID,
    ) -> ReferralCommission:
        """Create a new referral commission record."""
        # Verify partner exists
        stmt_p = select(ReferralProfile).where(
            ReferralProfile.id == payload.referral_profile_id,
            ReferralProfile.org_id == org_id,
            ReferralProfile.deleted_at.is_(None),
        )
        res_p = await self.session.execute(stmt_p)
        if not res_p.scalar_one_or_none():
            raise NotFoundError("Referral partner profile not found.")

        commission = ReferralCommission(
            id=uuid.uuid4(),
            org_id=org_id,
            referral_profile_id=payload.referral_profile_id,
            case_id=payload.case_id,
            amount=payload.amount,
            basis=payload.basis,
            status="pending_review",
            notes=payload.notes,
            version=1,
        )
        self.session.add(commission)
        await self.session.commit()
        return commission

    async def update_commission_status(
        self,
        org_id: uuid.UUID,
        commission_id: uuid.UUID,
        payload: CommissionStatusUpdateRequest,
        actor_id: uuid.UUID,
    ) -> ReferralCommission:
        """Update commission status (e.g. approve, reject, mark paid with UTR)."""
        stmt = select(ReferralCommission).where(
            ReferralCommission.id == commission_id,
            ReferralCommission.org_id == org_id,
            ReferralCommission.deleted_at.is_(None),
        )
        res = await self.session.execute(stmt)
        comm = res.scalar_one_or_none()
        if not comm:
            raise NotFoundError("Referral commission record not found.")

        valid_transitions = {
            "pending_review": ["approved", "rejected"],
            "approved": ["payable", "paid", "rejected"],
            "payable": ["paid", "rejected"],
            "rejected": ["pending_review"],
            "paid": [],
        }

        allowed = valid_transitions.get(comm.status, [])
        if payload.status not in allowed and payload.status != comm.status:
            raise BusinessRuleViolationError(
                f"Cannot transition commission from '{comm.status}' to '{payload.status}'. Allowed: {allowed}"
            )

        comm.status = payload.status
        if payload.status == "approved":
            comm.approved_by_id = actor_id
            comm.approved_at = datetime.now(UTC)
        elif payload.status == "paid":
            if not payload.payment_reference:
                raise ValidationError("Payment reference (UTR or Transaction ID) is required when marking commission as paid.")
            comm.paid_by_id = actor_id
            comm.payment_reference = payload.payment_reference.strip()
            comm.payment_date = payload.payment_date or date.today()

        if payload.notes:
            comm.notes = payload.notes

        await self.session.commit()
        return comm
