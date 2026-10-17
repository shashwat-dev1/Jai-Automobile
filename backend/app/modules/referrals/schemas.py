"""
DSA OS — Referral Partner & Commission Pydantic Schemas
"""

import re
import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator


# -----------------------------------------------------------------------------
# Mobile-First Lookup
# -----------------------------------------------------------------------------
class ReferralLookupRequest(BaseModel):
    """Mobile number lookup for guest / referral partner entry."""

    mobile: str = Field(..., description="10-digit Indian mobile number")
    org_slug: str | None = Field(None, description="Optional organization slug")

    @field_validator("mobile")
    @classmethod
    def validate_lookup_mobile(cls, v: str) -> str:
        digits = re.sub(r"\D", "", v)
        if len(digits) == 12 and digits.startswith("91"):
            digits = digits[2:]
        elif len(digits) == 11 and digits.startswith("0"):
            digits = digits[1:]
        if len(digits) != 10:
            raise ValueError("Mobile number must be exactly 10 digits.")
        if digits[0] not in {"6", "7", "8", "9"}:
            raise ValueError("Indian mobile numbers must start with 6, 7, 8, or 9.")
        return digits


class ReferralLookupResponse(BaseModel):
    """Result of referral partner lookup."""

    exists: bool
    profile_id: uuid.UUID | None = None
    name: str | None = None
    verification_status: str | None = None


# -----------------------------------------------------------------------------
# Public Guest Referral Lead Intake
# -----------------------------------------------------------------------------
class GuestLeadSubmissionRequest(BaseModel):
    """
    Public form submission for guest referral leads.
    Does not require an authenticated user session.
    """

    partner_mobile: str = Field(..., description="10-digit mobile of referral submitter")
    partner_name: str = Field(..., description="Registered or entered partner name")
    org_slug: str | None = Field(None, description="Organization slug (e.g. jai-automobiles)")

    # Borrower & Loan Details
    applicant_name: str = Field(..., description="Customer full legal name")
    applicant_mobile: str = Field(..., description="Customer 10-digit mobile number")
    product_type: str = Field(
        default="used_car",
        description="used_car, new_car, commercial_vehicle, two_wheeler, refinance, top_up",
    )
    loan_amount_requested: Decimal = Field(..., ge=10000, le=100000000)

    # Address / Location
    pincode: str = Field(..., min_length=6, max_length=6)
    city: str = Field(..., min_length=2)
    state: str = Field(..., min_length=2)

    vehicle_condition: str = Field(..., description="'new' or 'used'")

    @field_validator("vehicle_condition")
    @classmethod
    def validate_vehicle_condition(cls, v: str) -> str:
        if not v or v.lower() not in {"used", "new"}:
            raise ValueError("Vehicle condition is mandatory and must be either 'used' or 'new'.")
        return v.lower()

    @field_validator("partner_mobile", "applicant_mobile")
    @classmethod
    def validate_mobile_digits(cls, v: str) -> str:
        digits = re.sub(r"\D", "", v)
        if len(digits) == 12 and digits.startswith("91"):
            digits = digits[2:]
        elif len(digits) == 11 and digits.startswith("0"):
            digits = digits[1:]
        if len(digits) != 10:
            raise ValueError("Mobile number must be exactly 10 digits.")
        if digits[0] not in {"6", "7", "8", "9"}:
            raise ValueError("Indian mobile numbers must start with 6, 7, 8, or 9.")
        return digits

    # Vehicle / Asset (Optional)
    vehicle_reg_no: str | None = None

    # Notes & Uploaded Document References
    notes: str | None = None
    expected_loan_required_date: str | None = None
    aadhaar_doc_id: uuid.UUID | None = None
    pan_doc_id: uuid.UUID | None = None
    rc_doc_id: uuid.UUID | None = None


class GuestDocumentUploadResponse(BaseModel):
    """Result of guest public document upload."""

    document_id: uuid.UUID
    doc_type: str
    file_name: str
    file_size: int
    status: str
    message: str


class GuestLeadSubmissionResponse(BaseModel):
    """Response after guest lead successfully captured."""

    tracking_id: str
    case_id: uuid.UUID
    case_no: str
    partner_id: uuid.UUID
    partner_name: str
    status: str
    message: str


# -----------------------------------------------------------------------------
# Referral Partner Profile (Admin View)
# -----------------------------------------------------------------------------
class ReferralProfileResponse(BaseModel):
    """Admin-facing summary of a referral partner and their performance metrics."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    org_id: uuid.UUID
    name: str
    mobile_primary: str
    masked_mobile: str
    email: str | None = None
    verification_status: str
    verified_at: datetime | None = None
    notes: str | None = None

    # Aggregate Metrics
    total_leads: int = 0
    interested_leads: int = 0
    converted_leads: int = 0

    pending_commission_amount: Decimal = Decimal("0.00")
    approved_commission_amount: Decimal = Decimal("0.00")
    paid_commission_amount: Decimal = Decimal("0.00")

    created_at: datetime


class ReferralProfileUpdateVerification(BaseModel):
    """Admin update of verification state."""

    verification_status: str = Field(
        ..., description="verified, pending_verification, or rejected"
    )
    notes: str | None = None


# -----------------------------------------------------------------------------
# Referral Commissions
# -----------------------------------------------------------------------------
class CommissionCreateRequest(BaseModel):
    """Create a new referral commission record."""

    referral_profile_id: uuid.UUID
    case_id: uuid.UUID | None = None
    amount: Decimal = Field(..., gt=0)
    basis: str = Field(..., description="e.g. Flat Partner Incentive, 0.5% Disbursed Value")
    notes: str | None = None


VALID_COMMISSION_STATUSES = {"pending_review", "approved", "rejected", "payable", "paid"}


class CommissionStatusUpdateRequest(BaseModel):
    """Update status of a referral commission."""

    status: str = Field(..., description="pending_review, approved, rejected, payable, paid")
    payment_reference: str | None = Field(None, description="UTR or Bank Reference identifier")
    payment_date: date | None = None
    notes: str | None = None

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: str) -> str:
        cleaned = v.strip().lower()
        if cleaned not in VALID_COMMISSION_STATUSES:
            raise ValueError(f"Invalid commission status '{v}'. Must be one of: {', '.join(sorted(VALID_COMMISSION_STATUSES))}")
        return cleaned


class ReferralCommissionResponse(BaseModel):
    """Referral commission record response."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    org_id: uuid.UUID
    referral_profile_id: uuid.UUID
    referral_partner_name: str | None = None
    case_id: uuid.UUID | None = None
    case_no: str | None = None
    applicant_name: str | None = None

    amount: Decimal
    basis: str
    status: str

    payment_date: date | None = None
    payment_reference: str | None = None
    approved_by_id: uuid.UUID | None = None
    approved_at: datetime | None = None
    notes: str | None = None

    created_at: datetime


# -----------------------------------------------------------------------------
# Detailed Partner Dossier (Partner + Associated Leads + Commissions)
# -----------------------------------------------------------------------------
class ReferralPartnerDossierResponse(BaseModel):
    """Full detail view for an individual referral partner."""

    profile: ReferralProfileResponse
    leads: list[dict[str, Any]]
    commissions: list[ReferralCommissionResponse]
