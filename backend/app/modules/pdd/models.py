"""
DSA OS — Post-Disbursal Documents (PDD) Models
"""

import uuid
from datetime import date, datetime
from typing import TYPE_CHECKING

from sqlalchemy import Date, DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.shared.models import TenantModel

if TYPE_CHECKING:
    from app.modules.auth.models import User
    from app.modules.cases.models import Case
    from app.modules.documents.models import Document
    from app.modules.lenders.models import LenderApplication


class PDDItem(TenantModel):
    """Post-Disbursal Document tracking item linked to a disbursed lender application."""

    __tablename__ = "pdd_items"

    case_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("cases.id", ondelete="CASCADE"),
        nullable=False,
    )
    lender_application_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("lender_applications.id", ondelete="CASCADE"),
        nullable=False,
    )
    document_type: Mapped[str] = mapped_column(
        String(50), nullable=False
    )  # rc_hypothecation, insurance_clause, invoice_challan, form_34, other
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(
        String(50), nullable=False, default="pending"
    )  # pending, collected, sent_to_lender, acknowledged_by_lender, rejected
    due_date: Mapped[date] = mapped_column(Date, nullable=False)
    collected_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    submitted_to_lender_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    acknowledged_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    lender_acknowledgement_ref: Mapped[str | None] = mapped_column(
        String(100), nullable=True
    )
    document_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("documents.id", ondelete="SET NULL"),
        nullable=True,
    )
    owner_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)

    case: Mapped["Case"] = relationship("Case", back_populates="pdd_items")
    lender_application: Mapped["LenderApplication"] = relationship(
        "LenderApplication", back_populates="pdd_items"
    )
    document: Mapped["Document"] = relationship("Document")
    owner: Mapped["User"] = relationship("User")

    __table_args__ = (
        Index("ix_pdd_items_case_id", "org_id", "case_id"),
        Index("ix_pdd_items_app_id", "org_id", "lender_application_id"),
        Index("ix_pdd_items_status", "org_id", "status"),
        Index("ix_pdd_items_due_date", "org_id", "due_date"),
    )

    def __repr__(self) -> str:
        return f"<PDDItem(id={self.id}, type='{self.document_type}', status='{self.status}', due='{self.due_date}')>"
