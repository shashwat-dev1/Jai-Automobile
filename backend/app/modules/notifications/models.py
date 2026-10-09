"""
DSA OS — Notifications Models

Implements Phase 09 notification storage:
- Notification: per-user alerts with urgency, entity reference, deep links, read status, and payload
- NotificationPreference: user preferences for channels, quiet hours, and event categories
- NotificationDeliveryLog: FR-NTF-004 per-notification delivery audit log
"""

import uuid
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.modules.auth.models import User


def _utcnow() -> datetime:
    return datetime.now(UTC)


class Notification(Base):
    """
    Per-user notifications.
    Protected by PostgreSQL RLS for multi-tenant and user scoping.
    """

    __tablename__ = "notifications"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=func.gen_random_uuid(),
        index=True,
    )
    org_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    event_type: Mapped[str] = mapped_column(String(100), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    urgency: Mapped[str] = mapped_column(
        String(20), nullable=False, default="normal"
    )  # low, normal, high, urgent
    entity_type: Mapped[str] = mapped_column(
        String(50), nullable=False
    )  # case, document, lender_application, task, pdd_item, payout, clawback
    entity_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    deep_link: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_read: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    payload: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, default=dict
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=_utcnow,
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=_utcnow,
        onupdate=_utcnow,
        server_default=func.now(),
        nullable=False,
    )

    # Relationships
    user: Mapped["User"] = relationship("User")
    delivery_logs: Mapped[list["NotificationDeliveryLog"]] = relationship(
        "NotificationDeliveryLog", back_populates="notification", cascade="all, delete-orphan"
    )

    __table_args__ = (
        Index("ix_notifications_org_user", "org_id", "user_id", "is_read", "created_at"),
        Index("ix_notifications_dedup", "org_id", "user_id", "event_type", "entity_id", "created_at"),
    )

    def __repr__(self) -> str:
        return f"<Notification id={self.id} event={self.event_type} user={self.user_id} is_read={self.is_read}>"


class NotificationPreference(Base):
    """
    User notification preferences: delivery channels, quiet hours, and opted-out events.
    """

    __tablename__ = "notification_preferences"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=func.gen_random_uuid(),
        index=True,
    )
    org_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    in_app_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    email_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    digest_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    quiet_hours_start: Mapped[str | None] = mapped_column(String(5), nullable=True)  # e.g. "22:00"
    quiet_hours_end: Mapped[str | None] = mapped_column(String(5), nullable=True)    # e.g. "07:00"
    disabled_event_types: Mapped[list[str]] = mapped_column(
        JSONB, nullable=False, default=list
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=_utcnow,
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=_utcnow,
        onupdate=_utcnow,
        server_default=func.now(),
        nullable=False,
    )

    # Relationships
    user: Mapped["User"] = relationship("User")

    __table_args__ = (
        UniqueConstraint("org_id", "user_id", name="uq_notif_pref_org_user"),
        Index("ix_notif_pref_user", "org_id", "user_id"),
    )

    def __repr__(self) -> str:
        return f"<NotificationPreference id={self.id} user={self.user_id}>"


class NotificationDeliveryLog(Base):
    """
    FR-NTF-004 Delivery log per notification across channels.
    """

    __tablename__ = "notification_delivery_logs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=func.gen_random_uuid(),
        index=True,
    )
    org_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    notification_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("notifications.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    channel: Mapped[str] = mapped_column(
        String(30), nullable=False
    )  # in_app, email, sms, whatsapp
    status: Mapped[str] = mapped_column(
        String(30), nullable=False
    )  # delivered, sent, failed, suppressed
    recipient: Mapped[str] = mapped_column(String(255), nullable=False)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    attempted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=_utcnow,
        server_default=func.now(),
        nullable=False,
    )

    # Relationships
    notification: Mapped["Notification"] = relationship("Notification", back_populates="delivery_logs")

    __table_args__ = (
        Index("ix_notif_log_org", "org_id", "notification_id"),
    )

    def __repr__(self) -> str:
        return f"<NotificationDeliveryLog id={self.id} channel={self.channel} status={self.status}>"
