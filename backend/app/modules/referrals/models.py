"""
DSA OS — Referral Partner & Commission Domain Models
"""

import uuid
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import (
    Date,
    DateTime,
    ForeignKey,
    Index,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.shared.models import TenantModel

if TYPE_CHECKING:
    from app.modules.auth.models import User
    from app.modules.cases.models import Case


def _utcnow() -> datetime:
    return datetime.now(UTC)


class ReferralProfile(TenantModel):
    """
    A referral partner identity in a DSA organization.
    Resolved primarily by mobile number (passwordless / guest referral profile).
    """

    __tablename__ = "referral_profiles"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    mobile_primary: Mapped[str] = mapped_column(String(15), nullable=False)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Verification state: pending_verification, verified, rejected
    verification_status: Mapped[str] = mapped_column(
        String(50), nullable=False, default="pending_verification"
    )
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    verified_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Relationships
    cases: Mapped[list["Case"]] = relationship("Case", back_populates="referral_profile")
    commissions: Mapped[list["ReferralCommission"]] = relationship(
        "ReferralCommission", back_populates="referral_profile", cascade="all, delete-orphan"
    )

    __table_args__ = (
        UniqueConstraint("org_id", "mobile_primary", name="uq_referral_profiles_org_mobile"),
        Index("ix_referral_profiles_org_name", "org_id", "name"),
        Index("ix_referral_profiles_org_status", "org_id", "verification_status"),
    )

    @property
    def masked_mobile(self) -> str:
        """Mask mobile number: e.g. 98****1234"""
        if not self.mobile_primary or len(self.mobile_primary) < 6:
            return self.mobile_primary or ""
        return f"{self.mobile_primary[:2]}****{self.mobile_primary[-4:]}"


class ReferralCommission(TenantModel):
    """
    A commission expectation, approval, or disbursement record for a referral partner.
    Kept strictly separate from bank lender commissions and reconciliation grids.
    """

    __tablename__ = "referral_commissions"

    referral_profile_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("referral_profiles.id", ondelete="CASCADE"), nullable=False
    )
    case_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("cases.id", ondelete="SET NULL"), nullable=True
    )

    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    basis: Mapped[str] = mapped_column(String(255), nullable=False)  # e.g. "Flat Fee", "0.5% Loan"

    # Status: pending_review, approved, rejected, payable, paid
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="pending_review")

    payment_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    payment_reference: Mapped[str | None] = mapped_column(String(255), nullable=True)  # UTR / Bank Ref

    approved_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    paid_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Relationships
    referral_profile: Mapped["ReferralProfile"] = relationship(
        "ReferralProfile", back_populates="commissions"
    )
    case: Mapped["Case | None"] = relationship("Case")

    __table_args__ = (
        Index("ix_referral_commissions_org_status", "org_id", "status"),
        Index("ix_referral_commissions_org_partner", "org_id", "referral_profile_id"),
    )
