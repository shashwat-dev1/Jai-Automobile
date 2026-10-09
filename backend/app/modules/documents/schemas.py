"""DSA OS — Document Schemas

Pydantic validation schemas for document checklist, secure upload URLs,
status transitions, and download URLs.
"""

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class DocumentTypeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    code: str
    name: str
    group_name: str
    validity_days: int | None = None
    is_sensitive: bool
    is_active: bool


class UploadUrlRequest(BaseModel):
    case_id: uuid.UUID
    document_type_id: uuid.UUID
    file_name: str = Field(..., min_length=1, max_length=255)
    file_size: int = Field(..., gt=0, le=15 * 1024 * 1024)
    mime_type: str


class UploadUrlResponse(BaseModel):
    upload_id: uuid.UUID
    upload_url: str
    quarantine_key: str
    expires_in_seconds: int = 300


class UploadConfirmRequest(BaseModel):
    upload_id: uuid.UUID
    case_id: uuid.UUID
    document_type_id: uuid.UUID
    file_name: str
    file_size: int
    mime_type: str
    quarantine_key: str
    auto_validate: bool = True  # Run validation immediately


class DocumentItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    org_id: uuid.UUID
    case_id: uuid.UUID | None
    document_type_id: uuid.UUID
    file_name: str
    file_size: int
    mime_type: str
    version: int
    status: str
    scan_result: dict[str, Any] | None = None
    scan_error: str | None = None
    reject_reason: str | None = None
    uploaded_at: datetime
    can_download: bool = False


class DocumentStatusUpdateRequest(BaseModel):
    status: str = Field(..., description="verified, rejected, or archived")
    reason: str | None = Field(None, description="Mandatory if status is rejected")


class DownloadUrlResponse(BaseModel):
    download_url: str
    expires_in_seconds: int = 300
    file_name: str


class RequestMessageResponse(BaseModel):
    case_no: str
    customer_name: str
    message: str
    missing_count: int


class ChecklistItemResponse(BaseModel):
    document_type_id: uuid.UUID
    code: str
    name: str
    group_name: str
    is_mandatory: bool
    status: str
    document_id: uuid.UUID | None = None
    file_name: str | None = None
    file_size: int | None = None
    version: int | None = None
    uploaded_at: str | None = None
    reject_reason: str | None = None
    can_download: bool = False
    scan_result: dict[str, Any] | None = None


class CaseChecklistResponse(BaseModel):
    case_id: uuid.UUID
    missing_mandatory_count: int
    items: list[ChecklistItemResponse]


class DocumentOCRVerificationRequest(BaseModel):
    fields: dict[str, str] = Field(default_factory=dict, description="Verified field key-values")
    apply_to_case: bool = Field(True, description="Sync verified attributes to case/party profile")

