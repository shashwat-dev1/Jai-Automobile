"""
DSA OS — Notification Dispatcher & Channel Abstraction

Implements FR-NTF-002 (In-app, Email with pluggable SMS/WhatsApp adapters)
and FR-NTF-004 (Delivery log per notification).
"""

import abc
import logging
import uuid
from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.auth.models import User
from app.modules.notifications.models import (
    Notification,
    NotificationDeliveryLog,
    NotificationPreference,
)

logger = logging.getLogger(__name__)


class BaseNotificationChannel(abc.ABC):
    """Abstract base class for notification delivery channels."""

    @property
    @abc.abstractmethod
    def channel_name(self) -> str:
        """Name of the channel, e.g., 'in_app', 'email', 'sms', 'whatsapp'."""
        pass

    @abc.abstractmethod
    async def dispatch(
        self,
        notification: Notification,
        user: User,
        db: AsyncSession,
    ) -> NotificationDeliveryLog:
        """Deliver the notification via this channel and return the delivery log."""
        pass


class InAppChannel(BaseNotificationChannel):
    """P0 In-app delivery channel: persistent record visible in UI notification bell/panel."""

    @property
    def channel_name(self) -> str:
        return "in_app"

    async def dispatch(
        self,
        notification: Notification,
        user: User,
        db: AsyncSession,
    ) -> NotificationDeliveryLog:
        log = NotificationDeliveryLog(
            id=uuid.uuid4(),
            org_id=notification.org_id,
            notification_id=notification.id,
            channel=self.channel_name,
            status="delivered",
            recipient=user.email or str(user.id),
            error_message=None,
            attempted_at=datetime.now(UTC),
        )
        db.add(log)
        return log


class EmailChannel(BaseNotificationChannel):
    """P1 Email delivery channel via SMTP or transactional provider."""

    @property
    def channel_name(self) -> str:
        return "email"

    async def dispatch(
        self,
        notification: Notification,
        user: User,
        db: AsyncSession,
    ) -> NotificationDeliveryLog:
        recipient = user.email or f"user_{user.id}@tenant.local"

        # Simulates transactional email provider / SMTP dispatch
        # Real-world: await send_smtp_email(...)
        try:
            logger.info(
                "Dispatching transactional email to %s: [%s] %s",
                recipient,
                notification.title,
                notification.message,
            )
            status = "sent"
            error = None
        except Exception as exc:
            logger.exception("Failed to send notification email to %s", recipient)
            status = "failed"
            error = str(exc)

        log = NotificationDeliveryLog(
            id=uuid.uuid4(),
            org_id=notification.org_id,
            notification_id=notification.id,
            channel=self.channel_name,
            status=status,
            recipient=recipient,
            error_message=error,
            attempted_at=datetime.now(UTC),
        )
        db.add(log)
        return log


class SMSChannel(BaseNotificationChannel):
    """Pluggable adapter for future SMS integration (Release 2)."""

    @property
    def channel_name(self) -> str:
        return "sms"

    async def dispatch(
        self,
        notification: Notification,
        user: User,
        db: AsyncSession,
    ) -> NotificationDeliveryLog:
        recipient = getattr(user, "mobile", None) or "unspecified"
        log = NotificationDeliveryLog(
            id=uuid.uuid4(),
            org_id=notification.org_id,
            notification_id=notification.id,
            channel=self.channel_name,
            status="suppressed",
            recipient=recipient,
            error_message="SMS channel deferred to Release 2",
            attempted_at=datetime.now(UTC),
        )
        db.add(log)
        return log


class WhatsAppChannel(BaseNotificationChannel):
    """Pluggable adapter for future WhatsApp Business API integration (Release 2)."""

    @property
    def channel_name(self) -> str:
        return "whatsapp"

    async def dispatch(
        self,
        notification: Notification,
        user: User,
        db: AsyncSession,
    ) -> NotificationDeliveryLog:
        recipient = getattr(user, "mobile", None) or "unspecified"
        log = NotificationDeliveryLog(
            id=uuid.uuid4(),
            org_id=notification.org_id,
            notification_id=notification.id,
            channel=self.channel_name,
            status="suppressed",
            recipient=recipient,
            error_message="WhatsApp channel deferred to Release 2",
            attempted_at=datetime.now(UTC),
        )
        db.add(log)
        return log


class NotificationDispatcher:
    """Coordinates multi-channel delivery according to user preferences."""

    def __init__(self) -> None:
        self.channels: dict[str, BaseNotificationChannel] = {
            "in_app": InAppChannel(),
            "email": EmailChannel(),
            "sms": SMSChannel(),
            "whatsapp": WhatsAppChannel(),
        }

    async def dispatch(
        self,
        notification: Notification,
        user: User,
        preferences: NotificationPreference,
        db: AsyncSession,
        in_quiet_hours: bool = False,
    ) -> list[NotificationDeliveryLog]:
        logs: list[NotificationDeliveryLog] = []

        # 1. In-App delivery
        if preferences.in_app_enabled:
            in_app_log = await self.channels["in_app"].dispatch(notification, user, db)
            logs.append(in_app_log)

        # 2. Email delivery (suppressed during quiet hours unless urgent)
        if preferences.email_enabled:
            if in_quiet_hours and notification.urgency != "urgent":
                logger.info(
                    "Email notification suppressed for user %s during quiet hours",
                    user.id,
                )
                suppressed_log = NotificationDeliveryLog(
                    id=uuid.uuid4(),
                    org_id=notification.org_id,
                    notification_id=notification.id,
                    channel="email",
                    status="suppressed",
                    recipient=user.email or str(user.id),
                    error_message="Suppressed during quiet hours",
                    attempted_at=datetime.now(UTC),
                )
                db.add(suppressed_log)
                logs.append(suppressed_log)
            else:
                email_log = await self.channels["email"].dispatch(notification, user, db)
                logs.append(email_log)

        return logs


# Singleton dispatcher
dispatcher = NotificationDispatcher()
