"""
DSA OS — Clawback Service
Handles lender commission clawback events for early foreclosure or delinquency.
Fully async with AsyncSession.
"""

import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.audit.service import AuditService
from app.modules.payout.models import PayoutExpectation
from app.modules.payout.reconciliation.models import ClawbackEvent
from app.modules.payout.reconciliation.schemas import ClawbackEventCreate
from app.shared.exceptions import BusinessRuleViolationError, NotFoundError


def _utcnow() -> datetime:
    return datetime.now(UTC)


class ClawbackService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.audit = AuditService(session=session)

    async def create_clawback(
        self,
        org_id: uuid.UUID,
        payload: ClawbackEventCreate,
        actor_id: uuid.UUID | None = None,
        actor_role: str | None = None,
    ) -> ClawbackEvent:
        """
        Record a clawback event against an application/expectation.
        Transitions the expectation status to 'clawback'.
        """
        stmt = select(PayoutExpectation).where(
            PayoutExpectation.org_id == org_id,
            PayoutExpectation.id == payload.expectation_id,
            PayoutExpectation.case_id == payload.case_id,
            PayoutExpectation.lender_application_id == payload.lender_application_id,
        )
        exp = (await self.session.execute(stmt)).scalar_one_or_none()
        if not exp:
            raise NotFoundError(
                f"Payout expectation {payload.expectation_id} not found for case {payload.case_id}."
            )

        if payload.clawback_amount > exp.gross_amount:
            raise BusinessRuleViolationError(
                f"Clawback amount ({payload.clawback_amount}) cannot exceed expectation gross amount ({exp.gross_amount})."
            )

        event = ClawbackEvent(
            org_id=org_id,
            case_id=payload.case_id,
            lender_application_id=payload.lender_application_id,
            expectation_id=payload.expectation_id,
            receipt_id=payload.receipt_id,
            clawback_amount=payload.clawback_amount,
            reason=payload.reason,
            effective_date=payload.effective_date,
            status="pending",
            created_by=actor_id,
        )
        self.session.add(event)

        # Transition expectation to clawback
        exp.status = "clawback"

        await self.audit.log_event(
            org_id=org_id,
            action="clawback:created",
            entity_type="clawback_events",
            actor_id=actor_id,
            actor_role=actor_role,
            entity_id=str(event.id),
            changes={
                "clawback_amount": str(payload.clawback_amount),
                "reason": payload.reason,
                "case_id": str(payload.case_id),
                "expectation_id": str(payload.expectation_id),
            },
        )
        await self.session.flush()
        return event

    async def list_clawbacks(
        self,
        org_id: uuid.UUID,
        case_id: uuid.UUID | None = None,
        status: str | None = None,
    ) -> list[ClawbackEvent]:
        """Query clawback events with joined case and applicant info."""
        query = (
            select(ClawbackEvent)
            .options(
                selectinload(ClawbackEvent.case),
                selectinload(ClawbackEvent.lender_application),
            )
            .where(ClawbackEvent.org_id == org_id)
        )
        if case_id:
            query = query.where(ClawbackEvent.case_id == case_id)
        if status:
            query = query.where(ClawbackEvent.status == status)

        query = query.order_by(ClawbackEvent.effective_date.desc())
        return list((await self.session.execute(query)).scalars().all())
