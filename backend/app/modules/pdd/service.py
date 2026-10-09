"""
DSA OS — Post-Disbursal Documents (PDD) Service
Handles auto-creation on disbursal, status lifecycle, ageing buckets, and audit logging.
"""

import uuid
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.audit.service import AuditService
from app.modules.lenders.models import LenderApplication
from app.modules.pdd.models import PDDItem
from app.modules.pdd.schemas import (
    PDDBoardResponse,
    PDDItemCreateRequest,
    PDDItemResponse,
    PDDItemUpdateRequest,
)
from app.shared.exceptions import (
    BusinessRuleViolationError,
    ConflictError,
    NotFoundError,
)


class PDDService:
    """Core domain service for Post-Disbursal Documents (PDD) lifecycle."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.audit = AuditService(session=session)

    async def auto_create_pdd_items_on_disbursal(
        self,
        org_id: uuid.UUID,
        case_id: uuid.UUID,
        application_id: uuid.UUID,
        disbursal_date: date,
        actor_id: uuid.UUID,
        actor_role: str,
    ) -> list[PDDItem]:
        """
        Auto-create standard PDD checklist items upon loan disbursal.
        Enforces standard vehicle loan post-disbursal deliverables:
        1. RC Hypothecation Endorsement (due +45d)
        2. Insurance with Hypothecation Clause (due +15d)
        3. Tax Invoice & Delivery Challan (due +7d)
        4. Form 34 Notice of Hypothecation (due +30d)
        """
        # Idempotency check: don't duplicate if items already exist for this application
        stmt_check = select(PDDItem).where(
            PDDItem.org_id == org_id,
            PDDItem.lender_application_id == application_id,
        )
        existing = (await self.session.execute(stmt_check)).scalars().all()
        if existing:
            return list(existing)

        standard_items = [
            (
                "invoice_challan",
                "Tax Invoice & Delivery Challan",
                "Original dealer invoice and signed delivery challan receipt.",
                disbursal_date + timedelta(days=7),
            ),
            (
                "insurance_clause",
                "Insurance Policy with Bank Hypothecation Clause",
                "Comprehensive vehicle insurance endorsement naming lender as financier.",
                disbursal_date + timedelta(days=15),
            ),
            (
                "form_34",
                "Form 34 RTO Notice of Hypothecation",
                "RTO acknowledgement copy of Form 34 / 35 hypothecation addition.",
                disbursal_date + timedelta(days=30),
            ),
            (
                "rc_hypothecation",
                "RC Hypothecation Endorsement",
                "Original Registration Certificate (Smart Card) with bank hypothecation endorsed.",
                disbursal_date + timedelta(days=45),
            ),
        ]

        now = datetime.now(UTC)
        created_items: list[PDDItem] = []

        for doc_type, title, desc, due in standard_items:
            item = PDDItem(
                id=uuid.uuid4(),
                org_id=org_id,
                case_id=case_id,
                lender_application_id=application_id,
                document_type=doc_type,
                title=title,
                description=desc,
                status="pending",
                due_date=due,
                version=1,
                created_at=now,
                updated_at=now,
            )
            self.session.add(item)
            created_items.append(item)

        await self.session.commit()

        await self.audit.log_event(
            org_id=org_id,
            action="pdd.auto_created",
            entity_type="pdd_item",
            actor_id=actor_id,
            actor_role=actor_role,
            entity_id=str(application_id),
            changes={"count": len(created_items), "disbursal_date": disbursal_date.isoformat()},
        )

        return created_items

    async def get_pdd_item(self, org_id: uuid.UUID, pdd_id: uuid.UUID) -> PDDItem:
        stmt = (
            select(PDDItem)
            .options(
                selectinload(PDDItem.case),
                selectinload(PDDItem.lender_application).selectinload(LenderApplication.lender),
                selectinload(PDDItem.owner),
            )
            .where(PDDItem.id == pdd_id, PDDItem.org_id == org_id)
        )
        res = await self.session.execute(stmt)
        item = res.scalar_one_or_none()
        if not item:
            raise NotFoundError(f"PDD item '{pdd_id}' not found.")
        return item

    async def create_pdd_item(
        self,
        org_id: uuid.UUID,
        payload: PDDItemCreateRequest,
        actor_id: uuid.UUID,
        actor_role: str,
    ) -> PDDItemResponse:
        now = datetime.now(UTC)
        item = PDDItem(
            id=uuid.uuid4(),
            org_id=org_id,
            case_id=payload.case_id,
            lender_application_id=payload.lender_application_id,
            document_type=payload.document_type,
            title=payload.title.strip(),
            description=payload.description.strip() if payload.description else None,
            status="pending",
            due_date=payload.due_date,
            owner_id=payload.owner_id,
            version=1,
            created_at=now,
            updated_at=now,
        )
        self.session.add(item)
        await self.session.commit()
        await self.session.refresh(item)

        await self.audit.log_event(
            org_id=org_id,
            action="pdd.created",
            entity_type="pdd_item",
            actor_id=actor_id,
            actor_role=actor_role,
            entity_id=str(item.id),
            changes={"title": item.title, "due_date": item.due_date.isoformat()},
        )

        return await self._to_response(item)

    async def update_pdd_item(
        self,
        org_id: uuid.UUID,
        pdd_id: uuid.UUID,
        payload: PDDItemUpdateRequest,
        actor_id: uuid.UUID,
        actor_role: str,
    ) -> PDDItemResponse:
        item = await self.get_pdd_item(org_id, pdd_id)

        # Optimistic locking
        if item.version != payload.version:
            raise ConflictError(
                f"PDD item version conflict: current={item.version}, provided={payload.version}. Refresh and retry."
            )

        before_state = {
            "status": item.status,
            "version": item.version,
        }

        now = datetime.now(UTC)

        if payload.status:
            # Rejection validation
            if payload.status == "rejected" and not payload.rejection_reason:
                raise BusinessRuleViolationError(
                    "Rejection reason is mandatory when marking a PDD item as rejected.",
                    code="PDD_REJECTION_REASON_REQUIRED",
                )

            item.status = payload.status
            if payload.status == "collected" and not item.collected_at:
                item.collected_at = payload.collected_at or now
            elif payload.status == "sent_to_lender" and not item.submitted_to_lender_at:
                item.submitted_to_lender_at = payload.submitted_to_lender_at or now
            elif payload.status == "acknowledged_by_lender" and not item.acknowledged_at:
                item.acknowledged_at = payload.acknowledged_at or now

        if payload.rejection_reason is not None:
            item.rejection_reason = payload.rejection_reason.strip() if payload.rejection_reason else None

        if payload.lender_acknowledgement_ref is not None:
            item.lender_acknowledgement_ref = payload.lender_acknowledgement_ref.strip() if payload.lender_acknowledgement_ref else None

        if payload.document_id is not None:
            item.document_id = payload.document_id

        if payload.owner_id is not None:
            item.owner_id = payload.owner_id

        item.version += 1
        item.updated_at = now
        await self.session.commit()
        await self.session.refresh(item)

        await self.audit.log_event(
            org_id=org_id,
            action="pdd.updated",
            entity_type="pdd_item",
            actor_id=actor_id,
            actor_role=actor_role,
            entity_id=str(item.id),
            changes={"before": before_state, "after": {"status": item.status, "version": item.version}},
        )

        # Release payout gating if all PDD items are acknowledged
        if item.status == "acknowledged_by_lender":
            from app.modules.payout.service import PayoutService

            payout_service = PayoutService(self.session)
            await payout_service.check_and_release_pdd_gate(
                org_id=org_id,
                application_id=item.lender_application_id,
                actor_id=actor_id,
                actor_role=actor_role,
            )

        return await self._to_response(item)

    async def get_pdd_items_for_application(
        self,
        org_id: uuid.UUID,
        case_id: uuid.UUID,
        application_id: uuid.UUID,
    ) -> list[PDDItemResponse]:
        stmt = (
            select(PDDItem)
            .options(
                selectinload(PDDItem.case),
                selectinload(PDDItem.lender_application).selectinload(LenderApplication.lender),
                selectinload(PDDItem.owner),
            )
            .where(
                PDDItem.org_id == org_id,
                PDDItem.case_id == case_id,
                PDDItem.lender_application_id == application_id,
            )
            .order_by(PDDItem.due_date.asc())
        )
        res = await self.session.execute(stmt)
        items = res.scalars().all()
        responses: list[PDDItemResponse] = []
        for it in items:
            responses.append(await self._to_response(it))
        return responses

    async def get_pdd_board(
        self,
        org_id: uuid.UUID,
        status: str | None = None,
        lender_id: uuid.UUID | None = None,
        bucket: str | None = None,
        owner_id: uuid.UUID | None = None,
    ) -> PDDBoardResponse:
        """
        Fetch PDD items across pipeline grouped by ageing buckets.
        Ageing buckets:
        0-7 days: Fresh
        8-15 days: Amber
        16-30 days: Orange
        30+ days: Critical Overdue (Red)
        """
        stmt = (
            select(PDDItem)
            .options(
                selectinload(PDDItem.case),
                selectinload(PDDItem.lender_application).selectinload(LenderApplication.lender),
                selectinload(PDDItem.owner),
            )
            .where(PDDItem.org_id == org_id)
        )

        if status:
            stmt = stmt.where(PDDItem.status == status)
        if owner_id:
            stmt = stmt.where(PDDItem.owner_id == owner_id)
        if lender_id:
            stmt = stmt.join(LenderApplication, LenderApplication.id == PDDItem.lender_application_id).where(
                LenderApplication.lender_id == lender_id
            )

        stmt = stmt.order_by(PDDItem.due_date.asc())
        res = await self.session.execute(stmt)
        items = res.scalars().all()

        bucket_0_7 = 0
        bucket_8_15 = 0
        bucket_16_30 = 0
        bucket_30_plus = 0
        total_pending = 0
        total_completed = 0
        processed_items: list[PDDItemResponse] = []

        for item in items:
            resp = await self._to_response(item)

            if resp.status in ("acknowledged_by_lender",):
                total_completed += 1
            else:
                total_pending += 1

            if resp.ageing_bucket == "0_7":
                bucket_0_7 += 1
            elif resp.ageing_bucket == "8_15":
                bucket_8_15 += 1
            elif resp.ageing_bucket == "16_30":
                bucket_16_30 += 1
            elif resp.ageing_bucket == "30_plus":
                bucket_30_plus += 1

            if bucket and resp.ageing_bucket != bucket:
                continue

            processed_items.append(resp)

        return PDDBoardResponse(
            bucket_0_7_count=bucket_0_7,
            bucket_8_15_count=bucket_8_15,
            bucket_16_30_count=bucket_16_30,
            bucket_30_plus_count=bucket_30_plus,
            total_pending=total_pending,
            total_completed=total_completed,
            items=processed_items,
        )

    async def _to_response(self, item: PDDItem) -> PDDItemResponse:
        today = date.today()
        # Ageing calculated from creation/disbursal
        created_dt = item.created_at.date() if isinstance(item.created_at, datetime) else today
        ageing_days = max(0, (today - created_dt).days)
        is_overdue = item.status not in ("acknowledged_by_lender",) and today > item.due_date

        if ageing_days <= 7:
            bucket = "0_7"
        elif ageing_days <= 15:
            bucket = "8_15"
        elif ageing_days <= 30:
            bucket = "16_30"
        else:
            bucket = "30_plus"

        # Case applicant name resolution
        applicant_name = None
        case_no = None
        if item.case:
            case_no = item.case.case_no

        lender_name = None
        if item.lender_application and item.lender_application.lender:
            lender_name = item.lender_application.lender.name

        return PDDItemResponse(
            id=item.id,
            org_id=item.org_id,
            case_id=item.case_id,
            case_no=case_no,
            applicant_name=applicant_name,
            lender_application_id=item.lender_application_id,
            lender_name=lender_name,
            document_type=item.document_type,
            title=item.title,
            description=item.description,
            status=item.status,
            due_date=item.due_date,
            collected_at=item.collected_at,
            submitted_to_lender_at=item.submitted_to_lender_at,
            acknowledged_at=item.acknowledged_at,
            rejection_reason=item.rejection_reason,
            lender_acknowledgement_ref=item.lender_acknowledgement_ref,
            document_id=item.document_id,
            owner_id=item.owner_id,
            owner_name=item.owner.name if item.owner else None,
            ageing_days=ageing_days,
            ageing_bucket=bucket,
            is_overdue=is_overdue,
            version=item.version,
            created_at=item.created_at,
            updated_at=item.updated_at,
        )
