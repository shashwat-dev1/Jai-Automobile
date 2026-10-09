"""
DSA OS — Lender and Application Schemas
"""

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class LenderCreateRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=255)
    code: str | None = Field(None, max_length=50)
    type: str = Field("bank", max_length=50)
    products: list[str] = Field(default_factory=list)
    dsa_code: str | None = Field(None, max_length=100)
    contact_person: str | None = Field(None, max_length=255)
    contact_email: str | None = Field(None, max_length=255)
    contact_mobile: str | None = Field(None, max_length=15)
    notes: str | None = None


class LenderUpdateRequest(BaseModel):
    name: str | None = Field(None, min_length=2, max_length=255)
    code: str | None = None
    type: str | None = None
    products: list[str] | None = None
    dsa_code: str | None = None
    contact_person: str | None = None
    contact_email: str | None = None
    contact_mobile: str | None = None
    notes: str | None = None
    is_active: bool | None = None


class LenderResponse(BaseModel):
    id: uuid.UUID
    org_id: uuid.UUID
    name: str
    code: str | None = None
    type: str
    products: list[str]
    dsa_code: str | None = None
    contact_person: str | None = None
    contact_email: str | None = None
    contact_mobile: str | None = None
    notes: str | None = None
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class LenderApplicationCreateRequest(BaseModel):
    lender_id: uuid.UUID
    product: str = Field(..., max_length=50)
    login_ref: str | None = Field(None, max_length=100)
    login_date: date | None = None


class SanctionTerms(BaseModel):
    sanction_amount: Decimal = Field(..., gt=0)
    sanction_tenure_months: int = Field(..., gt=0, le=120)
    sanction_rate: Decimal = Field(..., ge=0, le=99.99)
    sanction_margin_money: Decimal | None = Field(None, ge=0)
    sanction_date: date | None = None


class DisbursalTerms(BaseModel):
    disbursal_amount: Decimal = Field(..., gt=0)
    disbursal_date: date
    disbursal_ref: str = Field(..., min_length=1, max_length=100)
    disbursal_override_reason: str | None = None


class LenderApplicationUpdateRequest(BaseModel):
    status: str | None = None
    query_notes: str | None = None
    sanction_terms: SanctionTerms | None = None
    rejection_reason_code: str | None = None
    rejection_notes: str | None = None
    disbursal: DisbursalTerms | None = None
    is_winning: bool | None = None
    version: int = Field(1, description="Current optimistic lock version")


class LenderApplicationResponse(BaseModel):
    id: uuid.UUID
    org_id: uuid.UUID
    case_id: uuid.UUID
    lender_id: uuid.UUID
    lender_name: str | None = None
    product: str
    login_ref: str | None = None
    login_date: date | None = None
    status: str
    query_notes: str | None = None
    sanction_amount: Decimal | None = None
    sanction_tenure_months: int | None = None
    sanction_rate: Decimal | None = None
    sanction_margin_money: Decimal | None = None
    sanction_date: date | None = None
    rejection_reason_code: str | None = None
    rejection_notes: str | None = None
    disbursal_date: date | None = None
    disbursal_amount: Decimal | None = None
    disbursal_ref: str | None = None
    disbursal_override_reason: str | None = None
    is_winning: bool
    version: int
    sla: dict[str, Any] | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
