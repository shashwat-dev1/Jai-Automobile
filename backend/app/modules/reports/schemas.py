"""
DSA OS — Reports and Dashboards Pydantic Schemas

Strongly-typed schemas for:
- Executive operations overview
- Today task and SLA console
- PRD 9.1 KPI computations (exact Decimal financial figures)
- Pipeline stage distributions
- Source performance analytics
- Data export requests
"""

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class PipelineSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    active_files_count: int = 0
    total_loan_amount_requested: Decimal = Decimal("0.00")
    new_inflow_count: int = 0
    docs_pending_count: int = 0
    logged_in_count: int = 0
    sanctioned_count: int = 0
    disbursed_count: int = 0
    disbursed_volume: Decimal = Decimal("0.00")
    closed_count: int = 0
    rejected_count: int = 0


class PayoutSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    total_expected_net: Decimal = Decimal("0.00")
    total_received_net: Decimal = Decimal("0.00")
    realisation_rate_pct: Decimal = Decimal("0.00")
    outstanding_net: Decimal = Decimal("0.00")
    variance_net: Decimal = Decimal("0.00")


class MonthlyCommissionItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    month: str  # YYYY-MM
    expected_amount: Decimal = Decimal("0.00")
    settled_amount: Decimal = Decimal("0.00")
    case_count: int = 0


class FunnelStageItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    stage: str
    stage_label: str
    count: int = 0
    total_amount: Decimal = Decimal("0.00")
    avg_ageing_hours: Decimal = Decimal("0.00")
    is_bottleneck: bool = False


class TopSourceItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    source_id: uuid.UUID
    source_name: str
    source_type: str
    total_cases: int = 0
    disbursed_cases: int = 0
    conversion_rate_pct: Decimal = Decimal("0.00")
    disbursed_volume: Decimal = Decimal("0.00")
    accrued_payout: Decimal = Decimal("0.00")


class AttentionItemsSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    stuck_cases_count: int = 0
    urgent_tasks_count: int = 0
    overdue_pdd_count: int = 0
    discrepancy_payouts_count: int = 0
    expiring_docs_count: int = 0


class DashboardOverviewResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    pipeline_summary: PipelineSummary
    payout_summary: PayoutSummary
    monthly_commission: list[MonthlyCommissionItem] = Field(default_factory=list)
    funnel_stages: list[FunnelStageItem] = Field(default_factory=list)
    top_sources: list[TopSourceItem] = Field(default_factory=list)
    attention_items: AttentionItemsSummary


class TodayTaskItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    type: str
    due_date: datetime
    status: str
    case_id: uuid.UUID | None = None
    case_no: str | None = None
    applicant_name: str | None = None
    owner_name: str | None = None


class StuckCaseItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    case_id: uuid.UUID
    case_no: str
    applicant_name: str | None = None
    stage: str
    entered_stage_at: datetime
    ageing_hours: Decimal = Decimal("0.00")
    sla_hours: int = 48
    owner_name: str | None = None


class ExpiringDocumentItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    document_id: uuid.UUID
    case_id: uuid.UUID | None = None
    case_no: str | None = None
    document_name: str
    document_type_name: str
    expires_at: datetime
    days_until_expiry: int = 0


class DuePDDItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    case_id: uuid.UUID
    case_no: str | None = None
    document_type: str
    title: str
    due_date: date
    status: str
    lender_name: str | None = None


class TodayCounts(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    due_today_count: int = 0
    overdue_count: int = 0
    stuck_cases_count: int = 0
    expiring_docs_count: int = 0
    pdd_due_count: int = 0


class TodayViewResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    tasks_due_today: list[TodayTaskItem] = Field(default_factory=list)
    tasks_overdue: list[TodayTaskItem] = Field(default_factory=list)
    stuck_cases: list[StuckCaseItem] = Field(default_factory=list)
    expiring_documents: list[ExpiringDocumentItem] = Field(default_factory=list)
    pdd_items_due: list[DuePDDItem] = Field(default_factory=list)
    counts: TodayCounts


class LenderKPIBreakdown(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    lender_id: uuid.UUID
    lender_name: str
    product: str
    logged_in: int = 0
    sanctioned: int = 0
    disbursed: int = 0
    approval_rate_pct: Decimal = Decimal("0.00")
    disbursal_conversion_pct: Decimal = Decimal("0.00")
    disbursed_volume: Decimal = Decimal("0.00")


class KPIResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    approval_rate_pct: Decimal = Decimal("0.00")
    disbursal_conversion_pct: Decimal = Decimal("0.00")
    lead_to_disbursal_pct: Decimal = Decimal("0.00")
    average_ticket: Decimal = Decimal("0.00")
    avg_stage_ageing_hours: Decimal = Decimal("0.00")
    stuck_case_count: int = 0
    payout_realisation_pct: Decimal = Decimal("0.00")
    payout_variance: Decimal = Decimal("0.00")
    source_quality_score: Decimal = Decimal("0.00")
    doc_complete_at_login_pct: Decimal = Decimal("0.00")
    lender_breakdowns: list[LenderKPIBreakdown] = Field(default_factory=list)


class PipelineStageDetail(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    status: str
    label: str
    case_count: int = 0
    total_loan_amount: Decimal = Decimal("0.00")
    avg_ageing_hours: Decimal = Decimal("0.00")


class PipelineResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    stages: list[PipelineStageDetail] = Field(default_factory=list)
    total_active: int = 0
    total_volume: Decimal = Decimal("0.00")


class SourcePerformanceReportItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    source_id: uuid.UUID
    source_name: str
    source_type: str
    contact_person: str | None = None
    phone: str | None = None
    total_cases: int = 0
    logged_in_cases: int = 0
    sanctioned_cases: int = 0
    disbursed_cases: int = 0
    conversion_rate_pct: Decimal = Decimal("0.00")
    disbursed_volume: Decimal = Decimal("0.00")
    payout_expected: Decimal = Decimal("0.00")
    payout_received: Decimal = Decimal("0.00")
    quality_score: Decimal = Decimal("0.00")


class SourceReportResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    sources: list[SourcePerformanceReportItem] = Field(default_factory=list)
    total_cases: int = 0
    total_disbursed_volume: Decimal = Decimal("0.00")
    total_payout_expected: Decimal = Decimal("0.00")
    total_payout_received: Decimal = Decimal("0.00")


ReportType = Literal["cases", "payouts", "sources", "audit"]
ExportFormat = Literal["csv"]
