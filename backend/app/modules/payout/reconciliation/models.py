"""
DSA OS — Payout Reconciliation Domain Models
Implements:
- Statement import batches with 24-hour reversal window
- Saved lender column mappings for reusable CSV/Excel ingestion
- Bank payout receipts with exact Decimal amounts and TDS tracking
- Reconciliation match links with signed variance and tolerance classification
- Clawback events per lender application
"""

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import TYPE_CHECKING, Any

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
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
    from app.modules.payout.models import PayoutExpectation


class ImportBatch(TenantModel):
    """Tracks a single lender statement file ingestion batch."""

    __tablename__ = "import_batches"

    lender_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("lenders.id", ondelete="CASCADE"), nullable=False
    )
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    total_rows: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    matched_rows: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    unmatched_rows: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    error_rows: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    total_received_amount: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), default=Decimal("0.00"), nullable=False
    )

    # Status: 'dry_run', 'committed', 'reversed'
    status: Mapped[str] = mapped_column(String(50), default="committed", nullable=False)
    reversed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    reversal_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    # Relationships
    lender: Mapped["Lender"] = relationship("Lender")
    creator: Mapped["User | None"] = relationship("User")
    receipts: Mapped[list["PayoutReceipt"]] = relationship(
        "PayoutReceipt", back_populates="import_batch"
    )

    __table_args__ = (
        Index("ix_import_batches_lender", "org_id", "lender_id"),
        Index("ix_import_batches_status", "org_id", "status"),
    )

    def __repr__(self) -> str:
        return f"<ImportBatch(id={self.id}, file='{self.filename}', status='{self.status}')>"


class StatementColumnMapping(TenantModel):
    """Saved column mapping configuration for a lender's statement format."""

    __tablename__ = "statement_column_mappings"

    lender_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("lenders.id", ondelete="CASCADE"), nullable=False
    )
    mapping_name: Mapped[str] = mapped_column(String(100), nullable=False, default="Default Format")
    mappings: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    is_default: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    lender: Mapped["Lender"] = relationship("Lender")

    __table_args__ = (
        Index("ix_statement_mappings_lender", "org_id", "lender_id"),
    )

    def __repr__(self) -> str:
        return f"<StatementColumnMapping(id={self.id}, lender_id={self.lender_id}, name='{self.mapping_name}')>"


class PayoutReceipt(TenantModel):
    """
    Commission payment credit recorded from a bank statement or entered manually.
    FR-PAY-007: Can only be linked to a case in Disbursed status (BR-07).
    """

    __tablename__ = "payout_receipts"

    lender_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("lenders.id", ondelete="CASCADE"), nullable=False
    )
    import_batch_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("import_batches.id", ondelete="SET NULL"), nullable=True
    )
    loan_account_no: Mapped[str | None] = mapped_column(String(100), nullable=True)
    customer_name: Mapped[str | None] = mapped_column(String(255), nullable=True)

    received_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    tds_amount: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), default=Decimal("0.00"), nullable=False
    )
    net_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    payment_date: Mapped[date] = mapped_column(Date, nullable=False)
    utr_reference: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # Match status: 'unmatched', 'matched', 'partially_matched', 'clawback'
    match_status: Mapped[str] = mapped_column(String(50), default="unmatched", nullable=False)

    case_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("cases.id", ondelete="SET NULL"), nullable=True
    )
    lender_application_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("lender_applications.id", ondelete="SET NULL"), nullable=True
    )

    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)

    # Relationships
    lender: Mapped["Lender"] = relationship("Lender")
    import_batch: Mapped["ImportBatch | None"] = relationship(
        "ImportBatch", back_populates="receipts"
    )
    case: Mapped["Case | None"] = relationship("Case")
    lender_application: Mapped["LenderApplication | None"] = relationship("LenderApplication")
    reconciliation: Mapped["Reconciliation | None"] = relationship(
        "Reconciliation", back_populates="receipt", uselist=False
    )

    __table_args__ = (
        Index("ix_payout_receipts_lender", "org_id", "lender_id"),
        Index("ix_payout_receipts_lan", "org_id", "loan_account_no"),
        Index("ix_payout_receipts_match_status", "org_id", "match_status"),
    )

    def __repr__(self) -> str:
        return f"<PayoutReceipt(id={self.id}, lan='{self.loan_account_no}', net={self.net_amount}, match='{self.match_status}')>"


class Reconciliation(TenantModel):
    """
    Match link between expected commission receivable and actual received bank payout.
    Records signed variance and classification (matched, short, excess, discrepancy).
    """

    __tablename__ = "reconciliations"

    expectation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("payout_expectations.id", ondelete="CASCADE"),
        nullable=False,
    )
    receipt_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("payout_receipts.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )

    expected_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    received_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    variance_amount: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), nullable=False
    )  # signed: received - expected

    # Status: 'matched' (within tolerance), 'short' (received < expected), 'excess' (received > expected), 'discrepancy'
    status: Mapped[str] = mapped_column(String(50), nullable=False)
    tolerance_used: Mapped[Decimal] = mapped_column(
        Numeric(10, 2), default=Decimal("10.00"), nullable=False
    )
    is_manual: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    reconciled_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    reconciled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Relationships
    expectation: Mapped["PayoutExpectation"] = relationship("PayoutExpectation")
    receipt: Mapped["PayoutReceipt"] = relationship("PayoutReceipt", back_populates="reconciliation")
    reconciler: Mapped["User | None"] = relationship("User")

    __table_args__ = (
        Index("ix_reconciliations_expectation", "org_id", "expectation_id"),
        Index("ix_reconciliations_receipt", "org_id", "receipt_id"),
        Index("ix_reconciliations_status", "org_id", "status"),
    )

    def __repr__(self) -> str:
        return f"<Reconciliation(id={self.id}, exp={self.expectation_id}, var={self.variance_amount}, status='{self.status}')>"


class ClawbackEvent(TenantModel):
    """
    Tracks lender commission clawbacks resulting from early loan foreclosure
    or 90-day delinquency within the lender agreement clawback window.
    """

    __tablename__ = "clawback_events"

    case_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("cases.id", ondelete="CASCADE"), nullable=False
    )
    lender_application_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("lender_applications.id", ondelete="CASCADE"),
        nullable=False,
    )
    expectation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("payout_expectations.id", ondelete="CASCADE"),
        nullable=False,
    )
    receipt_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("payout_receipts.id", ondelete="SET NULL"), nullable=True
    )

    clawback_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    reason: Mapped[str] = mapped_column(String(255), nullable=False)
    effective_date: Mapped[date] = mapped_column(Date, nullable=False)

    # Status: 'pending', 'recovered', 'written_off'
    status: Mapped[str] = mapped_column(String(50), default="pending", nullable=False)

    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    # Relationships
    case: Mapped["Case"] = relationship("Case")
    lender_application: Mapped["LenderApplication"] = relationship("LenderApplication")
    expectation: Mapped["PayoutExpectation"] = relationship("PayoutExpectation")
    receipt: Mapped["PayoutReceipt | None"] = relationship("PayoutReceipt")
    creator: Mapped["User | None"] = relationship("User")

    __table_args__ = (
        Index("ix_clawback_events_case", "org_id", "case_id"),
        Index("ix_clawback_events_status", "org_id", "status"),
    )

    def __repr__(self) -> str:
        return f"<ClawbackEvent(id={self.id}, amount={self.clawback_amount}, status='{self.status}')>"
