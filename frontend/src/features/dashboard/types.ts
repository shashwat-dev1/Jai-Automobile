/**
 * DSA OS — Dashboard & Analytics TypeScript Interfaces
 */

export interface PipelineSummary {
  active_files_count: number
  total_loan_amount_requested: string
  new_inflow_count: number
  docs_pending_count: number
  logged_in_count: number
  sanctioned_count: number
  disbursed_count: number
  disbursed_volume: string
  closed_count: number
  rejected_count: number
}

export interface PayoutSummary {
  total_expected_net: string
  total_received_net: string
  realisation_rate_pct: string
  outstanding_net: string
  variance_net: string
}

export interface MonthlyCommissionItem {
  month: string
  expected_amount: string
  settled_amount: string
  case_count: number
}

export interface FunnelStageItem {
  stage: string
  stage_label: string
  count: number
  total_amount: string
  avg_ageing_hours: string
  is_bottleneck: boolean
}

export interface TopSourceItem {
  source_id: string
  source_name: string
  source_type: string
  total_cases: number
  disbursed_cases: number
  conversion_rate_pct: string
  disbursed_volume: string
  accrued_payout: string
}

export interface AttentionItemsSummary {
  stuck_cases_count: number
  urgent_tasks_count: number
  overdue_pdd_count: number
  discrepancy_payouts_count: number
  expiring_docs_count: number
}

export interface DashboardOverviewResponse {
  pipeline_summary: PipelineSummary
  payout_summary: PayoutSummary
  monthly_commission: MonthlyCommissionItem[]
  funnel_stages: FunnelStageItem[]
  top_sources: TopSourceItem[]
  attention_items: AttentionItemsSummary
}

export interface TodayTaskItem {
  id: string
  title: string
  type: string
  due_date: string
  status: string
  case_id?: string | null
  case_no?: string | null
  applicant_name?: string | null
  owner_name?: string | null
}

export interface StuckCaseItem {
  case_id: string
  case_no: string
  applicant_name?: string | null
  stage: string
  entered_stage_at: string
  ageing_hours: string
  sla_hours: number
  owner_name?: string | null
}

export interface ExpiringDocumentItem {
  document_id: string
  case_id?: string | null
  case_no?: string | null
  document_name: string
  document_type_name: string
  expires_at: string
  days_until_expiry: number
}

export interface DuePDDItem {
  id: string
  case_id: string
  case_no?: string | null
  document_type: string
  title: string
  due_date: string
  status: string
  lender_name?: string | null
}

export interface TodayCounts {
  due_today_count: number
  overdue_count: number
  stuck_cases_count: number
  expiring_docs_count: number
  pdd_due_count: number
}

export interface TodayViewResponse {
  tasks_due_today: TodayTaskItem[]
  tasks_overdue: TodayTaskItem[]
  stuck_cases: StuckCaseItem[]
  expiring_documents: ExpiringDocumentItem[]
  pdd_items_due: DuePDDItem[]
  counts: TodayCounts
}

export interface LenderKPIBreakdown {
  lender_id: string
  lender_name: string
  product: string
  logged_in: number
  sanctioned: number
  disbursed: number
  approval_rate_pct: string
  disbursal_conversion_pct: string
  disbursed_volume: string
}

export interface KPIResponse {
  approval_rate_pct: string
  disbursal_conversion_pct: string
  lead_to_disbursal_pct: string
  average_ticket: string
  avg_stage_ageing_hours: string
  stuck_case_count: number
  payout_realisation_pct: string
  payout_variance: string
  source_quality_score: string
  doc_complete_at_login_pct: string
  lender_breakdowns: LenderKPIBreakdown[]
}

export interface SourcePerformanceReportItem {
  source_id: string
  source_name: string
  source_type: string
  contact_person?: string | null
  phone?: string | null
  total_cases: number
  logged_in_cases: number
  sanctioned_cases: number
  disbursed_cases: number
  conversion_rate_pct: string
  disbursed_volume: string
  payout_expected: string
  payout_received: string
  quality_score: string
}

export interface SourceReportResponse {
  sources: SourcePerformanceReportItem[]
  total_cases: number
  total_disbursed_volume: string
  total_payout_expected: string
  total_payout_received: string
}
