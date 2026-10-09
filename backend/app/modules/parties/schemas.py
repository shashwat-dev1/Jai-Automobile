"""
DSA OS — Party Pydantic Schemas

Validates party input and defines masked responses.
Strict enforcement:
- Full 12-digit Aadhaar storage is strictly prohibited (LEG-005).
- PAN format must match [A-Z]{5}[0-9]{4}[A-Z]{1}.
"""

import re
import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

PAN_REGEX = re.compile(r"^[A-Z]{5}[0-9]{4}[A-Z]{1}$")
INDIAN_MOBILE_REGEX = re.compile(r"^(\+91[\-\s]?)?[6-9]\d{9}$")


class PartyBase(BaseModel):
    name: str = Field(..., min_length=2, max_length=255)
    mobile_primary: str = Field(..., description="10-digit Indian mobile number")
    mobile_secondary: str | None = None
    email: str | None = None
    employment_type: str | None = "salaried"
    dob: date | None = None
    address_line1: str | None = None
    address_line2: str | None = None
    city: str | None = None
    state: str | None = None
    pincode: str | None = None
    monthly_income: Decimal | None = None

    @field_validator("mobile_primary")
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

    @field_validator("pincode")
    @classmethod
    def validate_pincode(cls, v: str | None) -> str | None:
        if v and not re.match(r"^\d{6}$", v.strip()):
            raise ValueError("Pincode must be exactly 6 digits.")
        return v.strip() if v else None


class PartyCreate(PartyBase):
    pan: str | None = Field(None, description="10-character alphanumeric PAN")
    aadhaar_last_four: str | None = Field(
        None, description="Last 4 digits of Aadhaar ONLY. Full 12 digits prohibited."
    )

    @field_validator("pan")
    @classmethod
    def validate_pan(cls, v: str | None) -> str | None:
        if not v:
            return None
        cleaned = v.strip().upper()
        if not PAN_REGEX.match(cleaned):
            raise ValueError(
                "Invalid PAN format. Must match standard Indian format (e.g. ABCDE1234F)."
            )
        return cleaned

    @field_validator("aadhaar_last_four")
    @classmethod
    def validate_aadhaar_last_four(cls, v: str | None) -> str | None:
        if not v:
            return None
        cleaned = re.sub(r"[\s\-]", "", v)
        if len(cleaned) == 12:
            raise ValueError(
                "Full Aadhaar storage is prohibited per DPDP / UIDAI guidelines. "
                "Provide last 4 digits only."
            )
        if not re.match(r"^\d{4}$", cleaned):
            raise ValueError("Aadhaar last 4 digits must be exactly 4 digits.")
        return cleaned


class PartyUpdate(BaseModel):
    name: str | None = None
    mobile_primary: str | None = None
    mobile_secondary: str | None = None
    email: str | None = None
    employment_type: str | None = None
    dob: date | None = None
    address_line1: str | None = None
    address_line2: str | None = None
    city: str | None = None
    state: str | None = None
    pincode: str | None = None
    monthly_income: Decimal | None = None
    version: int = Field(..., description="Expected version for optimistic locking")


class DuplicatePartyWarning(BaseModel):
    party_id: uuid.UUID
    name: str
    match_type: Literal["exact_mobile", "pan_match"]
    details: str


class PartyResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    org_id: uuid.UUID
    name: str
    mobile_primary: str  # Masked in presentation
    mobile_secondary: str | None = None
    email: str | None = None
    pan_last_four: str | None = None
    pan_masked: str | None = None
    aadhaar_masked: str | None = None
    employment_type: str | None = None
    city: str | None = None
    state: str | None = None
    monthly_income: Decimal | None = None
    version: int
    created_at: datetime


class PartyCreateResponse(BaseModel):
    party: PartyResponse
    duplicate_warnings: list[DuplicatePartyWarning] = []


class PartyRevealRequest(BaseModel):
    field_name: Literal["pan", "mobile_primary"]
    reason: str = Field(..., min_length=5, description="Audit reason for accessing unmasked PII")


class PartyRevealResponse(BaseModel):
    field_name: str
    value: str
    revealed_at: datetime
