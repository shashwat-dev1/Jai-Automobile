"""
DSA OS — Source Model

Represents lead sources: dealerships, sub-DSAs, connectors, direct walk-ins.
"""

import uuid
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, ForeignKey, Index, Numeric, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.shared.models import TenantModel

if TYPE_CHECKING:
    from app.modules.cases.models import Case


class Source(TenantModel):
    """Lead generation source entity."""

    __tablename__ = "sources"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    type: Mapped[str] = mapped_column(
        String(50), nullable=False, default="dealer"
    )  # dealer, sub_dsa, connector, direct, walk_in, employee

    parent_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("sources.id", ondelete="SET NULL"), nullable=True
    )
    contact_person: Mapped[str | None] = mapped_column(String(255), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(15), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    payout_rate_default: Mapped[Decimal | None] = mapped_column(
        Numeric(5, 2), nullable=True
    )  # Default commission %
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Relationships
    parent: Mapped["Source | None"] = relationship(
        "Source", remote_side="Source.id", backref="sub_sources"
    )
    cases: Mapped[list["Case"]] = relationship("Case", back_populates="source")

    __table_args__ = (
        Index("ix_sources_org_name", "org_id", "name"),
        Index("ix_sources_org_type", "org_id", "type"),
    )

    def __repr__(self) -> str:
        return f"<Source(id={self.id}, name='{self.name}', type='{self.type}')>"
