"""
DSA OS — PRD 9.1 KPI Computation Service

Strict implementation of authoritative KPI definitions per PRD 9.1:
1. Approval rate: Sanctioned applications / Logged-in applications
2. Disbursal conversion: Disbursed applications / Sanctioned applications
3. Lead-to-disbursal: Disbursed cases / Cases created in period
4. Average ticket: Sum of disbursed amounts / Disbursed cases
5. Stage ageing: Now - entered_stage_at
6. Stuck case: Stage ageing > Stage SLA
7. Payout realisation: Net received / Net expected (matured cases)
8. Payout variance: Received - Expected
9. Source quality score: Weighted blend of conversion, approval, ticket, and payout
10. Doc-complete at login: Cases with 100% mandatory documents at first login / Cases logged in

Zero floating point arithmetic. Pure Decimal calculations.
Safe against zero-division errors.
"""

import logging
import uuid
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.cases.models import Case
from app.modules.documents.checklist_engine import ChecklistEngine
from app.modules.lenders.models import LenderApplication
from app.modules.payout.models import PayoutExpectation
from app.modules.payout.reconciliation.models import Reconciliation
from app.modules.reports.schemas import KPIResponse, LenderKPIBreakdown
from app.modules.workflow.models import SLAConfig

logger = logging.getLogger(__name__)


class KPIService:
    """Service computing authoritative performance KPIs per PRD 9.1."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def compute_kpis(
        self,
        date_from: date | None = None,
        date_to: date | None = None,
        lender_id: uuid.UUID | None = None,
        product: str | None = None,
        source_id: uuid.UUID | None = None,
        owner_id: uuid.UUID | None = None,
    ) -> KPIResponse:
        now = datetime.now(UTC)

        # ---------------------------------------------------------------------
        # 1. Fetch Cases with Filters
        # ---------------------------------------------------------------------
        case_query = select(Case).options(
            selectinload(Case.case_parties),
            selectinload(Case.vehicle),
        )
        if owner_id:
            case_query = case_query.where(Case.owner_id == owner_id)
        if source_id:
            case_query = case_query.where(Case.source_id == source_id)
        if product:
            case_query = case_query.where(Case.product_type == product)
        if date_from:
            case_query = case_query.where(Case.created_at >= datetime.combine(date_from, datetime.min.time(), tzinfo=UTC))
        if date_to:
            case_query = case_query.where(Case.created_at <= datetime.combine(date_to, datetime.max.time(), tzinfo=UTC))

        case_res = await self.session.execute(case_query)
        cases = case_res.scalars().all()
        case_ids = [c.id for c in cases]

        # ---------------------------------------------------------------------
        # 2. Fetch Lender Applications with Filters
        # ---------------------------------------------------------------------
        app_query = select(LenderApplication).options(selectinload(LenderApplication.lender))
        if case_ids:
            app_query = app_query.where(LenderApplication.case_id.in_(case_ids))
        elif cases:
            app_query = app_query.where(LenderApplication.case_id.in_(case_ids))
        if lender_id:
            app_query = app_query.where(LenderApplication.lender_id == lender_id)
        if product:
            app_query = app_query.where(LenderApplication.product == product)

        app_res = await self.session.execute(app_query)
        applications = app_res.scalars().all()

        # ---------------------------------------------------------------------
        # 3. Approval Rate & Disbursal Conversion (PRD 9.1 Formulas 1 & 2)
        # ---------------------------------------------------------------------
        # An application counts as logged_in if its status is logged_in, query_raised, query_resolved,
        # sanctioned, rejected, or disbursed.
        logged_in_apps = [
            a for a in applications if a.status in ("logged_in", "query_raised", "query_resolved", "sanctioned", "disbursed", "rejected")
        ]
        sanctioned_apps = [a for a in applications if a.status in ("sanctioned", "disbursed")]
        disbursed_apps = [a for a in applications if a.status == "disbursed"]

        num_logged = len(logged_in_apps)
        num_sanctioned = len(sanctioned_apps)
        num_disbursed = len(disbursed_apps)

        approval_rate_pct = (
            (Decimal(num_sanctioned) / Decimal(num_logged) * Decimal("100.00")).quantize(Decimal("0.01"))
            if num_logged > 0
            else Decimal("0.00")
        )

        disbursal_conversion_pct = (
            (Decimal(num_disbursed) / Decimal(num_sanctioned) * Decimal("100.00")).quantize(Decimal("0.01"))
            if num_sanctioned > 0
            else Decimal("0.00")
        )

        # ---------------------------------------------------------------------
        # 4. Lead-to-Disbursal Conversion (PRD 9.1 Formula 3)
        # Disbursed cases divided by cases created in period
        # ---------------------------------------------------------------------
        total_created_cases = len(cases)
        disbursed_cases = [c for c in cases if c.status in ("disbursed", "pdd_pending", "pdd_completed", "closed")]
        num_disbursed_cases = len(disbursed_cases)

        lead_to_disbursal_pct = (
            (Decimal(num_disbursed_cases) / Decimal(total_created_cases) * Decimal("100.00")).quantize(Decimal("0.01"))
            if total_created_cases > 0
            else Decimal("0.00")
        )

        # ---------------------------------------------------------------------
        # 5. Average Ticket (PRD 9.1 Formula 4)
        # Sum of disbursed amounts divided by disbursed cases
        # ---------------------------------------------------------------------
        sum_disbursed_amount = sum(
            (c.loan_amount_disbursed or Decimal("0.00") for c in disbursed_cases),
            Decimal("0.00"),
        )
        average_ticket = (
            (sum_disbursed_amount / Decimal(num_disbursed_cases)).quantize(Decimal("0.01"))
            if num_disbursed_cases > 0
            else Decimal("0.00")
        )

        # ---------------------------------------------------------------------
        # 6. Stage Ageing & Stuck Cases (PRD 9.1 Formulas 5 & 6)
        # Stage ageing: Now - entered_stage_at
        # Stuck case: Stage ageing > Stage SLA
        # ---------------------------------------------------------------------
        sla_res = await self.session.execute(
            select(SLAConfig).where(SLAConfig.entity_type == "case", SLAConfig.is_active.is_(True))
        )
        sla_configs = {s.status: s.sla_hours for s in sla_res.scalars().all()}

        active_cases = [c for c in cases if c.status not in ("closed", "rejected", "withdrawn")]
        stuck_case_count = 0
        total_ageing_hours = Decimal("0.00")

        for c in active_cases:
            diff_hours = Decimal(str((now - c.entered_stage_at).total_seconds())) / Decimal("3600")
            total_ageing_hours += diff_hours
            sla_threshold = Decimal(str(sla_configs.get(c.status, 48)))
            if diff_hours > sla_threshold:
                stuck_case_count += 1

        avg_stage_ageing_hours = (
            (total_ageing_hours / Decimal(len(active_cases))).quantize(Decimal("0.1"))
            if active_cases
            else Decimal("0.0")
        )

        # ---------------------------------------------------------------------
        # 7. Payout Realisation & Variance (PRD 9.1 Formulas 7 & 8)
        # Realisation: Net payout received / Net payout expected (matured cases)
        # Variance: Received - Expected
        # ---------------------------------------------------------------------
        exp_query = select(PayoutExpectation).where(PayoutExpectation.status != "cancelled")
        if case_ids:
            exp_query = exp_query.where(PayoutExpectation.case_id.in_(case_ids))
        exp_res = await self.session.execute(exp_query)
        expectations = exp_res.scalars().all()

        net_expected = sum((e.net_amount for e in expectations), Decimal("0.00"))

        net_received = Decimal("0.00")
        if expectations:
            exp_ids = [e.id for e in expectations]
            recon_res = await self.session.execute(
                select(Reconciliation).where(
                    Reconciliation.expectation_id.in_(exp_ids),
                    Reconciliation.status.in_(["matched", "short", "excess"]),
                )
            )
            recons = recon_res.scalars().all()
            net_received = sum((r.received_amount for r in recons), Decimal("0.00"))

        payout_realisation_pct = (
            (net_received / net_expected * Decimal("100.00")).quantize(Decimal("0.01"))
            if net_expected > Decimal("0.00")
            else Decimal("0.00")
        )

        payout_variance = net_received - net_expected

        # ---------------------------------------------------------------------
        # 8. Source Quality Score (PRD 9.1 Formula 9)
        # Weighted blend: 0.30 * approval_rate + 0.30 * disbursal_conversion +
        # 0.20 * min(avg_ticket / 500000 * 100, 100) + 0.20 * payout_realisation
        # ---------------------------------------------------------------------
        ticket_normalized = min(
            (average_ticket / Decimal("500000.00") * Decimal("100.00")),
            Decimal("100.00"),
        )
        source_quality_score = (
            Decimal("0.30") * approval_rate_pct
            + Decimal("0.30") * disbursal_conversion_pct
            + Decimal("0.20") * ticket_normalized
            + Decimal("0.20") * min(payout_realisation_pct, Decimal("100.00"))
        ).quantize(Decimal("0.1"))

        # ---------------------------------------------------------------------
        # 9. Document-complete at Login (PRD 9.1 Formula 10)
        # Cases with 100% mandatory documents at first login / Cases logged in
        # ---------------------------------------------------------------------
        logged_cases = [c for c in cases if c.status in ("logged_in", "sanctioned", "disbursed", "pdd_pending", "pdd_completed", "closed")]
        doc_complete_count = 0

        if logged_cases:
            checklist_engine = ChecklistEngine(self.session)
            for c in logged_cases:
                try:
                    _, missing_count = await checklist_engine.get_case_checklist(
                        org_id=c.org_id, case_id=c.id
                    )
                    if missing_count == 0:
                        doc_complete_count += 1
                except Exception as exc:
                    logger.debug("Checklist evaluation skipped for case %s: %s", c.id, exc)

            doc_complete_at_login_pct = (
                (Decimal(doc_complete_count) / Decimal(len(logged_cases)) * Decimal("100.00")).quantize(Decimal("0.01"))
            )
        else:
            doc_complete_at_login_pct = Decimal("0.00")

        # ---------------------------------------------------------------------
        # 10. Lender KPI Breakdowns
        # ---------------------------------------------------------------------
        breakdowns: list[LenderKPIBreakdown] = []
        lender_product_map: dict[tuple[uuid.UUID, str, str], dict[str, Any]] = {}

        for a in applications:
            l_name = a.lender.name if a.lender else "Unknown Lender"
            key = (a.lender_id, l_name, a.product)
            if key not in lender_product_map:
                lender_product_map[key] = {
                    "logged_in": 0,
                    "sanctioned": 0,
                    "disbursed": 0,
                    "volume": Decimal("0.00"),
                }
            if a.status in ("logged_in", "query_raised", "query_resolved", "sanctioned", "disbursed", "rejected"):
                lender_product_map[key]["logged_in"] += 1
            if a.status in ("sanctioned", "disbursed"):
                lender_product_map[key]["sanctioned"] += 1
            if a.status == "disbursed":
                lender_product_map[key]["disbursed"] += 1
                lender_product_map[key]["volume"] += a.disbursal_amount or Decimal("0.00")

        for (l_id, l_name, prod), counts in lender_product_map.items():
            l_logged = counts["logged_in"]
            l_sanctioned = counts["sanctioned"]
            l_disbursed = counts["disbursed"]

            l_app_rate = (
                (Decimal(l_sanctioned) / Decimal(l_logged) * Decimal("100.00")).quantize(Decimal("0.01"))
                if l_logged > 0
                else Decimal("0.00")
            )
            l_disb_rate = (
                (Decimal(l_disbursed) / Decimal(l_sanctioned) * Decimal("100.00")).quantize(Decimal("0.01"))
                if l_sanctioned > 0
                else Decimal("0.00")
            )

            breakdowns.append(
                LenderKPIBreakdown(
                    lender_id=l_id,
                    lender_name=l_name,
                    product=prod,
                    logged_in=l_logged,
                    sanctioned=l_sanctioned,
                    disbursed=l_disbursed,
                    approval_rate_pct=l_app_rate,
                    disbursal_conversion_pct=l_disb_rate,
                    disbursed_volume=counts["volume"],
                )
            )

        return KPIResponse(
            approval_rate_pct=approval_rate_pct,
            disbursal_conversion_pct=disbursal_conversion_pct,
            lead_to_disbursal_pct=lead_to_disbursal_pct,
            average_ticket=average_ticket,
            avg_stage_ageing_hours=avg_stage_ageing_hours,
            stuck_case_count=stuck_case_count,
            payout_realisation_pct=payout_realisation_pct,
            payout_variance=payout_variance,
            source_quality_score=source_quality_score,
            doc_complete_at_login_pct=doc_complete_at_login_pct,
            lender_breakdowns=breakdowns,
        )
