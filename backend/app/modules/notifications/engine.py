"""
DSA OS — Notification Event Engine

Subscribes to internal domain events and maps them to target user notifications (FR-NTF-001).
"""

import logging
import uuid

from sqlalchemy import select

from app.database import get_session_factory
from app.modules.auth.models import User
from app.modules.cases.models import Case
from app.modules.notifications.service import NotificationService
from app.shared.events import DomainEvent, EventTypes, event_bus

logger = logging.getLogger(__name__)


async def _handle_case_status_changed(event: DomainEvent) -> None:
    """Notify case owner on status change."""
    org_id = uuid.UUID(event.org_id)
    case_id_str = event.payload.get("case_id")
    if not case_id_str:
        return

    case_id = uuid.UUID(case_id_str)
    from_status = event.payload.get("from", "unknown")
    to_status = event.payload.get("to", "unknown")

    session_factory = get_session_factory()
    async with session_factory() as session:
        case_stmt = select(Case).where(Case.id == case_id, Case.org_id == org_id)
        res = await session.execute(case_stmt)
        case = res.scalar_one_or_none()
        if not case:
            return

        service = NotificationService(session)
        await service.create_notification(
            org_id=org_id,
            user_id=case.owner_id,
            event_type="case.status_changed",
            title=f"Case #{case.case_no} Status Changed",
            message=f"Case status advanced from '{from_status}' to '{to_status}'.",
            urgency="normal",
            entity_type="case",
            entity_id=case.id,
            deep_link=f"/cases/{case.id}",
            payload=event.payload,
        )
        await session.commit()


async def _handle_lender_app_sanctioned(event: DomainEvent) -> None:
    """Notify case owner when an application is sanctioned."""
    org_id = uuid.UUID(event.org_id)
    case_id_str = event.payload.get("case_id")
    if not case_id_str:
        return

    case_id = uuid.UUID(case_id_str)
    lender_name = event.payload.get("lender_name", "Lender")
    sanctioned_amount = event.payload.get("sanctioned_amount", "")

    session_factory = get_session_factory()
    async with session_factory() as session:
        case_stmt = select(Case).where(Case.id == case_id, Case.org_id == org_id)
        res = await session.execute(case_stmt)
        case = res.scalar_one_or_none()
        if not case:
            return

        service = NotificationService(session)
        await service.create_notification(
            org_id=org_id,
            user_id=case.owner_id,
            event_type="lender_application.sanctioned",
            title="Application Sanctioned",
            message=f"{lender_name} sanctioned Case #{case.case_no} for ₹{sanctioned_amount}.",
            urgency="normal",
            entity_type="case",
            entity_id=case.id,
            deep_link=f"/cases/{case.id}",
            payload=event.payload,
        )
        await session.commit()


async def _handle_lender_app_disbursed(event: DomainEvent) -> None:
    """Notify case owner and accountants when loan is disbursed."""
    org_id = uuid.UUID(event.org_id)
    case_id_str = event.payload.get("case_id")
    if not case_id_str:
        return

    case_id = uuid.UUID(case_id_str)
    lender_name = event.payload.get("lender_name", "Lender")
    disbursed_amount = event.payload.get("disbursed_amount", "")

    session_factory = get_session_factory()
    async with session_factory() as session:
        case_stmt = select(Case).where(Case.id == case_id, Case.org_id == org_id)
        res = await session.execute(case_stmt)
        case = res.scalar_one_or_none()
        if not case:
            return

        service = NotificationService(session)

        # Notify case owner
        await service.create_notification(
            org_id=org_id,
            user_id=case.owner_id,
            event_type="lender_application.disbursed",
            title="Loan Disbursed",
            message=f"{lender_name} disbursed ₹{disbursed_amount} for Case #{case.case_no}.",
            urgency="normal",
            entity_type="case",
            entity_id=case.id,
            deep_link=f"/cases/{case.id}",
            payload=event.payload,
        )

        # Notify accountants and owners
        users_stmt = select(User).where(
            User.org_id == org_id,
            User.role.in_(["accountant", "owner"]),
            User.is_active.is_(True),
        )
        u_res = await session.execute(users_stmt)
        for finance_user in u_res.scalars().all():
            if finance_user.id != case.owner_id:
                await service.create_notification(
                    org_id=org_id,
                    user_id=finance_user.id,
                    event_type="lender_application.disbursed",
                    title="Loan Disbursal Recorded",
                    message=f"Disbursal of ₹{disbursed_amount} recorded for Case #{case.case_no}. Payout expectation ready for reconciliation.",
                    urgency="normal",
                    entity_type="case",
                    entity_id=case.id,
                    deep_link="/payout/reconciliation",
                    payload=event.payload,
                )

        await session.commit()


async def _handle_clawback_recorded(event: DomainEvent) -> None:
    """Notify accountants and owners on clawback events."""
    org_id = uuid.UUID(event.org_id)
    case_number = event.payload.get("case_number", "Case")
    amount = event.payload.get("clawback_amount", "")

    session_factory = get_session_factory()
    async with session_factory() as session:
        users_stmt = select(User).where(
            User.org_id == org_id,
            User.role.in_(["accountant", "owner"]),
            User.is_active.is_(True),
        )
        u_res = await session.execute(users_stmt)
        service = NotificationService(session)

        for finance_user in u_res.scalars().all():
            await service.create_notification(
                org_id=org_id,
                user_id=finance_user.id,
                event_type="payout.clawback_recorded",
                title="Clawback Event Recorded",
                message=f"A clawback of ₹{amount} was recorded on {case_number}.",
                urgency="high",
                entity_type="payout",
                deep_link="/payout/reconciliation",
                payload=event.payload,
            )

        await session.commit()


def register_notification_handlers() -> None:
    """Register all event bus handlers for the notification system."""
    event_bus.subscribe(EventTypes.CASE_STATUS_CHANGED, _handle_case_status_changed)
    event_bus.subscribe(EventTypes.LENDER_APPLICATION_SANCTIONED, _handle_lender_app_sanctioned)
    event_bus.subscribe(EventTypes.LENDER_APPLICATION_DISBURSED, _handle_lender_app_disbursed)
    event_bus.subscribe(EventTypes.PAYOUT_CLAWBACK_RECORDED, _handle_clawback_recorded)
    logger.info("Notification domain event handlers registered")
