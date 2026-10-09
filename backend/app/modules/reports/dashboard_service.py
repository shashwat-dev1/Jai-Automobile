"""
DSA OS — Dashboard Aggregation Service

Computes real-time operational metrics for:
- Executive operations console
- Pipeline summary and stage velocity
- Payout performance and reconciliation status
- Monthly commission trends
- Top dealer/source rankings
- Operational attention queue (stuck cases, urgent tasks, overdue PDD)

Zero floating point arithmetic. Pure Decimal calculations.
Respects tenant isolation and Field Executive scoping.
"""

import uuid
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.cases.models import Case
from app.modules.documents.models import Document
from app.modules.payout.models import PayoutExpectation
from app.modules.payout.reconciliation.models import Reconciliation
from app.modules.pdd.models import PDDItem
from app.modules.reports.schemas import (
    AttentionItemsSummary,
    DashboardOverviewResponse,
    FunnelStageItem,
    MonthlyCommissionItem,
    PayoutSummary,
    PipelineResponse,
    PipelineStageDetail,
    PipelineSummary,
    TopSourceItem,
)
from app.modules.sources.models import Source
from app.modules.workflow.models import SLAConfig, Task

CANONICAL_STAGES: list[tuple[str, str]] = [
    ("lead", "Lead Inflow"),
    ("documents_pending", "Docs Pending"),
    ("logged_in", "Logged In"),
    ("sanctioned", "Sanctioned"),
    ("disbursed", "Disbursed"),
    ("pdd_pending", "PDD Pending"),
    ("pdd_completed", "PDD Completed"),
    ("closed", "Closed / Settled"),
]


class DashboardService:
    """Service generating business overview metrics from live tenant data."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_overview(
        self,
        date_from: date | None = None,
        date_to: date | None = None,
        owner_id: uuid.UUID | None = None,
    ) -> DashboardOverviewResponse:
        """
        Aggregate live metrics across pipeline, payout, funnel, sources, and attention items.
        If owner_id is provided (e.g. Field Executive), filter case-related queries.
        """
        pipeline_summary = await self._get_pipeline_summary(date_from, date_to, owner_id)
        payout_summary = await self._get_payout_summary(date_from, date_to, owner_id)
        monthly_commission = await self._get_monthly_commission(owner_id)
        funnel_stages = await self._get_funnel_stages(owner_id)
        top_sources = await self._get_top_sources(owner_id)
        attention_items = await self._get_attention_items(owner_id)

        return DashboardOverviewResponse(
            pipeline_summary=pipeline_summary,
            payout_summary=payout_summary,
            monthly_commission=monthly_commission,
            funnel_stages=funnel_stages,
            top_sources=top_sources,
            attention_items=attention_items,
        )

    async def get_pipeline(
        self,
        owner_id: uuid.UUID | None = None,
    ) -> PipelineResponse:
        """Fetch detailed pipeline distribution across all lifecycle stages."""
        now = datetime.now(UTC)
        stage_details: list[PipelineStageDetail] = []
        total_active = 0
        total_volume = Decimal("0.00")

        # Query all non-terminal cases
        query = select(Case)
        if owner_id:
            query = query.where(Case.owner_id == owner_id)

        result = await self.session.execute(query)
        cases = result.scalars().all()

        for stage_key, stage_label in CANONICAL_STAGES:
            stage_cases = [c for c in cases if c.status == stage_key]
            count = len(stage_cases)
            amount = sum((c.loan_amount_requested for c in stage_cases), Decimal("0.00"))

            if count > 0:
                total_hours = sum(
                    (
                        Decimal(str((now - (c.entered_stage_at or c.created_at or now)).total_seconds())) / Decimal("3600")
                        for c in stage_cases
                    ),
                    Decimal("0.00"),
                )
                avg_ageing = (total_hours / Decimal(count)).quantize(Decimal("0.1"))
            else:
                avg_ageing = Decimal("0.0")

            if stage_key not in ("closed", "rejected", "withdrawn"):
                total_active += count
                total_volume += amount

            stage_details.append(
                PipelineStageDetail(
                    status=stage_key,
                    label=stage_label,
                    case_count=count,
                    total_loan_amount=amount,
                    avg_ageing_hours=avg_ageing,
                )
            )

        return PipelineResponse(
            stages=stage_details,
            total_active=total_active,
            total_volume=total_volume,
        )

    # -------------------------------------------------------------------------
    # Private Helpers
    # -------------------------------------------------------------------------

    async def _get_pipeline_summary(
        self,
        date_from: date | None,
        date_to: date | None,
        owner_id: uuid.UUID | None,
    ) -> PipelineSummary:
        query = select(Case)
        if owner_id:
            query = query.where(Case.owner_id == owner_id)

        result = await self.session.execute(query)
        all_cases = result.scalars().all()

        active_cases = [c for c in all_cases if c.status not in ("closed", "rejected", "withdrawn")]
        active_files_count = len(active_cases)
        total_requested = sum(
            (c.loan_amount_requested for c in active_cases), Decimal("0.00")
        )

        # Inflow in period
        cutoff_date = datetime.now(UTC) - timedelta(days=30)
        inflow_cases = [
            c
            for c in all_cases
            if (date_from is None or c.created_at.date() >= date_from)
            and (date_to is None or c.created_at.date() <= date_to)
            and (date_from is not None or c.created_at >= cutoff_date)
        ]
        new_inflow_count = len(inflow_cases)

        docs_pending_count = sum(1 for c in all_cases if c.status == "documents_pending")
        logged_in_count = sum(1 for c in all_cases if c.status == "logged_in")
        sanctioned_count = sum(1 for c in all_cases if c.status == "sanctioned")

        disbursed_cases = [
            c for c in all_cases if c.status in ("disbursed", "pdd_pending", "pdd_completed")
        ]
        disbursed_count = len(disbursed_cases)
        disbursed_volume = sum(
            (c.loan_amount_disbursed or Decimal("0.00") for c in disbursed_cases),
            Decimal("0.00"),
        )

        closed_count = sum(1 for c in all_cases if c.status == "closed")
        rejected_count = sum(1 for c in all_cases if c.status == "rejected")

        return PipelineSummary(
            active_files_count=active_files_count,
            total_loan_amount_requested=total_requested,
            new_inflow_count=new_inflow_count,
            docs_pending_count=docs_pending_count,
            logged_in_count=logged_in_count,
            sanctioned_count=sanctioned_count,
            disbursed_count=disbursed_count,
            disbursed_volume=disbursed_volume,
            closed_count=closed_count,
            rejected_count=rejected_count,
        )

    async def _get_payout_summary(
        self,
        date_from: date | None,
        date_to: date | None,
        owner_id: uuid.UUID | None,
    ) -> PayoutSummary:
        # Expected payout from PayoutExpectation
        exp_query = select(PayoutExpectation).join(Case, PayoutExpectation.case_id == Case.id)
        if owner_id:
            exp_query = exp_query.where(Case.owner_id == owner_id)
        exp_query = exp_query.where(PayoutExpectation.status != "cancelled")

        exp_result = await self.session.execute(exp_query)
        expectations = exp_result.scalars().all()

        total_expected_net = sum(
            (e.net_amount for e in expectations),
            Decimal("0.00"),
        )

        # Received payout from Reconciliations linked to expectations
        if expectations:
            exp_ids = [e.id for e in expectations]
            recon_query = select(Reconciliation).where(
                Reconciliation.expectation_id.in_(exp_ids),
                Reconciliation.status.in_(["matched", "short", "excess"]),
            )
            recon_result = await self.session.execute(recon_query)
            reconciliations = recon_result.scalars().all()
            total_received_net = sum(
                (r.received_amount for r in reconciliations),
                Decimal("0.00"),
            )
        else:
            total_received_net = Decimal("0.00")

        if total_expected_net > Decimal("0.00"):
            realisation_rate_pct = (
                (total_received_net / total_expected_net) * Decimal("100.00")
            ).quantize(Decimal("0.01"))
        else:
            realisation_rate_pct = Decimal("0.00")

        outstanding_net = max(Decimal("0.00"), total_expected_net - total_received_net)
        variance_net = total_received_net - total_expected_net

        return PayoutSummary(
            total_expected_net=total_expected_net,
            total_received_net=total_received_net,
            realisation_rate_pct=realisation_rate_pct,
            outstanding_net=outstanding_net,
            variance_net=variance_net,
        )

    async def _get_monthly_commission(
        self,
        owner_id: uuid.UUID | None,
    ) -> list[MonthlyCommissionItem]:
        """Group expected and settled commissions by month for the last 6 calendar months."""
        now = datetime.now(UTC)
        monthly_map: dict[str, dict[str, Any]] = {}

        for i in range(5, -1, -1):
            # calculate year and month
            target_date = now - timedelta(days=i * 30)
            month_str = target_date.strftime("%Y-%m")
            monthly_map[month_str] = {
                "expected": Decimal("0.00"),
                "settled": Decimal("0.00"),
                "count": 0,
            }

        exp_query = select(PayoutExpectation).join(Case, PayoutExpectation.case_id == Case.id)
        if owner_id:
            exp_query = exp_query.where(Case.owner_id == owner_id)
        exp_query = exp_query.where(PayoutExpectation.status != "cancelled")

        exp_result = await self.session.execute(exp_query)
        expectations = exp_result.scalars().all()

        exp_ids = [e.id for e in expectations]
        recons_by_exp: dict[uuid.UUID, list[Reconciliation]] = {}
        if exp_ids:
            recon_res = await self.session.execute(
                select(Reconciliation).where(Reconciliation.expectation_id.in_(exp_ids))
            )
            for r in recon_res.scalars().all():
                recons_by_exp.setdefault(r.expectation_id, []).append(r)

        for e in expectations:
            month_key = e.created_at.strftime("%Y-%m")
            if month_key in monthly_map:
                monthly_map[month_key]["expected"] += e.net_amount
                monthly_map[month_key]["count"] += 1
                matched_recons = recons_by_exp.get(e.id, [])
                for r in matched_recons:
                    if r.status in ("matched", "short", "excess"):
                        monthly_map[month_key]["settled"] += r.received_amount

        items: list[MonthlyCommissionItem] = []
        for month_str in sorted(monthly_map.keys()):
            data = monthly_map[month_str]
            items.append(
                MonthlyCommissionItem(
                    month=month_str,
                    expected_amount=data["expected"],
                    settled_amount=data["settled"],
                    case_count=data["count"],
                )
            )

        return items

    async def _get_funnel_stages(
        self,
        owner_id: uuid.UUID | None,
    ) -> list[FunnelStageItem]:
        now = datetime.now(UTC)
        query = select(Case)
        if owner_id:
            query = query.where(Case.owner_id == owner_id)

        result = await self.session.execute(query)
        cases = result.scalars().all()

        stage_items: list[FunnelStageItem] = []
        for stage_key, stage_label in CANONICAL_STAGES:
            stage_cases = [c for c in cases if c.status == stage_key]
            count = len(stage_cases)
            amount = sum(
                (c.loan_amount_disbursed if c.loan_amount_disbursed else c.loan_amount_requested for c in stage_cases),
                Decimal("0.00"),
            )
            if count > 0:
                total_hours = sum(
                    (
                        Decimal(str((now - (c.entered_stage_at or c.created_at or now)).total_seconds())) / Decimal("3600")
                        for c in stage_cases
                    ),
                    Decimal("0.00"),
                )
                avg_ageing = (total_hours / Decimal(count)).quantize(Decimal("0.1"))
            else:
                avg_ageing = Decimal("0.0")

            is_bottleneck = (count > 5 and avg_ageing > Decimal("72.0")) or (
                stage_key == "documents_pending" and count > 3 and avg_ageing > Decimal("48.0")
            )

            stage_items.append(
                FunnelStageItem(
                    stage=stage_key,
                    stage_label=stage_label,
                    count=count,
                    total_amount=amount,
                    avg_ageing_hours=avg_ageing,
                    is_bottleneck=is_bottleneck,
                )
            )

        return stage_items

    async def _get_top_sources(
        self,
        owner_id: uuid.UUID | None,
    ) -> list[TopSourceItem]:
        # Sources joined with Cases
        src_res = await self.session.execute(select(Source).where(Source.is_active.is_(True)))
        sources = src_res.scalars().all()

        case_query = select(Case)
        if owner_id:
            case_query = case_query.where(Case.owner_id == owner_id)
        cases_res = await self.session.execute(case_query)
        all_cases = cases_res.scalars().all()

        # Query payout expectations for accrued payout calculation
        exp_res = await self.session.execute(
            select(PayoutExpectation).where(PayoutExpectation.status != "cancelled")
        )
        all_expectations = exp_res.scalars().all()
        payout_by_case = {e.case_id: e.net_amount for e in all_expectations}

        top_list: list[TopSourceItem] = []
        for s in sources:
            src_cases = [c for c in all_cases if c.source_id == s.id]
            total_count = len(src_cases)
            if total_count == 0:
                continue

            disbursed_cases = [
                c for c in src_cases if c.status in ("disbursed", "pdd_pending", "pdd_completed", "closed")
            ]
            disbursed_count = len(disbursed_cases)
            conv_rate = (
                (Decimal(disbursed_count) / Decimal(total_count)) * Decimal("100.00")
            ).quantize(Decimal("0.1"))

            disb_volume = sum(
                (c.loan_amount_disbursed or Decimal("0.00") for c in disbursed_cases),
                Decimal("0.00"),
            )

            accrued = sum(
                (payout_by_case.get(c.id, Decimal("0.00")) for c in disbursed_cases),
                Decimal("0.00"),
            )

            top_list.append(
                TopSourceItem(
                    source_id=s.id,
                    source_name=s.name,
                    source_type=s.type,
                    total_cases=total_count,
                    disbursed_cases=disbursed_count,
                    conversion_rate_pct=conv_rate,
                    disbursed_volume=disb_volume,
                    accrued_payout=accrued,
                )
            )

        # Sort by volume descending, then total cases
        top_list.sort(key=lambda x: (x.disbursed_volume, x.total_cases), reverse=True)
        return top_list[:5]

    async def _get_attention_items(
        self,
        owner_id: uuid.UUID | None,
    ) -> AttentionItemsSummary:
        now = datetime.now(UTC)

        # 1. Stuck cases (ageing > SLA)
        sla_res = await self.session.execute(
            select(SLAConfig).where(SLAConfig.entity_type == "case", SLAConfig.is_active.is_(True))
        )
        sla_configs = {s.status: s.sla_hours for s in sla_res.scalars().all()}

        case_query = select(Case).where(Case.status.not_in(["closed", "rejected", "withdrawn"]))
        if owner_id:
            case_query = case_query.where(Case.owner_id == owner_id)
        cases_res = await self.session.execute(case_query)
        active_cases = cases_res.scalars().all()

        stuck_count = 0
        for c in active_cases:
            c_entered = c.entered_stage_at or c.created_at or now
            hours = (now - c_entered).total_seconds() / 3600.0
            sla = sla_configs.get(c.status, 48)
            if hours > sla:
                stuck_count += 1

        # 2. Urgent tasks (pending and due_date <= now)
        task_query = select(func.count(Task.id)).where(
            Task.status == "pending",
            Task.due_date <= now,
        )
        if owner_id:
            task_query = task_query.where(Task.owner_id == owner_id)
        urgent_tasks_count = (await self.session.execute(task_query)).scalar() or 0

        # 3. Overdue PDD count
        today_date = now.date()
        pdd_query = select(func.count(PDDItem.id)).where(
            PDDItem.status.in_(["pending", "collected"]),
            PDDItem.due_date < today_date,
        )
        if owner_id:
            pdd_query = pdd_query.join(Case, PDDItem.case_id == Case.id).where(Case.owner_id == owner_id)
        overdue_pdd_count = (await self.session.execute(pdd_query)).scalar() or 0

        # 4. Discrepancy payouts count
        recon_query = select(func.count(Reconciliation.id)).where(
            Reconciliation.status.in_(["short", "discrepancy"])
        )
        discrepancy_payouts_count = (await self.session.execute(recon_query)).scalar() or 0

        # 5. Expiring documents count (expires_at within 30 days and not archived)
        expiry_cutoff = now + timedelta(days=30)
        doc_query = select(func.count(Document.id)).where(
            Document.expires_at.is_not(None),
            Document.expires_at <= expiry_cutoff,
            Document.status != "archived",
        )
        expiring_docs_count = (await self.session.execute(doc_query)).scalar() or 0

        return AttentionItemsSummary(
            stuck_cases_count=stuck_count,
            urgent_tasks_count=urgent_tasks_count,
            overdue_pdd_count=overdue_pdd_count,
            discrepancy_payouts_count=discrepancy_payouts_count,
            expiring_docs_count=expiring_docs_count,
        )
