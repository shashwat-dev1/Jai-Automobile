"""
DSA OS — Sources Pydantic Schemas
"""

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

SourceType = Literal["dealer", "sub_dsa", "connector", "direct", "walk_in", "employee"]


class SourceBase(BaseModel):
    name: str = Field(..., min_length=2, max_length=255)
    type: SourceType = "dealer"
    parent_id: uuid.UUID | None = None
    contact_person: str | None = None
    phone: str | None = None
    email: str | None = None
    payout_rate_default: Decimal | None = Field(None, ge=0, le=100)
    is_active: bool = True


class SourceCreate(SourceBase):
    pass


class SourceUpdate(BaseModel):
    name: str | None = None
    type: SourceType | None = None
    parent_id: uuid.UUID | None = None
    contact_person: str | None = None
    phone: str | None = None
    email: str | None = None
    payout_rate_default: Decimal | None = None
    is_active: bool | None = None


class SourceResponse(SourceBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    org_id: uuid.UUID
    created_at: datetime
