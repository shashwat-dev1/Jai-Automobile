"""
DSA OS — Payout Domain Models
Implements effective-dated payout rules, expectations, frozen rule snapshots, and splits.
"""

import uuid
from datetime import date
from decimal import Decimal
from typing import TYPE_CHECKING, Any

from sqlalchemy import (
    Boolean,
    Date,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.shared.models import TenantModel

if TYPE_CHECKING:
    from app.modules.auth.models import User
    from app.modules.cases.models import Case
    from app.modules.lenders.models import Lender, LenderApplication
    from app.modules.sources.models import Source


class PayoutRule(TenantModel):
    """
    Commission structure agreed with a lender for a specific loan product.
    Effective-dated to guarantee historical calculations never mutate when rules update.
    """

    __tablename__ = "payout_rules"

    lender_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("lenders.id", ondelete="CASCADE"), nullable=False
    )
    product: Mapped[str] = mapped_column(String(50), nullable=False)
    effective_from: Mapped[date] = mapped_column(Date, nullable=False)
    effective_to: Mapped[date | None] = mapped_column(Date, nullable=True)

    # Basis: 'percent', 'slab', 'flat'
    basis: Mapped[str] = mapped_column(String(50), nullable=False, default="percent")
    rate_percent: Mapped[Decimal | None] = mapped_column(Numeric(6, 3), nullable=True)
    flat_amount: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    slabs: Mapped[list[dict[str, Any]] | None] = mapped_column(JSONB, nullable=True)
    conditions: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)

    # Gating & Tax
    gating_type: Mapped[str] = mapped_column(String(50), nullable=False, default="pdd_complete")
    tds_rate_percent: Mapped[Decimal] = mapped_column(
        Numeric(5, 2), nullable=False, default=Decimal("5.00")
    )
    gst_mode: Mapped[str] = mapped_column(String(50), nullable=False, default="forward_charge")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)

    # Relationships
    lender: Mapped["Lender"] = relationship("Lender")
    expectations: Mapped[list["PayoutExpectation"]] = relationship(
        "PayoutExpectation", back_populates="rule"
    )

    __table_args__ = (
        Index("ix_payout_rules_lender_product", "org_id", "lender_id", "product"),
        Index("ix_payout_rules_effective", "org_id", "effective_from", "effective_to"),
    )

    def __repr__(self) -> str:
        return (
            f"<PayoutRule(id={self.id}, lender_id={self.lender_id}, "
            f"product='{self.product}', basis='{self.basis}', from={self.effective_from})>"
        )


class PayoutExpectation(TenantModel):
    """
    Expected payout receivable from lender for a disbursed winning loan application.
    Contains a frozen snapshot of the matching rule terms.
    """

    __tablename__ = "payout_expectations"

    case_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("cases.id", ondelete="CASCADE"), nullable=False
    )
    lender_application_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("lender_applications.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    rule_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("payout_rules.id", ondelete="SET NULL"), nullable=True
    )
    rule_snapshot: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)

    # Financials (Exact Numeric)
    disbursal_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    gross_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    tds_rate_percent: Mapped[Decimal] = mapped_column(
        Numeric(5, 2), nullable=False, default=Decimal("5.00")
    )
    tds_amount: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), nullable=False, default=Decimal("0.00")
    )
    net_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)

    # Status: 'held', 'due', 'no_rule', 'paid', 'clawback', 'cancelled'
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="held")
    gating_status: Mapped[str] = mapped_column(String(50), nullable=False, default="pending")

    # Manual override tracking
    is_override: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    override_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    original_gross_amount: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)

    # Relationships
    case: Mapped["Case"] = relationship("Case")
    lender_application: Mapped["LenderApplication"] = relationship("LenderApplication")
    rule: Mapped["PayoutRule | None"] = relationship("PayoutRule", back_populates="expectations")
    splits: Mapped[list["PayoutSplit"]] = relationship(
        "PayoutSplit", back_populates="expectation", cascade="all, delete-orphan"
    )

    __table_args__ = (
        Index("ix_payout_expectations_case_id", "org_id", "case_id"),
        Index("ix_payout_expectations_status", "org_id", "status"),
    )

    def __repr__(self) -> str:
        return (
            f"<PayoutExpectation(id={self.id}, case_id={self.case_id}, "
            f"gross={self.gross_amount}, net={self.net_amount}, status='{self.status}')>"
        )


class PayoutSplit(TenantModel):
    """
    Sub-allocation of the expected payout to a sub-DSA dealer, executive, or channel partner.
    BR-09: Total percentage splits must not exceed 100%.
    """

    __tablename__ = "payout_splits"

    expectation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("payout_expectations.id", ondelete="CASCADE"),
        nullable=False,
    )
    beneficiary_type: Mapped[str] = mapped_column(
        String(50), nullable=False
    )  # source, sales_agent, processor, company
    source_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("sources.id", ondelete="SET NULL"), nullable=True
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    share_type: Mapped[str] = mapped_column(String(50), nullable=False, default="percent")  # percent, flat
    share_value: Mapped[Decimal] = mapped_column(Numeric(10, 3), nullable=False)
    split_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)

    expectation: Mapped["PayoutExpectation"] = relationship(
        "PayoutExpectation", back_populates="splits"
    )
    source: Mapped["Source | None"] = relationship("Source")
    user: Mapped["User | None"] = relationship("User")

    __table_args__ = (
        Index("ix_payout_splits_expectation", "org_id", "expectation_id"),
    )

    def __repr__(self) -> str:
        return f"<PayoutSplit(id={self.id}, type='{self.beneficiary_type}', amount={self.split_amount})>"
