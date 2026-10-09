"""
DSA OS — Authentication & User Models

User and RefreshToken models with tenant scoping (TenantModel) and immediate revocation support (auth_version).
"""

import uuid
from datetime import UTC, datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.shared.models import TenantModel


class UserRole:
    """Canonical User Roles per SRS Appendix B."""

    OWNER = "owner"
    MANAGER = "manager"
    PROCESSOR = "processor"
    FIELD_EXECUTIVE = "field_executive"
    ACCOUNTANT = "accountant"
    AUDITOR = "auditor"

    ALL_ROLES = {OWNER, MANAGER, PROCESSOR, FIELD_EXECUTIVE, ACCOUNTANT, AUDITOR}


class User(TenantModel):
    """
    User entity within an organization.
    Tenant-scoped: protected by PostgreSQL RLS.
    """

    __tablename__ = "users"
    __table_args__ = (
        UniqueConstraint("org_id", "email", name="uq_users_org_email"),
        UniqueConstraint("org_id", "mobile", name="uq_users_org_mobile"),
    )

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    mobile: Mapped[str | None] = mapped_column(String(15), nullable=True, index=True)
    role: Mapped[str] = mapped_column(String(50), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)

    # Immediate session revocation
    auth_version: Mapped[int] = mapped_column(
        Integer, nullable=False, default=1, server_default="1"
    )

    # Account status & lockout
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )
    failed_login_attempts: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    locked_until: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, default=None
    )
    last_login_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, default=None
    )

    # Relationships
    refresh_tokens: Mapped[list["RefreshToken"]] = relationship(
        "RefreshToken", back_populates="user", cascade="all, delete-orphan"
    )

    @property
    def is_locked(self) -> bool:
        """Check if user account is currently locked out."""
        if self.locked_until is None:
            return False
        return datetime.now(UTC) < self.locked_until

    def increment_auth_version(self) -> int:
        """Increment auth_version, invalidating all existing access tokens immediately."""
        self.auth_version += 1
        return self.auth_version

    def __repr__(self) -> str:
        return f"<User id={self.id} org_id={self.org_id} role={self.role} email={self.email!r}>"


class RefreshToken(TenantModel):
    """
    Rotated refresh token representing an active session.
    Tenant-scoped: protected by PostgreSQL RLS.
    """

    __tablename__ = "refresh_tokens"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, default=None
    )
    user_agent: Mapped[str | None] = mapped_column(String(500), nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String(45), nullable=True)

    # Relationship
    user: Mapped[User] = relationship("User", back_populates="refresh_tokens")

    @property
    def is_valid(self) -> bool:
        """Check if refresh token is unrevoked and unexpired."""
        if self.revoked_at is not None:
            return False
        return datetime.now(UTC) < self.expires_at

    def revoke(self) -> None:
        """Revoke this refresh token."""
        self.revoked_at = datetime.now(UTC)
