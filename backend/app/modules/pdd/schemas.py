"""
DSA OS — Post-Disbursal Documents (PDD) Schemas
"""

import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class PDDItemCreateRequest(BaseModel):
    case_id: uuid.UUID
    lender_application_id: uuid.UUID
    document_type: str = Field(..., max_length=50)
    title: str = Field(..., min_length=2, max_length=255)
    description: str | None = None
    due_date: date
    owner_id: uuid.UUID | None = None


class PDDItemUpdateRequest(BaseModel):
    status: Literal["pending", "collected", "sent_to_lender", "acknowledged_by_lender", "rejected"] | None = None
    collected_at: datetime | None = None
    submitted_to_lender_at: datetime | None = None
    acknowledged_at: datetime | None = None
    rejection_reason: str | None = None
    lender_acknowledgement_ref: str | None = Field(None, max_length=100)
    document_id: uuid.UUID | None = None
    owner_id: uuid.UUID | None = None
    version: int = Field(1, description="Current optimistic lock version")


class PDDItemResponse(BaseModel):
    id: uuid.UUID
    org_id: uuid.UUID
    case_id: uuid.UUID
    case_no: str | None = None
    applicant_name: str | None = None
    lender_application_id: uuid.UUID
    lender_name: str | None = None
    document_type: str
    title: str
    description: str | None = None
    status: str
    due_date: date
    collected_at: datetime | None = None
    submitted_to_lender_at: datetime | None = None
    acknowledged_at: datetime | None = None
    rejection_reason: str | None = None
    lender_acknowledgement_ref: str | None = None
    document_id: uuid.UUID | None = None
    owner_id: uuid.UUID | None = None
    owner_name: str | None = None
    ageing_days: int = 0
    ageing_bucket: Literal["0_7", "8_15", "16_30", "30_plus"] = "0_7"
    is_overdue: bool = False
    version: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class PDDBoardResponse(BaseModel):
    bucket_0_7_count: int = 0
    bucket_8_15_count: int = 0
    bucket_16_30_count: int = 0
    bucket_30_plus_count: int = 0
    total_pending: int = 0
    total_completed: int = 0
    items: list[PDDItemResponse]
