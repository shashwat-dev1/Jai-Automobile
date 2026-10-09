"""
DSA OS — Follow-up Tasks and SLA Configuration Models
"""

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.shared.models import TenantModel

if TYPE_CHECKING:
    from app.modules.auth.models import User
    from app.modules.cases.models import Case
    from app.modules.lenders.models import LenderApplication


class Task(TenantModel):
    """
    Follow-up task, client call, query resolution or document pickup task.
    Tenant-isolated with PostgreSQL RLS.
    """

    __tablename__ = "tasks"

    case_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("cases.id", ondelete="CASCADE"), nullable=True
    )
    lender_application_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("lender_applications.id", ondelete="CASCADE"),
        nullable=True,
    )
    type: Mapped[str] = mapped_column(
        String(50), nullable=False, default="other"
    )  # call, document_pickup, query_resolution, bank_followup, other
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    owner_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    due_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    status: Mapped[str] = mapped_column(
        String(50), nullable=False, default="pending"
    )  # pending, completed, cancelled
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Relationships
    case: Mapped["Case | None"] = relationship("Case", foreign_keys=[case_id])
    lender_application: Mapped["LenderApplication | None"] = relationship(
        "LenderApplication", back_populates="tasks", foreign_keys=[lender_application_id]
    )
    owner: Mapped["User"] = relationship("User", foreign_keys=[owner_id])

    __table_args__ = (
        Index("ix_tasks_org_owner_status", "org_id", "owner_id", "status"),
        Index("ix_tasks_org_due_date", "org_id", "due_date"),
        Index("ix_tasks_org_case", "org_id", "case_id"),
    )

    def __repr__(self) -> str:
        return f"<Task(id={self.id}, title='{self.title}', status='{self.status}', due_date={self.due_date})>"


class SLAConfig(TenantModel):
    """
    SLA turnaround thresholds (in hours) per stage for cases and lender applications.
    Used for ageing computation and stuck case detection.
    """

    __tablename__ = "sla_configs"

    entity_type: Mapped[str] = mapped_column(
        String(50), nullable=False
    )  # 'case' or 'lender_application'
    status: Mapped[str] = mapped_column(String(50), nullable=False)
    sla_hours: Mapped[int] = mapped_column(Integer, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    __table_args__ = (
        Index("ix_sla_configs_org_entity_status", "org_id", "entity_type", "status", unique=True),
    )

    def __repr__(self) -> str:
        return f"<SLAConfig(entity='{self.entity_type}', status='{self.status}', sla_hours={self.sla_hours})>"
