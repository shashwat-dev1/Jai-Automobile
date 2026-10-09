"""
DSA OS — Case, Vehicle, Consent & Timeline Pydantic Schemas

Strict validation:
- Case creation requires at most 6 fields for rapid 30s intake (IF-2)
- Indian vehicle registration format validation (XX-NN-XX-NNNN) (FR-VEH-002)
- Optimistic locking version field
"""

import re
import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.modules.parties.schemas import PartyResponse

INDIAN_RC_REGEX = re.compile(r"^[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{4}$")

ProductType = Literal[
    "new_car",
    "used_car",
    "commercial_vehicle",
    "two_wheeler",
    "refinance",
    "top_up",
    "balance_transfer",
]


class VehicleBase(BaseModel):
    vehicle_type: str = "four_wheeler"
    make: str = Field(..., min_length=1, max_length=100)
    model: str = Field(..., min_length=1, max_length=100)
    variant: str | None = None
    year_of_manufacture: int | None = Field(None, ge=1990, le=2030)
    condition: Literal["new", "used"] = "used"
    registration_no: str | None = None
    chassis_no: str | None = None
    engine_no: str | None = None
    valuation_amount: Decimal | None = None
    ex_showroom_price: Decimal | None = None
    on_road_price: Decimal | None = None
    existing_hypothecation: str | None = None

    @field_validator("registration_no")
    @classmethod
    def validate_rc(cls, v: str | None) -> str | None:
        if not v:
            return None
        cleaned = re.sub(r"[\s\-]", "", v).upper()
        if not INDIAN_RC_REGEX.match(cleaned):
            raise ValueError(
                "Invalid Indian registration number format (e.g. MH12AB1234 or DL01C1234)."
            )
        return cleaned


class VehicleCreateUpdate(VehicleBase):
    pass


class VehicleResponse(VehicleBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    case_id: uuid.UUID
    created_at: datetime


class CaseCreate(BaseModel):
    """
    Rapid mobile-friendly case creation (max 6 mandatory fields, IF-2).
    1. party_name
    2. party_mobile
    3. product_type
    4. loan_amount_requested
    5. source_id
    6. vehicle_make
    """

    # Party details
    party_name: str = Field(..., min_length=2)
    party_mobile: str = Field(..., description="10-digit Indian mobile")
    party_pan: str | None = None
    party_aadhaar_last_four: str | None = None

    # Case details
    product_type: ProductType = "used_car"
    loan_amount_requested: Decimal = Field(..., gt=0)
    source_id: uuid.UUID
    source_executive: str | None = None
    assigned_processor_id: uuid.UUID | None = None
    notes: str | None = None

    # Vehicle details (at intake)
    vehicle_make: str = Field(..., min_length=1)
    vehicle_model: str = "Unknown"
    vehicle_condition: Literal["new", "used"] = "used"
    vehicle_registration_no: str | None = None

    @field_validator("party_mobile")
    @classmethod
    def validate_mobile(cls, v: str) -> str:
        cleaned = re.sub(r"[\s\-]", "", v)
        if cleaned.startswith("+91"):
            cleaned = cleaned[3:]
        elif cleaned.startswith("91") and len(cleaned) == 12:
            cleaned = cleaned[2:]
        if not re.match(r"^[6-9]\d{9}$", cleaned):
            raise ValueError("Invalid Indian mobile number. Must be 10 digits starting with 6-9.")
        return f"+91{cleaned}"

    @field_validator("party_pan")
    @classmethod
    def validate_pan(cls, v: str | None) -> str | None:
        if not v or not v.strip():
            return None
        cleaned = v.strip().upper()
        if not re.match(r"^[A-Z]{5}[0-9]{4}[A-Z]{1}$", cleaned):
            raise ValueError("Invalid PAN format. Must match standard Indian format (e.g. ABCDE1234F).")
        return cleaned

    @field_validator("vehicle_registration_no")
    @classmethod
    def validate_reg(cls, v: str | None) -> str | None:
        if not v or not v.strip():
            return None
        cleaned = re.sub(r"[\s\-]", "", v).upper()
        if not INDIAN_RC_REGEX.match(cleaned):
            raise ValueError("Invalid Indian registration number format (e.g. MH12AB1234 or DL01C1234).")
        return cleaned


class CaseUpdate(BaseModel):
    loan_amount_requested: Decimal | None = Field(None, gt=0)
    loan_amount_sanctioned: Decimal | None = None
    loan_amount_disbursed: Decimal | None = None
    source_id: uuid.UUID | None = None
    source_executive: str | None = None
    owner_id: uuid.UUID | None = None
    assigned_processor_id: uuid.UUID | None = None
    notes: str | None = None
    version: int = Field(..., description="Optimistic locking version")


class CaseStatusUpdate(BaseModel):
    status: str = Field(..., description="Target lifecycle status")
    reason: str | None = None
    version: int = Field(..., description="Optimistic locking version")


class StatusHistoryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    from_status: str | None
    to_status: str
    reason: str | None
    changed_by: uuid.UUID
    changer_name: str | None = None
    created_at: datetime


class ConsentCreate(BaseModel):
    party_id: uuid.UUID
    case_id: uuid.UUID | None = None
    purpose: str = "loan_processing"
    consent_type: Literal[
        "physical_form", "digital_sms", "verbal_recorded", "electronic_declaration"
    ] = "physical_form"
    is_given: bool = True


class ConsentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    party_id: uuid.UUID
    case_id: uuid.UUID | None
    purpose: str
    consent_type: str
    is_given: bool
    recorded_at: datetime


class DuplicateCaseWarning(BaseModel):
    case_id: uuid.UUID
    case_no: str
    match_type: Literal["vehicle_registration", "applicant_active_case"]
    details: str


class CaseListItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    case_no: str
    product_type: str
    status: str
    loan_amount_requested: Decimal
    loan_amount_sanctioned: Decimal | None = None
    loan_amount_disbursed: Decimal | None = None
    party_id: uuid.UUID | None = None
    primary_applicant_name: str
    primary_applicant_mobile: str
    vehicle_summary: str
    source_name: str
    owner_name: str
    assigned_processor_name: str | None = None
    has_consent: bool
    age_in_days: int
    is_stuck: bool = False
    sla: dict[str, Any] | None = None
    version: int
    created_at: datetime
    updated_at: datetime


class CaseDetailResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    org_id: uuid.UUID
    case_no: str
    product_type: str
    status: str
    loan_amount_requested: Decimal
    loan_amount_sanctioned: Decimal | None = None
    loan_amount_disbursed: Decimal | None = None
    source_id: uuid.UUID
    source_name: str
    source_executive: str | None = None
    owner_id: uuid.UUID
    owner_name: str
    assigned_processor_id: uuid.UUID | None = None
    assigned_processor_name: str | None = None
    notes: str | None = None
    version: int
    is_stuck: bool = False
    sla: dict[str, Any] | None = None
    primary_party: PartyResponse | None = None
    vehicle: VehicleResponse | None = None
    has_consent: bool
    status_history: list[StatusHistoryResponse] = []
    created_at: datetime
    updated_at: datetime


class CaseCreateResponse(BaseModel):
    case: CaseDetailResponse
    duplicate_warnings: list[DuplicateCaseWarning] = []
