"""
DSA OS — Data Import & Export Schemas
"""

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class ImportRowError(BaseModel):
    row: int
    field: str
    message: str


class ImportDryRunResponse(BaseModel):
    total_rows: int
    valid_rows: int
    error_rows: int
    errors: list[ImportRowError]
    valid_records: list[dict[str, Any]]


class ImportCommitRequest(BaseModel):
    entity_type: str = Field(..., description="parties, sources, lenders")
    filename: str
    records: list[dict[str, Any]]


class ImportBatchResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    org_id: UUID
    entity_type: str
    filename: str
    total_rows: int
    valid_rows: int
    error_rows: int
    errors: list[dict[str, Any]]
    status: str
    can_reverse_until: datetime | None = None
    reversed_at: datetime | None = None
    imported_ids: list[str]
    created_at: datetime
