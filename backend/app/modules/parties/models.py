"""
DSA OS — Party Model

Represents individuals or business entities participating in loan cases.
Sensitive fields:
- PAN is encrypted at rest; last 4 characters are indexed.
- Aadhaar is never stored in full. Only the last 4 digits are recorded.
"""

from datetime import date
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import Date, Index, Integer, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.shared.models import TenantModel

if TYPE_CHECKING:
    from app.modules.cases.models import CaseParty, ConsentRecord


class Party(TenantModel):
    """Party entity (Customer, Co-applicant, Guarantor, Seller)."""

    __tablename__ = "parties"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    mobile_primary: Mapped[str] = mapped_column(String(15), nullable=False)
    mobile_secondary: Mapped[str | None] = mapped_column(String(15), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Sensitive PII
    pan_encrypted: Mapped[str | None] = mapped_column(String(512), nullable=True)
    pan_last_four: Mapped[str | None] = mapped_column(String(4), nullable=True)
    aadhaar_last_four: Mapped[str | None] = mapped_column(String(4), nullable=True)

    # Demographics & Employment
    employment_type: Mapped[str | None] = mapped_column(
        String(50), nullable=True, default="salaried"
    )
    dob: Mapped[date | None] = mapped_column(Date, nullable=True)
    address_line1: Mapped[str | None] = mapped_column(String(255), nullable=True)
    address_line2: Mapped[str | None] = mapped_column(String(255), nullable=True)
    city: Mapped[str | None] = mapped_column(String(100), nullable=True)
    state: Mapped[str | None] = mapped_column(String(100), nullable=True)
    pincode: Mapped[str | None] = mapped_column(String(10), nullable=True)
    monthly_income: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)

    # Optimistic locking
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)

    # Relationships
    case_associations: Mapped[list["CaseParty"]] = relationship(
        "CaseParty", back_populates="party", cascade="all, delete-orphan"
    )
    consent_records: Mapped[list["ConsentRecord"]] = relationship(
        "ConsentRecord", back_populates="party", cascade="all, delete-orphan"
    )

    __table_args__ = (
        Index("ix_parties_org_mobile", "org_id", "mobile_primary"),
        Index("ix_parties_org_pan_last_four", "org_id", "pan_last_four"),
        Index("ix_parties_org_name", "org_id", "name"),
    )

    def __repr__(self) -> str:
        return f"<Party(id={self.id}, name='{self.name}', mobile='{self.mobile_primary}')>"
