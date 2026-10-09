"""
DSA OS — Privacy, DSAR, Breach Register, and 2FA Models

Implements Phase 10 hardening models:
- UserTOTP (FR-AUTH-004)
- DataSubjectRequest (FR-PRV-003)
- BreachRegister (FR-PRV-005)
- RetentionSchedule (FR-PRV-004)
"""

import uuid
from datetime import UTC, date, datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.modules.auth.models import User
    from app.modules.parties.models import Party


def _utcnow() -> datetime:
    return datetime.now(UTC)


class UserTOTP(Base):
    """Stores TOTP secret and recovery codes per user."""

    __tablename__ = "user_totp"

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
    secret: Mapped[str] = mapped_column(String(255), nullable=False)
    is_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    recovery_codes: Mapped[list[str]] = mapped_column(
        JSONB, nullable=False, default=list
    )
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

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

    user: Mapped["User"] = relationship("User")

    __table_args__ = (
        UniqueConstraint("org_id", "user_id", name="uq_user_totp_org_user"),
        Index("ix_user_totp_user", "org_id", "user_id"),
    )


class DataSubjectRequest(Base):
    """FR-PRV-003 Data Subject Access Request (DSAR) and Consent Withdrawal log."""

    __tablename__ = "data_subject_requests"

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
    party_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("parties.id", ondelete="CASCADE"),
        nullable=False,
    )
    request_type: Mapped[str] = mapped_column(
        String(50), nullable=False
    )  # access, correction, erasure, consent_withdrawal
    status: Mapped[str] = mapped_column(
        String(50), nullable=False, default="pending"
    )  # pending, in_progress, completed, rejected
    due_date: Mapped[date] = mapped_column(Date, nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    requested_by: Mapped[str] = mapped_column(String(255), nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
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

    party: Mapped["Party"] = relationship("Party")
    creator: Mapped["User | None"] = relationship("User", foreign_keys=[created_by])

    __table_args__ = (
        Index("ix_dsar_org_party", "org_id", "party_id"),
        Index("ix_dsar_status", "org_id", "status"),
    )


class BreachRegister(Base):
    """FR-PRV-005 Personal-data breach register and incident log."""

    __tablename__ = "breach_register"

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
    incident_ref: Mapped[str] = mapped_column(String(50), nullable=False)
    severity: Mapped[str] = mapped_column(
        String(20), nullable=False
    )  # low, medium, high, critical
    status: Mapped[str] = mapped_column(
        String(50), nullable=False, default="reported"
    )  # reported, triaged, contained, resolved
    detected_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    triaged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    containment_steps: Mapped[str | None] = mapped_column(Text, nullable=True)
    affected_parties_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    reported_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
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

    reporter: Mapped["User | None"] = relationship("User", foreign_keys=[reported_by])

    __table_args__ = (Index("ix_breach_org_status", "org_id", "status"),)


class RetentionSchedule(Base):
    """FR-PRV-004 Configurable retention schedule and legal hold settings."""

    __tablename__ = "retention_schedules"

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
    entity_type: Mapped[str] = mapped_column(String(50), nullable=False)
    retention_years: Mapped[int] = mapped_column(Integer, default=8, nullable=False)
    legal_hold: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

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

    __table_args__ = (
        UniqueConstraint("org_id", "entity_type", name="uq_retention_org_entity"),
    )
