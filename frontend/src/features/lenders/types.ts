/**
 * DSA OS — Lender & Multi-Bank Application Types
 */

export interface Lender {
  id: string
  org_id: string
  name: string
  code: string | null
  type: string
  products: string[]
  dsa_code: string | null
  contact_person: string | null
  contact_email: string | null
  contact_mobile: string | null
  notes: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface LenderCreatePayload {
  name: string
  code?: string
  type: string
  products?: string[]
  dsa_code?: string
  contact_person?: string
  contact_email?: string
  contact_mobile?: string
  notes?: string
}

export interface SanctionTerms {
  sanction_amount: number
  sanction_tenure_months: number
  sanction_rate: number
  sanction_margin_money?: number
  sanction_date?: string
}

export interface DisbursalTerms {
  disbursal_amount: number
  disbursal_date: string
  disbursal_ref: string
  disbursal_override_reason?: string
}

export interface LenderApplication {
  id: string
  org_id: string
  case_id: string
  lender_id: string
  lender_name: string | null
  product: string
  login_ref: string | null
  login_date: string | null
  status: 'draft' | 'applied' | 'queries_raised' | 'sanctioned' | 'rejected' | 'disbursed' | 'withdrawn'
  query_notes: string | null
  sanction_amount: number | null
  sanction_tenure_months: number | null
  sanction_rate: number | null
  sanction_margin_money: number | null
  sanction_date: string | null
  rejection_reason_code: string | null
  rejection_notes: string | null
  disbursal_date: string | null
  disbursal_amount: number | null
  disbursal_ref: string | null
  disbursal_override_reason: string | null
  is_winning: boolean
  version: number
  sla?: {
    ageing_hours: number
    benchmark_sla_hours: number
    is_stuck: boolean
    stuck_hours: number
  }
  created_at: string
  updated_at: string
}

export interface LenderApplicationCreatePayload {
  lender_id: string
  product: string
  login_ref?: string
  login_date?: string
}

export interface LenderApplicationUpdatePayload {
  status?: string
  query_notes?: string
  sanction_terms?: SanctionTerms
  rejection_reason_code?: string
  rejection_notes?: string
  disbursal?: DisbursalTerms
  is_winning?: boolean
  version: number
}

export const REJECTION_REASONS = [
  { code: 'cibil_score_low', label: 'CIBIL / Credit Score Below Cutoff' },
  { code: 'income_insufficient', label: 'Income Criteria Not Met' },
  { code: 'foir_exceeded', label: 'High Debt Burden / FOIR Exceeded' },
  { code: 'negative_profile', label: 'Negative Profile / Area / Employer Blacklist' },
  { code: 'vehicle_age_exceeded', label: 'Vehicle Age or Condition Ineligible' },
  { code: 'ltv_high', label: 'Requested LTV Exceeds Norms' },
  { code: 'incomplete_documentation', label: 'Mandatory KYC / Income Docs Unverifiable' },
  { code: 'bounced_cheques', label: 'Banking History Bounces / ECS Returns' },
  { code: 'other', label: 'Other Credit Committee / Underwriter Reason' },
]
