"""
DSA OS — Payout Receipt & Reconciliation Service
Manual receipt entry with BR-07 enforcement, manual matching,
unmatched queue, missing expectations queue, and lender outstanding report with ageing.
Fully async with AsyncSession.
"""

import uuid
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.audit.service import AuditService
from app.modules.cases.models import Case, CaseParty
from app.modules.lenders.models import Lender, LenderApplication
from app.modules.payout.models import PayoutExpectation
from app.modules.payout.reconciliation.matching_engine import (
    VALID_RECEIPT_CASE_STATUSES,
    calculate_variance,
    classify_ageing,
)
from app.modules.payout.reconciliation.models import (
    PayoutReceipt,
    Reconciliation,
)
from app.modules.payout.reconciliation.schemas import (
    LenderOutstandingSummary,
    ManualMatchRequest,
    OutstandingReportResponse,
    PayoutReceiptCreate,
)
from app.shared.exceptions import (
    BusinessRuleViolationError,
    NotFoundError,
)


def _utcnow() -> datetime:
    return datetime.now(UTC)


class PayoutReceiptService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.audit = AuditService(session=session)

    async def create_receipt(
        self,
        org_id: uuid.UUID,
        payload: PayoutReceiptCreate,
        actor_id: uuid.UUID | None = None,
        actor_role: str | None = None,
    ) -> PayoutReceipt:
        """
        Manually create a bank payout receipt credit.
        Enforces BR-07: Linking to a case requires the case to be in disbursed status.
        """
        stmt_lender = select(Lender).where(
            Lender.org_id == org_id,
            Lender.id == payload.lender_id,
            Lender.is_active.is_(True),
        )
        lender = (await self.session.execute(stmt_lender)).scalar_one_or_none()
        if not lender:
            raise NotFoundError(f"Lender {payload.lender_id} not found.")

        target_case = None
        target_app = None

        if payload.case_id:
            stmt_case = select(Case).where(
                Case.org_id == org_id,
                Case.id == payload.case_id,
            )
            target_case = (await self.session.execute(stmt_case)).scalar_one_or_none()
            if not target_case:
                raise NotFoundError(f"Case {payload.case_id} not found.")

            # BR-07: Receipts can only link to cases in disbursed or post-disbursal status
            if target_case.status not in VALID_RECEIPT_CASE_STATUSES:
                raise BusinessRuleViolationError(
                    f"BR-07: Payout receipt cannot be linked to case {target_case.case_no} "
                    f"in non-disbursed status '{target_case.status}'."
                )

            stmt_app = select(LenderApplication).where(
                LenderApplication.org_id == org_id,
                LenderApplication.case_id == target_case.id,
                LenderApplication.lender_id == payload.lender_id,
            )
            target_app = (await self.session.execute(stmt_app)).scalar_one_or_none()

        net_amount = payload.received_amount - payload.tds_amount

        receipt = PayoutReceipt(
            org_id=org_id,
            lender_id=payload.lender_id,
            loan_account_no=payload.loan_account_no,
            customer_name=payload.customer_name,
            received_amount=payload.received_amount,
            tds_amount=payload.tds_amount,
            net_amount=net_amount,
            payment_date=payload.payment_date,
            utr_reference=payload.utr_reference,
            match_status="unmatched",
            case_id=target_case.id if target_case else None,
            lender_application_id=target_app.id if target_app else None,
            notes=payload.notes,
        )
        self.session.add(receipt)
        await self.session.flush()

        await self.audit.log_event(
            org_id=org_id,
            action="payout_receipt:created",
            entity_type="payout_receipts",
            actor_id=actor_id,
            actor_role=actor_role,
            entity_id=str(receipt.id),
            changes={
                "received_amount": str(receipt.received_amount),
                "tds_amount": str(receipt.tds_amount),
                "net_amount": str(receipt.net_amount),
                "case_id": str(receipt.case_id) if receipt.case_id else None,
            },
        )
        return receipt

    async def manual_match(
        self,
        org_id: uuid.UUID,
        payload: ManualMatchRequest,
        actor_id: uuid.UUID | None = None,
        actor_role: str | None = None,
    ) -> Reconciliation:
        """
        Manually match a receipt to an expected payout.
        Enforces BR-07: Expectation's case must be disbursed.
        """
        stmt_rec = select(PayoutReceipt).where(
            PayoutReceipt.org_id == org_id,
            PayoutReceipt.id == payload.receipt_id,
        )
        receipt = (await self.session.execute(stmt_rec)).scalar_one_or_none()
        if not receipt:
            raise NotFoundError(f"Payout receipt {payload.receipt_id} not found.")

        if receipt.match_status == "matched":
            raise BusinessRuleViolationError("This receipt has already been matched.")

        stmt_exp = (
            select(PayoutExpectation)
            .options(
                selectinload(PayoutExpectation.case),
                selectinload(PayoutExpectation.lender_application),
            )
            .where(
                PayoutExpectation.org_id == org_id,
                PayoutExpectation.id == payload.expectation_id,
            )
        )
        exp = (await self.session.execute(stmt_exp)).scalar_one_or_none()
        if not exp:
            raise NotFoundError(f"Payout expectation {payload.expectation_id} not found.")

        # BR-07: Expectation case must be in disbursed status
        if exp.case.status not in VALID_RECEIPT_CASE_STATUSES:
            raise BusinessRuleViolationError(
                f"BR-07: Cannot match payout to case {exp.case.case_no} "
                f"in non-disbursed status '{exp.case.status}'."
            )

        variance, status = calculate_variance(
            receipt.received_amount, exp.gross_amount, payload.tolerance
        )

        now = _utcnow()
        recon = Reconciliation(
            org_id=org_id,
            expectation_id=exp.id,
            receipt_id=receipt.id,
            expected_amount=exp.gross_amount,
            received_amount=receipt.received_amount,
            variance_amount=variance,
            status=status,
            tolerance_used=payload.tolerance,
            is_manual=True,
            reconciled_by=actor_id,
            reconciled_at=now,
            notes=payload.notes,
        )
        self.session.add(recon)

        receipt.match_status = "matched"
        receipt.case_id = exp.case_id
        receipt.lender_application_id = exp.lender_application_id
        exp.status = "paid"

        await self.audit.log_event(
            org_id=org_id,
            action="reconciliation:matched_manually",
            entity_type="reconciliations",
            actor_id=actor_id,
            actor_role=actor_role,
            entity_id=str(recon.id),
            changes={
                "expectation_id": str(exp.id),
                "receipt_id": str(receipt.id),
                "variance": str(variance),
                "status": status,
            },
        )
        await self.session.flush()
        return recon

    async def list_receipts(
        self,
        org_id: uuid.UUID,
        match_status: str | None = None,
        lender_id: uuid.UUID | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[PayoutReceipt]:
        """Fetch list of receipts with optional filtering."""
        query = (
            select(PayoutReceipt)
            .options(
                selectinload(PayoutReceipt.lender),
                selectinload(PayoutReceipt.case),
            )
            .where(PayoutReceipt.org_id == org_id)
        )
        if match_status:
            query = query.where(PayoutReceipt.match_status == match_status)
        if lender_id:
            query = query.where(PayoutReceipt.lender_id == lender_id)

        query = query.order_by(PayoutReceipt.payment_date.desc()).offset(offset).limit(limit)
        return list((await self.session.execute(query)).scalars().all())

    async def get_unmatched_receipts(
        self,
        org_id: uuid.UUID,
        lender_id: uuid.UUID | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[PayoutReceipt]:
        """Fetch list of unmatched orphan receipts."""
        return await self.list_receipts(
            org_id=org_id,
            match_status="unmatched",
            lender_id=lender_id,
            limit=limit,
            offset=offset,
        )

    async def get_missing_expectations(
        self,
        org_id: uuid.UUID,
        days_threshold: int = 45,
    ) -> list[PayoutExpectation]:
        """
        Fetch expectations in 'due' or 'held' status with no receipt match
        and older than days_threshold (default 45 days).
        """
        cutoff_date = date.today() - timedelta(days=days_threshold)
        query = (
            select(PayoutExpectation)
            .join(LenderApplication, PayoutExpectation.lender_application_id == LenderApplication.id)
            .join(Case, PayoutExpectation.case_id == Case.id)
            .options(
                selectinload(PayoutExpectation.case).selectinload(Case.case_parties).selectinload(CaseParty.party),
                selectinload(PayoutExpectation.lender_application).selectinload(LenderApplication.lender),
            )
            .where(
                PayoutExpectation.org_id == org_id,
                PayoutExpectation.status.in_(["held", "due", "no_rule"]),
                func.coalesce(LenderApplication.disbursal_date, func.date(PayoutExpectation.created_at)) <= cutoff_date,
            )
            .order_by(LenderApplication.disbursal_date.asc())
        )
        return list((await self.session.execute(query)).scalars().all())

    async def get_outstanding_report(
        self,
        org_id: uuid.UUID,
    ) -> OutstandingReportResponse:
        """
        Aggregate expected vs received payout receivables by lender with ageing breakdown.
        """
        stmt_lenders = select(Lender).where(
            Lender.org_id == org_id,
            Lender.is_active.is_(True),
        )
        lenders = list((await self.session.execute(stmt_lenders)).scalars().all())

        today = date.today()
        lender_summaries: list[LenderOutstandingSummary] = []

        overall_expected = Decimal("0.00")
        overall_received = Decimal("0.00")
        overall_outstanding = Decimal("0.00")

        for lender in lenders:
            stmt_exp = (
                select(PayoutExpectation)
                .join(LenderApplication, PayoutExpectation.lender_application_id == LenderApplication.id)
                .options(
                    selectinload(PayoutExpectation.lender_application),
                )
                .where(
                    PayoutExpectation.org_id == org_id,
                    LenderApplication.lender_id == lender.id,
                )
            )
            expectations = list((await self.session.execute(stmt_exp)).scalars().all())

            lender_exp = Decimal("0.00")
            lender_rec = Decimal("0.00")
            pending_count = 0
            ageing_0_30 = Decimal("0.00")
            ageing_31_60 = Decimal("0.00")
            ageing_61_90 = Decimal("0.00")
            ageing_90_plus = Decimal("0.00")

            for exp in expectations:
                lender_exp += exp.gross_amount
                if exp.status == "paid":
                    lender_rec += exp.gross_amount
                else:
                    pending_count += 1
                    disb_date = exp.lender_application.disbursal_date or exp.created_at.date()
                    bucket = classify_ageing(disb_date, today)
                    if bucket == "0_30":
                        ageing_0_30 += exp.gross_amount
                    elif bucket == "31_60":
                        ageing_31_60 += exp.gross_amount
                    elif bucket == "61_90":
                        ageing_61_90 += exp.gross_amount
                    else:
                        ageing_90_plus += exp.gross_amount

            lender_out = lender_exp - lender_rec
            variance = lender_rec - lender_exp

            overall_expected += lender_exp
            overall_received += lender_rec
            overall_outstanding += lender_out

            lender_summaries.append(
                LenderOutstandingSummary(
                    lender_id=lender.id,
                    lender_name=lender.name,
                    total_expected=lender_exp,
                    total_received=lender_rec,
                    total_outstanding=lender_out,
                    total_variance=variance,
                    pending_cases_count=pending_count,
                    ageing_0_30=ageing_0_30,
                    ageing_31_60=ageing_31_60,
                    ageing_61_90=ageing_61_90,
                    ageing_90_plus=ageing_90_plus,
                )
            )

        return OutstandingReportResponse(
            total_expected=overall_expected,
            total_received=overall_received,
            total_outstanding=overall_outstanding,
            lenders=lender_summaries,
        )
