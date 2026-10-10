"""
DSA OS — Case, Vehicle, CaseParty, Consent, and StatusHistory Models

Central domain entity relationships:
- One Case has one primary applicant (and optional co-applicants/guarantors)
- One Case has one primary vehicle record
- One Case has one lead Source
- One Case has one Case Owner (loan officer) and optional Assigned Processor
"""

import uuid
from datetime import UTC, datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.shared.models import TenantModel


def _utcnow() -> datetime:
    return datetime.now(UTC)

if TYPE_CHECKING:
    from app.modules.auth.models import User
    from app.modules.lenders.models import LenderApplication
    from app.modules.parties.models import Party
    from app.modules.pdd.models import PDDItem
    from app.modules.referrals.models import ReferralProfile
    from app.modules.sources.models import Source
    from app.modules.workflow.models import Task


class Case(TenantModel):
    """The central loan file entity."""

    __tablename__ = "cases"

    case_no: Mapped[str] = mapped_column(String(50), nullable=False)
    product_type: Mapped[str] = mapped_column(
        String(50), nullable=False, default="used_car"
    )  # new_car, used_car, commercial_vehicle, two_wheeler, refinance, top_up, balance_transfer

    status: Mapped[str] = mapped_column(
        String(50), nullable=False, default="lead"
    )  # canonical state machine status

    entered_stage_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=_utcnow,
        server_default=func.now(),
        nullable=False,
    )

    loan_amount_requested: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    loan_amount_sanctioned: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    loan_amount_disbursed: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)

    # Attribution & Assignment
    source_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("sources.id"), nullable=False
    )
    source_executive: Mapped[str | None] = mapped_column(String(255), nullable=True)

    owner_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    assigned_processor_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )

    # Referral Attribution
    referral_profile_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("referral_profiles.id", ondelete="SET NULL"), nullable=True
    )
    referral_partner_name: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Telecaller Assignment & Call Activity
    assigned_telecaller_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    assigned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    assigned_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    call_outcome: Mapped[str | None] = mapped_column(String(50), nullable=True)
    telecaller_remarks: Mapped[str | None] = mapped_column(Text, nullable=True)
    follow_up_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    call_attempts_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Optimistic locking
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)

    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Relationships
    source: Mapped["Source"] = relationship("Source", back_populates="cases")
    owner: Mapped["User"] = relationship("User", foreign_keys=[owner_id])
    assigned_processor: Mapped["User | None"] = relationship(
        "User", foreign_keys=[assigned_processor_id]
    )
    assigned_telecaller: Mapped["User | None"] = relationship(
        "User", foreign_keys=[assigned_telecaller_id]
    )
    referral_profile: Mapped["ReferralProfile | None"] = relationship(
        "ReferralProfile", back_populates="cases"
    )
    case_parties: Mapped[list["CaseParty"]] = relationship(
        "CaseParty", back_populates="case", cascade="all, delete-orphan"
    )
    vehicle: Mapped["Vehicle | None"] = relationship(
        "Vehicle", back_populates="case", uselist=False, cascade="all, delete-orphan"
    )
    status_history: Mapped[list["CaseStatusHistory"]] = relationship(
        "CaseStatusHistory", back_populates="case", cascade="all, delete-orphan"
    )
    consent_records: Mapped[list["ConsentRecord"]] = relationship(
        "ConsentRecord", back_populates="case", cascade="all, delete-orphan"
    )
    applications: Mapped[list["LenderApplication"]] = relationship(
        "LenderApplication", back_populates="case", cascade="all, delete-orphan"
    )
    tasks: Mapped[list["Task"]] = relationship(
        "Task", back_populates="case", cascade="all, delete-orphan"
    )
    pdd_items: Mapped[list["PDDItem"]] = relationship(
        "PDDItem", back_populates="case", cascade="all, delete-orphan"
    )

    __table_args__ = (
        UniqueConstraint("org_id", "case_no", name="uq_cases_org_case_no"),
        Index("ix_cases_org_status", "org_id", "status"),
        Index("ix_cases_org_owner", "org_id", "owner_id"),
        Index("ix_cases_org_source", "org_id", "source_id"),
        Index("ix_cases_org_telecaller", "org_id", "assigned_telecaller_id"),
        Index("ix_cases_org_referral", "org_id", "referral_profile_id"),
        Index("ix_cases_org_created_at", "org_id", "created_at"),
    )

    def __repr__(self) -> str:
        return f"<Case(id={self.id}, case_no='{self.case_no}', status='{self.status}')>"


class CaseParty(TenantModel):
    """Junction table associating a Party with a Case in a specific role."""

    __tablename__ = "case_parties"

    case_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("cases.id", ondelete="CASCADE"), nullable=False
    )
    party_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("parties.id", ondelete="RESTRICT"), nullable=False
    )
    role: Mapped[str] = mapped_column(
        String(50), nullable=False, default="applicant"
    )  # applicant, co_applicant, guarantor, seller
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    case: Mapped["Case"] = relationship("Case", back_populates="case_parties")
    party: Mapped["Party"] = relationship("Party", back_populates="case_associations")

    __table_args__ = (
        UniqueConstraint("case_id", "party_id", "role", name="uq_case_party_role"),
        Index("ix_case_parties_org_case", "org_id", "case_id"),
        Index("ix_case_parties_org_party", "org_id", "party_id"),
    )


class Vehicle(TenantModel):
    """Vehicle asset associated with the loan case."""

    __tablename__ = "vehicles"

    case_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("cases.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
    )
    vehicle_type: Mapped[str] = mapped_column(String(50), nullable=False, default="four_wheeler")
    make: Mapped[str] = mapped_column(String(100), nullable=False)
    model: Mapped[str] = mapped_column(String(100), nullable=False)
    variant: Mapped[str | None] = mapped_column(String(100), nullable=True)
    year_of_manufacture: Mapped[int | None] = mapped_column(Integer, nullable=True)
    condition: Mapped[str] = mapped_column(String(20), nullable=False, default="used")  # new, used

    # Identification
    registration_no: Mapped[str | None] = mapped_column(String(20), nullable=True)
    chassis_no: Mapped[str | None] = mapped_column(String(50), nullable=True)
    engine_no: Mapped[str | None] = mapped_column(String(50), nullable=True)

    # Financials
    valuation_amount: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    ex_showroom_price: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    on_road_price: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    existing_hypothecation: Mapped[str | None] = mapped_column(String(255), nullable=True)

    case: Mapped["Case"] = relationship("Case", back_populates="vehicle")

    __table_args__ = (
        Index("ix_vehicles_registration_no", "registration_no"),
        Index("ix_vehicles_org_case", "org_id", "case_id"),
    )


class ConsentRecord(TenantModel):
    """Explicit privacy and data processing consent record."""

    __tablename__ = "consent_records"

    party_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("parties.id", ondelete="CASCADE"), nullable=False
    )
    case_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("cases.id", ondelete="SET NULL"), nullable=True
    )
    purpose: Mapped[str] = mapped_column(String(100), nullable=False, default="loan_processing")
    consent_type: Mapped[str] = mapped_column(
        String(50), nullable=False, default="physical_form"
    )  # physical_form, digital_sms, verbal_recorded, electronic_declaration
    is_given: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    ip_address: Mapped[str | None] = mapped_column(String(45), nullable=True)
    recorded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )
    recorded_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )

    party: Mapped["Party"] = relationship("Party", back_populates="consent_records")
    case: Mapped["Case | None"] = relationship("Case", back_populates="consent_records")

    __table_args__ = (
        Index("ix_consent_party_purpose", "party_id", "purpose"),
        Index("ix_consent_org_party", "org_id", "party_id"),
    )


class CaseStatusHistory(TenantModel):
    """Append-only audit trail of case status transitions."""

    __tablename__ = "case_status_history"

    case_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("cases.id", ondelete="CASCADE"), nullable=False
    )
    from_status: Mapped[str | None] = mapped_column(String(50), nullable=True)
    to_status: Mapped[str] = mapped_column(String(50), nullable=False)
    reason: Mapped[str | None] = mapped_column(String(500), nullable=True)
    changed_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )

    case: Mapped["Case"] = relationship("Case", back_populates="status_history")
    changer: Mapped["User"] = relationship("User", foreign_keys=[changed_by])

    __table_args__ = (
        Index("ix_status_history_case_id", "case_id"),
        Index("ix_status_history_org_case", "org_id", "case_id"),
    )
