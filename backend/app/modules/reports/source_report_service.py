"""
DSA OS — Source Performance Report Service

Implements FR-SRC-004 source-wise analytics:
- Aggregates cases, submissions, approvals, disbursals, and payout per partner.
- Ranks dealerships, sub-DSAs, connectors, and direct sources.
- Pure Decimal arithmetic, zero floats.
"""

import uuid
from datetime import UTC, date, datetime
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.cases.models import Case
from app.modules.payout.models import PayoutExpectation
from app.modules.payout.reconciliation.models import Reconciliation
from app.modules.reports.schemas import (
    SourcePerformanceReportItem,
    SourceReportResponse,
)
from app.modules.sources.models import Source


class SourceReportService:
    """Service generating partner and lead-source performance reports."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_source_report(
        self,
        date_from: date | None = None,
        date_to: date | None = None,
        source_type: str | None = None,
        owner_id: uuid.UUID | None = None,
    ) -> SourceReportResponse:
        # 1. Fetch sources
        src_query = select(Source).order_by(Source.name)
        if source_type:
            src_query = src_query.where(Source.type == source_type)
        src_res = await self.session.execute(src_query)
        sources = src_res.scalars().all()

        # 2. Fetch cases with date filters
        case_query = select(Case).options(selectinload(Case.applications))
        if owner_id:
            case_query = case_query.where(Case.owner_id == owner_id)
        if date_from:
            case_query = case_query.where(Case.created_at >= datetime.combine(date_from, datetime.min.time(), tzinfo=UTC))
        if date_to:
            case_query = case_query.where(Case.created_at <= datetime.combine(date_to, datetime.max.time(), tzinfo=UTC))

        case_res = await self.session.execute(case_query)
        all_cases = case_res.scalars().all()

        # 3. Fetch payout expectations and reconciliations
        exp_res = await self.session.execute(
            select(PayoutExpectation).where(PayoutExpectation.status != "cancelled")
        )
        all_expectations = exp_res.scalars().all()
        exp_map: dict[uuid.UUID, list[PayoutExpectation]] = {}
        for e in all_expectations:
            exp_map.setdefault(e.case_id, []).append(e)

        recon_res = await self.session.execute(
            select(Reconciliation).where(Reconciliation.status.in_(["matched", "short", "excess"]))
        )
        all_recons = recon_res.scalars().all()
        recon_by_exp: dict[uuid.UUID, list[Reconciliation]] = {}
        for r in all_recons:
            recon_by_exp.setdefault(r.expectation_id, []).append(r)

        # 4. Group by source
        items: list[SourcePerformanceReportItem] = []
        grand_total_cases = 0
        grand_total_volume = Decimal("0.00")
        grand_payout_expected = Decimal("0.00")
        grand_payout_received = Decimal("0.00")

        for s in sources:
            src_cases = [c for c in all_cases if c.source_id == s.id]
            total_c = len(src_cases)

            logged_c = sum(
                1 for c in src_cases if c.status in ("logged_in", "sanctioned", "disbursed", "pdd_pending", "pdd_completed", "closed")
            )
            sanctioned_c = sum(
                1 for c in src_cases if c.status in ("sanctioned", "disbursed", "pdd_pending", "pdd_completed", "closed")
            )
            disbursed_c = sum(
                1 for c in src_cases if c.status in ("disbursed", "pdd_pending", "pdd_completed", "closed")
            )

            conv_rate = (
                (Decimal(disbursed_c) / Decimal(total_c) * Decimal("100.00")).quantize(Decimal("0.1"))
                if total_c > 0
                else Decimal("0.0")
            )

            disb_volume = sum(
                (c.loan_amount_disbursed or Decimal("0.00") for c in src_cases if c.loan_amount_disbursed),
                Decimal("0.00"),
            )

            # Payouts
            expected_payout = Decimal("0.00")
            received_payout = Decimal("0.00")
            for c in src_cases:
                c_exps = exp_map.get(c.id, [])
                for e in c_exps:
                    expected_payout += e.net_amount
                    for r in recon_by_exp.get(e.id, []):
                        received_payout += r.received_amount

            # Quality score
            payout_realisation = (
                (received_payout / expected_payout * Decimal("100.00"))
                if expected_payout > Decimal("0.00")
                else Decimal("0.00")
            )
            approval_rate = (
                (Decimal(sanctioned_c) / Decimal(logged_c) * Decimal("100.00"))
                if logged_c > 0
                else Decimal("0.00")
            )
            quality_score = (
                Decimal("0.40") * conv_rate
                + Decimal("0.30") * approval_rate
                + Decimal("0.30") * min(payout_realisation, Decimal("100.00"))
            ).quantize(Decimal("0.1"))

            items.append(
                SourcePerformanceReportItem(
                    source_id=s.id,
                    source_name=s.name,
                    source_type=s.type,
                    contact_person=s.contact_person,
                    phone=s.phone,
                    total_cases=total_c,
                    logged_in_cases=logged_c,
                    sanctioned_cases=sanctioned_c,
                    disbursed_cases=disbursed_c,
                    conversion_rate_pct=conv_rate,
                    disbursed_volume=disb_volume,
                    payout_expected=expected_payout,
                    payout_received=received_payout,
                    quality_score=quality_score,
                )
            )

            grand_total_cases += total_c
            grand_total_volume += disb_volume
            grand_payout_expected += expected_payout
            grand_payout_received += received_payout

        # Sort items by disbursed volume descending, then total cases
        items.sort(key=lambda x: (x.disbursed_volume, x.total_cases), reverse=True)

        return SourceReportResponse(
            sources=items,
            total_cases=grand_total_cases,
            total_disbursed_volume=grand_total_volume,
            total_payout_expected=grand_payout_expected,
            total_payout_received=grand_payout_received,
        )
