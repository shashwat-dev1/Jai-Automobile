/**
 * DSA OS — Payout & Commission Engine Types
 */

export type PayoutBasis = 'percent' | 'slab' | 'flat'
export type PayoutGatingType = 'pdd_complete' | 'none'
export type PayoutExpectationStatus = 'held' | 'due' | 'no_rule' | 'paid' | 'clawback' | 'cancelled'
export type PayoutGatingStatus = 'pending' | 'satisfied'
export type BeneficiaryType = 'source' | 'sales_agent' | 'processor' | 'company'
export type SplitShareType = 'percent' | 'flat'

export interface SlabTier {
  min_amount: number
  max_amount: number | null
  rate_percent?: number
  flat_amount?: number
}

export interface PayoutRule {
  id: string
  org_id: string
  lender_id: string
  lender_name?: string | null
  product: string
  effective_from: string
  effective_to?: string | null
  basis: PayoutBasis
  rate_percent?: number | null
  flat_amount?: number | null
  slabs?: SlabTier[] | null
  conditions?: Record<string, unknown> | null
  gating_type: PayoutGatingType
  tds_rate_percent: number
  gst_mode: string
  is_active: boolean
  version: number
  created_at: string
  updated_at: string
}

export interface PayoutRuleCreateRequest {
  lender_id: string
  product: string
  effective_from: string
  effective_to?: string | null
  basis: PayoutBasis
  rate_percent?: number | null
  flat_amount?: number | null
  slabs?: SlabTier[] | null
  conditions?: Record<string, unknown> | null
  gating_type: PayoutGatingType
  tds_rate_percent: number
  gst_mode: string
  is_active: boolean
}

export interface PayoutSplit {
  id: string
  org_id: string
  expectation_id: string
  beneficiary_type: BeneficiaryType
  source_id?: string | null
  source_name?: string | null
  user_id?: string | null
  user_name?: string | null
  share_type: SplitShareType
  share_value: number
  split_amount: number
  created_at: string
  updated_at: string
}

export interface PayoutSplitItem {
  beneficiary_type: BeneficiaryType
  source_id?: string | null
  user_id?: string | null
  share_type: SplitShareType
  share_value: number
}

export interface PayoutExpectation {
  id: string
  org_id: string
  case_id: string
  case_no?: string | null
  applicant_name?: string | null
  lender_application_id: string
  lender_name?: string | null
  product?: string | null
  rule_id?: string | null
  rule_snapshot?: Record<string, unknown> | null
  disbursal_amount: number
  gross_amount: number
  tds_rate_percent: number
  tds_amount: number
  net_amount: number
  status: PayoutExpectationStatus
  gating_status: PayoutGatingStatus
  is_override: boolean
  override_reason?: string | null
  original_gross_amount?: number | null
  version: number
  splits: PayoutSplit[]
  created_at: string
  updated_at: string
}

export interface PayoutExpectationOverrideRequest {
  gross_amount: number
  override_reason: string
  version: number
}

export interface PayoutAttentionItem {
  id: string
  case_id: string
  case_no?: string | null
  applicant_name?: string | null
  lender_application_id: string
  lender_name?: string | null
  product?: string | null
  disbursal_amount: number
  status: string
  gating_status: string
  reason: 'no_rule' | 'pdd_pending' | 'discrepancy'
  reason_description: string
  created_at: string
}

export type ReconciliationStatus = 'matched' | 'short' | 'excess' | 'discrepancy'
export type ReceiptMatchStatus = 'unmatched' | 'matched' | 'partially_matched' | 'clawback'

export interface StatementColumnMapping {
  id: string
  org_id: string
  lender_id: string
  mapping_name: string
  mappings: Record<string, string>
  is_default: boolean
  created_at: string
  updated_at: string
}

export interface ImportBatch {
  id: string
  org_id: string
  lender_id: string
  lender_name?: string | null
  filename: string
  total_rows: number
  matched_rows: number
  unmatched_rows: number
  error_rows: number
  total_received_amount: number
  status: 'dry_run' | 'committed' | 'reversed'
  reversed_at?: string | null
  reversal_reason?: string | null
  created_by?: string | null
  created_at: string
  updated_at: string
}

export interface PayoutReceipt {
  id: string
  org_id: string
  lender_id: string
  lender_name?: string | null
  import_batch_id?: string | null
  loan_account_no?: string | null
  customer_name?: string | null
  received_amount: number
  tds_amount: number
  net_amount: number
  payment_date: string
  utr_reference?: string | null
  match_status: ReceiptMatchStatus
  case_id?: string | null
  case_no?: string | null
  lender_application_id?: string | null
  notes?: string | null
  version: number
  created_at: string
  updated_at: string
}

export interface Reconciliation {
  id: string
  org_id: string
  expectation_id: string
  case_id?: string | null
  case_no?: string | null
  receipt_id: string
  expected_amount: number
  received_amount: number
  variance_amount: number
  status: ReconciliationStatus
  tolerance_used: number
  is_manual: boolean
  reconciled_by?: string | null
  reconciled_at: string
  notes?: string | null
}

export interface DryRunRowResult {
  row_index: number
  loan_account_no?: string | null
  customer_name?: string | null
  received_amount: number
  tds_amount: number
  net_amount: number
  payment_date?: string | null
  match_status: string
  matched_expectation_id?: string | null
  matched_case_no?: string | null
  expected_amount?: number | null
  variance?: number | null
  errors: string[]
}

export interface DryRunReportResponse {
  filename: string
  total_rows: number
  valid_rows: number
  error_rows: number
  potential_matched: number
  potential_unmatched: number
  total_amount: number
  rows: DryRunRowResult[]
}

export interface LenderOutstandingSummary {
  lender_id: string
  lender_name: string
  total_expected: number
  total_received: number
  total_outstanding: number
  total_variance: number
  pending_cases_count: number
  ageing_0_30: number
  ageing_31_60: number
  ageing_61_90: number
  ageing_90_plus: number
}

export interface OutstandingReportResponse {
  total_expected: number
  total_received: number
  total_outstanding: number
  lenders: LenderOutstandingSummary[]
}

export interface ClawbackEvent {
  id: string
  org_id: string
  case_id: string
  case_no?: string | null
  applicant_name?: string | null
  lender_application_id: string
  expectation_id: string
  receipt_id?: string | null
  clawback_amount: number
  reason: string
  effective_date: string
  status: 'pending' | 'recovered' | 'written_off'
  created_by?: string | null
  created_at: string
  updated_at: string
}

