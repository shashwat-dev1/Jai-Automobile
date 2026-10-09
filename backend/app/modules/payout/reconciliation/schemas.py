"""
DSA OS — Payout Reconciliation Schemas
Request/Response models for statement import, receipt management, auto-matching, and clawbacks.
"""

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


# -----------------------------------------------------------------------------
# Column Mappings
# -----------------------------------------------------------------------------
class StatementColumnMappingCreate(BaseModel):
    lender_id: uuid.UUID
    mapping_name: str = Field("Default Format", max_length=100)
    mappings: dict[str, str] = Field(..., description="Mapping of standard fields to statement header names")
    is_default: bool = True


class StatementColumnMappingResponse(BaseModel):
    id: uuid.UUID
    org_id: uuid.UUID
    lender_id: uuid.UUID
    mapping_name: str
    mappings: dict[str, Any]
    is_default: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# -----------------------------------------------------------------------------
class DryRunImportRequest(BaseModel):
    lender_id: uuid.UUID
    filename: str = Field(..., max_length=255)
    csv_content: str = Field(..., description="Raw CSV content string")
    column_mapping: dict[str, str] = Field(..., description="Field to column name map")
    tolerance: Decimal = Field(Decimal("10.00"), ge=Decimal("0.00"))


class CommitImportRequest(BaseModel):
    lender_id: uuid.UUID
    filename: str = Field(..., max_length=255)
    csv_content: str = Field(..., description="Raw CSV content string")
    column_mapping: dict[str, str] = Field(..., description="Field to column name map")
    tolerance: Decimal = Field(Decimal("10.00"), ge=Decimal("0.00"))


class ImportBatchReversalRequest(BaseModel):
    reversal_reason: str = Field(..., min_length=5, max_length=500)


class ImportBatchResponse(BaseModel):
    id: uuid.UUID
    org_id: uuid.UUID
    lender_id: uuid.UUID
    lender_name: str | None = None
    filename: str
    total_rows: int
    matched_rows: int
    unmatched_rows: int
    error_rows: int
    total_received_amount: Decimal
    status: Literal["dry_run", "committed", "reversed"]
    reversed_at: datetime | None = None
    reversal_reason: str | None = None
    created_by: uuid.UUID | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# -----------------------------------------------------------------------------
# Receipts
# -----------------------------------------------------------------------------
class PayoutReceiptCreate(BaseModel):
    lender_id: uuid.UUID
    loan_account_no: str | None = Field(None, max_length=100)
    customer_name: str | None = Field(None, max_length=255)
    received_amount: Decimal = Field(..., gt=Decimal("0.00"))
    tds_amount: Decimal = Field(Decimal("0.00"), ge=Decimal("0.00"))
    payment_date: date
    utr_reference: str | None = Field(None, max_length=100)
    case_id: uuid.UUID | None = None
    notes: str | None = None


class PayoutReceiptResponse(BaseModel):
    id: uuid.UUID
    org_id: uuid.UUID
    lender_id: uuid.UUID
    lender_name: str | None = None
    import_batch_id: uuid.UUID | None = None
    loan_account_no: str | None = None
    customer_name: str | None = None
    received_amount: Decimal
    tds_amount: Decimal
    net_amount: Decimal
    payment_date: date
    utr_reference: str | None = None
    match_status: Literal["unmatched", "matched", "partially_matched", "clawback"]
    case_id: uuid.UUID | None = None
    case_no: str | None = None
    lender_application_id: uuid.UUID | None = None
    notes: str | None = None
    version: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# -----------------------------------------------------------------------------
# Reconciliations & Matching
# -----------------------------------------------------------------------------
class ManualMatchRequest(BaseModel):
    expectation_id: uuid.UUID
    receipt_id: uuid.UUID
    tolerance: Decimal = Field(Decimal("10.00"), ge=Decimal("0.00"))
    notes: str | None = None


class ReconciliationResponse(BaseModel):
    id: uuid.UUID
    org_id: uuid.UUID
    expectation_id: uuid.UUID
    case_id: uuid.UUID | None = None
    case_no: str | None = None
    receipt_id: uuid.UUID
    expected_amount: Decimal
    received_amount: Decimal
    variance_amount: Decimal
    status: Literal["matched", "short", "excess", "discrepancy"]
    tolerance_used: Decimal
    is_manual: bool
    reconciled_by: uuid.UUID | None = None
    reconciled_at: datetime
    notes: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class DryRunRowResult(BaseModel):
    row_index: int
    loan_account_no: str | None = None
    customer_name: str | None = None
    received_amount: Decimal
    tds_amount: Decimal
    net_amount: Decimal
    payment_date: date | None = None
    match_status: str
    matched_expectation_id: uuid.UUID | None = None
    matched_case_no: str | None = None
    expected_amount: Decimal | None = None
    variance: Decimal | None = None
    errors: list[str] = []


class DryRunReportResponse(BaseModel):
    filename: str
    total_rows: int
    valid_rows: int
    error_rows: int
    potential_matched: int
    potential_unmatched: int
    total_amount: Decimal
    rows: list[DryRunRowResult]


# -----------------------------------------------------------------------------
# Outstanding Report
# -----------------------------------------------------------------------------
class LenderOutstandingSummary(BaseModel):
    lender_id: uuid.UUID
    lender_name: str
    total_expected: Decimal
    total_received: Decimal
    total_outstanding: Decimal
    total_variance: Decimal
    pending_cases_count: int
    ageing_0_30: Decimal = Decimal("0.00")
    ageing_31_60: Decimal = Decimal("0.00")
    ageing_61_90: Decimal = Decimal("0.00")
    ageing_90_plus: Decimal = Decimal("0.00")


class OutstandingReportResponse(BaseModel):
    total_expected: Decimal
    total_received: Decimal
    total_outstanding: Decimal
    lenders: list[LenderOutstandingSummary]


# -----------------------------------------------------------------------------
# Clawbacks
# -----------------------------------------------------------------------------
class ClawbackEventCreate(BaseModel):
    case_id: uuid.UUID
    lender_application_id: uuid.UUID
    expectation_id: uuid.UUID
    receipt_id: uuid.UUID | None = None
    clawback_amount: Decimal = Field(..., gt=Decimal("0.00"))
    reason: str = Field(..., min_length=3, max_length=255)
    effective_date: date


class ClawbackEventResponse(BaseModel):
    id: uuid.UUID
    org_id: uuid.UUID
    case_id: uuid.UUID
    case_no: str | None = None
    applicant_name: str | None = None
    lender_application_id: uuid.UUID
    expectation_id: uuid.UUID
    receipt_id: uuid.UUID | None = None
    clawback_amount: Decimal
    reason: str
    effective_date: date
    status: Literal["pending", "recovered", "written_off"]
    created_by: uuid.UUID | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
