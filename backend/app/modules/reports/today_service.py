"""
DSA OS — Today Console Service

Implements the central operational cockpit (IF-3):
- Tasks due today
- Overdue tasks
- Stuck cases (stage ageing > SLA)
- Expiring documents (within 30 days)
- Post-Disbursal Documents (PDD) due/overdue
"""

import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.cases.models import Case
from app.modules.documents.models import Document
from app.modules.lenders.models import LenderApplication
from app.modules.pdd.models import PDDItem
from app.modules.reports.schemas import (
    DuePDDItem,
    ExpiringDocumentItem,
    StuckCaseItem,
    TodayCounts,
    TodayTaskItem,
    TodayViewResponse,
)
from app.modules.workflow.models import SLAConfig, Task


class TodayService:
    """Service providing real-time daily operational cockpit items."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_today_view(
        self,
        owner_id: uuid.UUID | None = None,
    ) -> TodayViewResponse:
        now = datetime.now(UTC)
        today_date = now.date()

        # ---------------------------------------------------------------------
        # 1. Tasks: Due Today & Overdue
        # ---------------------------------------------------------------------
        task_query = (
            select(Task)
            .options(
                selectinload(Task.case),
                selectinload(Task.owner),
            )
            .where(Task.status == "pending")
        )
        if owner_id:
            task_query = task_query.where(Task.owner_id == owner_id)

        task_res = await self.session.execute(task_query)
        all_pending_tasks = task_res.scalars().all()

        tasks_due_today: list[TodayTaskItem] = []
        tasks_overdue: list[TodayTaskItem] = []

        for t in all_pending_tasks:
            if t.status != "pending":
                continue
            t_due_date = t.due_date.date() if isinstance(t.due_date, datetime) else t.due_date
            c_no = t.case.case_no if t.case else None
            app_name = None  # Could be derived from primary party
            owner_name = t.owner.name if t.owner else None

            item = TodayTaskItem(
                id=t.id,
                title=t.title,
                type=t.type,
                due_date=t.due_date,
                status=t.status,
                case_id=t.case_id,
                case_no=c_no,
                applicant_name=app_name,
                owner_name=owner_name,
            )

            if t_due_date == today_date:
                tasks_due_today.append(item)
            elif t_due_date < today_date:
                tasks_overdue.append(item)

        # ---------------------------------------------------------------------
        # 2. Stuck Cases (Ageing > SLA)
        # ---------------------------------------------------------------------
        sla_res = await self.session.execute(
            select(SLAConfig).where(SLAConfig.entity_type == "case", SLAConfig.is_active.is_(True))
        )
        sla_map = {s.status: s.sla_hours for s in sla_res.scalars().all()}

        case_query = (
            select(Case)
            .options(selectinload(Case.owner))
            .where(Case.status.not_in(["closed", "rejected", "withdrawn"]))
        )
        if owner_id:
            case_query = case_query.where(Case.owner_id == owner_id)

        cases_res = await self.session.execute(case_query)
        active_cases = cases_res.scalars().all()

        stuck_cases: list[StuckCaseItem] = []
        for c in active_cases:
            c_entered = c.entered_stage_at or c.created_at or now
            diff_hours = (now - c_entered).total_seconds() / 3600.0
            sla_hours = sla_map.get(c.status, 48)
            if diff_hours > sla_hours:
                stuck_cases.append(
                    StuckCaseItem(
                        case_id=c.id,
                        case_no=c.case_no,
                        applicant_name=None,
                        stage=c.status,
                        entered_stage_at=c_entered,
                        ageing_hours=Decimal(str(round(diff_hours, 1))),
                        sla_hours=sla_hours,
                        owner_name=c.owner.name if c.owner else None,
                    )
                )

        # ---------------------------------------------------------------------
        # 3. Expiring Documents (expires_at within 30 days)
        # ---------------------------------------------------------------------
        expiry_cutoff = now + timedelta(days=30)
        doc_query = (
            select(Document)
            .options(
                selectinload(Document.document_type),
            )
            .where(
                Document.expires_at.is_not(None),
                Document.expires_at <= expiry_cutoff,
                Document.status != "archived",
            )
        )
        if owner_id:
            doc_query = doc_query.join(Case, Document.case_id == Case.id).where(Case.owner_id == owner_id)

        docs_res = await self.session.execute(doc_query)
        docs = docs_res.scalars().all()

        expiring_documents: list[ExpiringDocumentItem] = []
        for d in docs:
            days_left = max(0, (d.expires_at.date() - today_date).days) if d.expires_at else 0
            if d.expires_at is not None:
                expiring_documents.append(
                    ExpiringDocumentItem(
                        document_id=d.id,
                        case_id=d.case_id,
                        case_no=None,
                        document_name=d.file_name,
                        document_type_name=d.document_type.name if d.document_type else "Document",
                        expires_at=d.expires_at,
                        days_until_expiry=days_left,
                    )
                )

        # ---------------------------------------------------------------------
        # 4. Due / Overdue PDD Items
        # ---------------------------------------------------------------------
        pdd_query = (
            select(PDDItem)
            .options(
                selectinload(PDDItem.case),
                selectinload(PDDItem.lender_application).selectinload(LenderApplication.lender),
            )
            .where(
                PDDItem.status.in_(["pending", "collected"]),
                PDDItem.due_date <= today_date,
            )
        )
        if owner_id:
            pdd_query = pdd_query.join(Case, PDDItem.case_id == Case.id).where(Case.owner_id == owner_id)

        pdd_res = await self.session.execute(pdd_query)
        pdd_items = pdd_res.scalars().all()

        due_pdd_items: list[DuePDDItem] = []
        for p in pdd_items:
            l_name = None
            if p.lender_application and p.lender_application.lender:
                l_name = p.lender_application.lender.name

            due_pdd_items.append(
                DuePDDItem(
                    id=p.id,
                    case_id=p.case_id,
                    case_no=p.case.case_no if p.case else None,
                    document_type=p.document_type,
                    title=p.title,
                    due_date=p.due_date,
                    status=p.status,
                    lender_name=l_name,
                )
            )

        counts = TodayCounts(
            due_today_count=len(tasks_due_today),
            overdue_count=len(tasks_overdue),
            stuck_cases_count=len(stuck_cases),
            expiring_docs_count=len(expiring_documents),
            pdd_due_count=len(due_pdd_items),
        )

        return TodayViewResponse(
            tasks_due_today=tasks_due_today,
            tasks_overdue=tasks_overdue,
            stuck_cases=stuck_cases,
            expiring_documents=expiring_documents,
            pdd_items_due=due_pdd_items,
            counts=counts,
        )
