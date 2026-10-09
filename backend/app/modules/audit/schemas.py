"""
DSA OS — Audit Log Schemas
"""

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class AuditLogEntry(BaseModel):
    """Audit log entry representation."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    org_id: UUID | None
    actor_id: UUID | None
    actor_role: str | None
    action: str
    entity_type: str
    entity_id: str | None
    changes: dict[str, Any] | None
    ip_address: str | None
    user_agent: str | None
    occurred_at: datetime


class AuditSearchParams(BaseModel):
    """Filters for searching audit trail."""

    actor_id: UUID | None = None
    action: str | None = None
    entity_type: str | None = None
    from_date: datetime | None = None
    to_date: datetime | None = None
    page: int = Field(1, ge=1)
    page_size: int = Field(25, ge=1, le=100)
