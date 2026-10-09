"""
DSA OS — Shared SQLAlchemy Base Models

TenantModel: Base for all tenant-scoped tables.
  - org_id: mandatory FK to organizations, enforced by RLS policy
  - Soft delete via deleted_at
  - Optimistic locking via version
  - Timestamps: created_at, updated_at (UTC)

PlatformModel: Base for platform-level tables (e.g. organizations).
  - No org_id
  - No RLS
"""

import uuid
from datetime import UTC, datetime

from sqlalchemy import DateTime, ForeignKey, Integer, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


def _utcnow() -> datetime:
    """Return timezone-aware UTC now."""
    return datetime.now(UTC)


class TimestampMixin:
    """Adds created_at and updated_at timestamp columns."""

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=_utcnow,
        server_default=func.now(),
        nullable=False,
        index=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=_utcnow,
        onupdate=_utcnow,
        server_default=func.now(),
        nullable=False,
        index=False,
    )


class SoftDeleteMixin:
    """
    Adds soft delete support via deleted_at column.
    Records with deleted_at IS NOT NULL are considered deleted.
    RLS policies exclude soft-deleted records from normal queries.
    """

    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        default=None,
    )

    @property
    def is_deleted(self) -> bool:
        return self.deleted_at is not None


class OptimisticLockMixin:
    """
    Adds optimistic locking via version column.
    SQLAlchemy's with_for_update() combined with version checks
    prevents lost updates under concurrent modification.
    """

    version: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=1,
        server_default="1",
    )


class PlatformModel(TimestampMixin, Base):
    """
    Base class for platform-level (non-tenant) tables.
    Example: organizations

    No RLS on these tables. Access controlled at application level.
    """

    __abstract__ = True

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,  # Note: uuid7 via application code when available
        server_default=func.gen_random_uuid(),
        index=True,
    )


class TenantModel(TimestampMixin, SoftDeleteMixin, OptimisticLockMixin, Base):
    """
    Base class for all tenant-scoped tables.

    IMPORTANT:
    - Every subclass table MUST have FORCE ROW LEVEL SECURITY enabled
    - RLS policies MUST include org_id matching via app.current_org_id
    - The application connects as dsaos_app which cannot bypass RLS
    - Always call set_tenant_context() before querying tenant tables

    Column order convention: id, org_id, ... domain columns ..., timestamps
    """

    __abstract__ = True

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
