"""
DSA OS — Payout Schemas
Implements request/response validation for Payout Rules, Expectations, Splits, and Overrides.
"""

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


# -----------------------------------------------------------------------------
# Payout Rules
# -----------------------------------------------------------------------------
class PayoutRuleCreateRequest(BaseModel):
    lender_id: uuid.UUID
    product: str = Field(..., max_length=50)
    effective_from: date
    effective_to: date | None = None
    basis: Literal["percent", "slab", "flat"] = "percent"
    rate_percent: Decimal | None = Field(None, ge=Decimal("0.000"), le=Decimal("100.000"))
    flat_amount: Decimal | None = Field(None, ge=Decimal("0.00"))
    slabs: list[dict[str, Any]] | None = None
    conditions: dict[str, Any] | None = None
    gating_type: Literal["pdd_complete", "none"] = "pdd_complete"
    tds_rate_percent: Decimal = Field(Decimal("5.00"), ge=Decimal("0.00"), le=Decimal("100.00"))
    gst_mode: Literal["forward_charge", "reverse_charge", "exempt"] = "forward_charge"
    is_active: bool = True


class PayoutRuleUpdateRequest(BaseModel):
    product: str | None = Field(None, max_length=50)
    effective_from: date | None = None
    effective_to: date | None = None
    basis: Literal["percent", "slab", "flat"] | None = None
    rate_percent: Decimal | None = Field(None, ge=Decimal("0.000"), le=Decimal("100.000"))
    flat_amount: Decimal | None = Field(None, ge=Decimal("0.00"))
    slabs: list[dict[str, Any]] | None = None
    conditions: dict[str, Any] | None = None
    gating_type: Literal["pdd_complete", "none"] | None = None
    tds_rate_percent: Decimal | None = Field(None, ge=Decimal("0.00"), le=Decimal("100.00"))
    gst_mode: Literal["forward_charge", "reverse_charge", "exempt"] | None = None
    is_active: bool | None = None


class PayoutRuleResponse(BaseModel):
    id: uuid.UUID
    org_id: uuid.UUID
    lender_id: uuid.UUID
    lender_name: str | None = None
    product: str
    effective_from: date
    effective_to: date | None = None
    basis: str
    rate_percent: Decimal | None = None
    flat_amount: Decimal | None = None
    slabs: list[dict[str, Any]] | None = None
    conditions: dict[str, Any] | None = None
    gating_type: str
    tds_rate_percent: Decimal
    gst_mode: str
    is_active: bool
    version: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# -----------------------------------------------------------------------------
# Payout Splits
# -----------------------------------------------------------------------------
class PayoutSplitItem(BaseModel):
    beneficiary_type: Literal["source", "sales_agent", "processor", "company"]
    source_id: uuid.UUID | None = None
    user_id: uuid.UUID | None = None
    share_type: Literal["percent", "flat"] = "percent"
    share_value: Decimal = Field(..., gt=Decimal("0.000"))


class PayoutSplitsUpdateRequest(BaseModel):
    splits: list[PayoutSplitItem]


class PayoutSplitResponse(BaseModel):
    id: uuid.UUID
    org_id: uuid.UUID
    expectation_id: uuid.UUID
    beneficiary_type: str
    source_id: uuid.UUID | None = None
    source_name: str | None = None
    user_id: uuid.UUID | None = None
    user_name: str | None = None
    share_type: str
    share_value: Decimal
    split_amount: Decimal
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# -----------------------------------------------------------------------------
# Payout Expectations
# -----------------------------------------------------------------------------
class PayoutExpectationOverrideRequest(BaseModel):
    gross_amount: Decimal = Field(..., gt=Decimal("0.00"))
    override_reason: str = Field(..., min_length=5, max_length=500)
    version: int = Field(1, description="Current optimistic lock version")


class PayoutExpectationResponse(BaseModel):
    id: uuid.UUID
    org_id: uuid.UUID
    case_id: uuid.UUID
    case_no: str | None = None
    applicant_name: str | None = None
    lender_application_id: uuid.UUID
    lender_name: str | None = None
    product: str | None = None
    rule_id: uuid.UUID | None = None
    rule_snapshot: dict[str, Any] | None = None

    disbursal_amount: Decimal
    gross_amount: Decimal
    tds_rate_percent: Decimal
    tds_amount: Decimal
    net_amount: Decimal

    status: Literal["held", "due", "no_rule", "paid", "clawback", "cancelled"]
    gating_status: Literal["pending", "satisfied"]

    is_override: bool
    override_reason: str | None = None
    original_gross_amount: Decimal | None = None
    version: int

    splits: list[PayoutSplitResponse] = []

    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class PayoutAttentionItem(BaseModel):
    id: uuid.UUID
    case_id: uuid.UUID
    case_no: str | None = None
    applicant_name: str | None = None
    lender_application_id: uuid.UUID
    lender_name: str | None = None
    product: str | None = None
    disbursal_amount: Decimal
    status: str
    gating_status: str
    reason: Literal["no_rule", "pdd_pending", "discrepancy"]
    reason_description: str
    created_at: datetime
