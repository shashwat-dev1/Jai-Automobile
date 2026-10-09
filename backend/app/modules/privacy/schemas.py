"""
DSA OS — Privacy, DSAR, Breach Register, and 2FA Schemas
"""

from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


# -----------------------------------------------------------------------------
# 2FA / TOTP
# -----------------------------------------------------------------------------
class TOTPSetupResponse(BaseModel):
    secret: str
    provisioning_uri: str
    recovery_codes: list[str]


class TOTPVerifyRequest(BaseModel):
    code: str = Field(..., min_length=4, max_length=12, description="6-digit TOTP or recovery code")


class TOTPStatusResponse(BaseModel):
    is_enabled: bool
    is_mandatory: bool
    recovery_codes_remaining: int


# -----------------------------------------------------------------------------
# DSAR & Consent Withdrawal (FR-PRV-003)
# -----------------------------------------------------------------------------
class DSARCreateRequest(BaseModel):
    party_id: UUID
    request_type: str = Field(..., description="access, correction, erasure, consent_withdrawal")
    requested_by: str
    notes: str | None = None


class DSARUpdateRequest(BaseModel):
    status: str | None = None  # in_progress, completed, rejected
    rejection_reason: str | None = None
    notes: str | None = None


class DSARResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    org_id: UUID
    party_id: UUID
    request_type: str
    status: str
    due_date: date
    completed_at: datetime | None = None
    rejection_reason: str | None = None
    requested_by: str
    notes: str | None = None
    created_at: datetime


# -----------------------------------------------------------------------------
# Breach Register (FR-PRV-005)
# -----------------------------------------------------------------------------
class BreachCreateRequest(BaseModel):
    severity: str = Field(..., description="low, medium, high, critical")
    detected_at: datetime
    description: str
    containment_steps: str | None = None
    affected_parties_count: int = 0


class BreachUpdateRequest(BaseModel):
    status: str | None = None  # triaged, contained, resolved
    containment_steps: str | None = None
    affected_parties_count: int | None = None


class BreachResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    org_id: UUID
    incident_ref: str
    severity: str
    status: str
    detected_at: datetime
    triaged_at: datetime | None = None
    description: str
    containment_steps: str | None = None
    affected_parties_count: int
    created_at: datetime


# -----------------------------------------------------------------------------
# Retention Schedules (FR-PRV-004)
# -----------------------------------------------------------------------------
class RetentionScheduleResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    org_id: UUID
    entity_type: str
    retention_years: int
    legal_hold: bool
    updated_at: datetime


class RetentionScheduleUpdate(BaseModel):
    retention_years: int | None = Field(None, ge=1, le=25)
    legal_hold: bool | None = None
