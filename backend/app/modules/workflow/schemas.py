"""
DSA OS — Follow-up Tasks and Workflow SLA Schemas
"""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class TaskCreateRequest(BaseModel):
    case_id: uuid.UUID | None = None
    lender_application_id: uuid.UUID | None = None
    type: str = Field("other", max_length=50)
    title: str = Field(..., min_length=2, max_length=255)
    description: str | None = None
    due_date: datetime
    assigned_to_id: uuid.UUID | None = None


class TaskUpdateRequest(BaseModel):
    status: str | None = Field(None, pattern="^(pending|completed|cancelled)$")
    outcome_notes: str | None = None
    due_date: datetime | None = None
    assigned_to_id: uuid.UUID | None = None


class TaskResponse(BaseModel):
    id: uuid.UUID
    org_id: uuid.UUID
    case_id: uuid.UUID | None = None
    case_no: str | None = None
    lender_application_id: uuid.UUID | None = None
    type: str
    title: str
    description: str | None = None
    owner_id: uuid.UUID
    owner_name: str | None = None
    due_date: datetime
    status: str
    completed_at: datetime | None = None
    notes: str | None = None
    is_overdue: bool = False
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class SLAConfigItem(BaseModel):
    entity_type: str = Field(..., pattern="^(case|lender_application)$")
    status: str
    sla_hours: int = Field(..., gt=0, le=1000)
    is_active: bool = True


class SLAConfigRequest(BaseModel):
    items: list[SLAConfigItem]


class StatusTransitionResponse(BaseModel):
    case_transitions: dict[str, list[str]]
    application_transitions: dict[str, list[str]]
