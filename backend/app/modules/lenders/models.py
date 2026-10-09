"""
DSA OS — Lender and Lender Application Domain Models
"""

import uuid
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import TYPE_CHECKING

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
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.shared.models import TenantModel

if TYPE_CHECKING:
    from app.modules.cases.models import Case
    from app.modules.pdd.models import PDDItem
    from app.modules.workflow.models import Task


def _utcnow() -> datetime:
    return datetime.now(UTC)


class Lender(TenantModel):
    """
    Lender partner organization (Bank, NBFC, SFB, HFC) empanelled with the DSA.
    Tenant-isolated via org_id with PostgreSQL RLS.
    """

    __tablename__ = "lenders"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    code: Mapped[str | None] = mapped_column(String(50), nullable=True)
    type: Mapped[str] = mapped_column(String(50), nullable=False, default="bank")  # bank, nbfc, sfb, hfc
    products: Mapped[list[str]] = mapped_column(
        JSONB, nullable=False, default=list, server_default="[]"
    )
    dsa_code: Mapped[str | None] = mapped_column(String(100), nullable=True)
    contact_person: Mapped[str | None] = mapped_column(String(255), nullable=True)
    contact_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    contact_mobile: Mapped[str | None] = mapped_column(String(15), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    # Relationships
    applications: Mapped[list["LenderApplication"]] = relationship(
        "LenderApplication", back_populates="lender", cascade="all, delete-orphan"
    )

    __table_args__ = (
        Index("ix_lenders_org_name", "org_id", "name", unique=True),
        Index("ix_lenders_org_active", "org_id", "is_active"),
    )

    def __repr__(self) -> str:
        return f"<Lender(id={self.id}, name='{self.name}', type='{self.type}')>"


class LenderApplication(TenantModel):
    """
    Submission of a case to a specific lender.
    One Case can have multiple Lender Applications (multi-login comparison).
    BR-05: Exactly one winning application allowed per case.
    BR-08: Disbursal amount cannot exceed sanction amount without recorded override.
    """

    __tablename__ = "lender_applications"

    case_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("cases.id", ondelete="CASCADE"), nullable=False
    )
    lender_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("lenders.id", ondelete="RESTRICT"), nullable=False
    )
    product: Mapped[str] = mapped_column(String(50), nullable=False)
    login_ref: Mapped[str | None] = mapped_column(String(100), nullable=True)
    login_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    # Canonical status lifecycle per Data Dictionary 1.3
    status: Mapped[str] = mapped_column(
        String(50), nullable=False, default="logged_in", server_default="logged_in"
    )
    query_notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Sanction details
    sanction_amount: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    sanction_tenure_months: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sanction_rate: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)
    sanction_margin_money: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    sanction_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    # Rejection details (BR-04)
    rejection_reason_code: Mapped[str | None] = mapped_column(String(100), nullable=True)
    rejection_notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Disbursal details (BR-08)
    disbursal_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    disbursal_amount: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    disbursal_ref: Mapped[str | None] = mapped_column(String(100), nullable=True)
    disbursal_override_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Single-winning invariant (BR-05)
    is_winning: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # Stage tracking for SLA ageing
    entered_stage_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=_utcnow,
        server_default=func.now(),
        nullable=False,
    )

    # Relationships
    case: Mapped["Case"] = relationship("Case", foreign_keys=[case_id])
    lender: Mapped["Lender"] = relationship("Lender", back_populates="applications")
    tasks: Mapped[list["Task"]] = relationship(
        "Task", back_populates="lender_application", cascade="all, delete-orphan"
    )
    pdd_items: Mapped[list["PDDItem"]] = relationship(
        "PDDItem", back_populates="lender_application", cascade="all, delete-orphan"
    )

    __table_args__ = (
        Index("ix_lender_applications_org_case", "org_id", "case_id"),
        Index("ix_lender_applications_org_lender", "org_id", "lender_id"),
        Index("ix_lender_applications_org_status", "org_id", "status"),
    )

    def __repr__(self) -> str:
        return (
            f"<LenderApplication(id={self.id}, case_id={self.case_id}, "
            f"lender_id={self.lender_id}, status='{self.status}', is_winning={self.is_winning})>"
        )
