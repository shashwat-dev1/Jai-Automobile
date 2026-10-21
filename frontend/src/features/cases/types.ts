/**
 * DSA OS — Case Domain TypeScript Types
 */

export type CaseStatus =
  | 'lead'
  | 'lead_qualified'
  | 'docs_in_progress'
  | 'docs_collected'
  | 'file_logged_in'
  | 'in_review_lender'
  | 'queries_raised'
  | 'sanctioned'
  | 'disbursed'
  | 'pdd_pending'
  | 'pdd_completed'
  | 'closed'
  | 'rejected'
  | 'withdrawn'
  | 'interested'
  | 'not_interested'
  | 'follow_up'
  | 'partner_allocated'

export type ProductType =
  | 'new_car'
  | 'used_car'
  | 'commercial_vehicle'
  | 'two_wheeler'
  | 'refinance'
  | 'top_up'
  | 'balance_transfer'

export interface CaseListItem {
  id: string
  case_no: string
  product_type: ProductType
  status: CaseStatus
  current_stage?: string
  allocation_count?: number
  loan_amount_requested: number
  loan_amount_sanctioned?: number | null
  loan_amount_disbursed?: number | null
  primary_applicant_name: string
  primary_applicant_mobile: string
  vehicle_summary: string
  source_name: string
  owner_name: string
  assigned_processor_name?: string | null
  assigned_telecaller_id?: string | null
  assigned_telecaller_name?: string | null
  call_outcome?: string | null
  telecaller_remarks?: string | null
  follow_up_at?: string | null
  call_attempts_count?: number
  referral_profile_id?: string | null
  referral_partner_name?: string | null
  has_consent: boolean
  age_in_days: number
  is_stuck?: boolean
  sla?: {
    ageing_hours: number
    benchmark_sla_hours: number
    is_stuck: boolean
    stuck_hours: number
  } | null
  version: number
  created_at: string
  updated_at: string
}

export interface StatusHistoryItem {
  id: string
  from_status?: string | null
  to_status: CaseStatus
  reason?: string | null
  changed_by: string
  changer_name?: string | null
  created_at: string
}

export interface VehicleDetail {
  id: string
  case_id: string
  vehicle_type: string
  make: string
  model: string
  variant?: string | null
  year_of_manufacture?: number | null
  condition: 'new' | 'used'
  registration_no?: string | null
  chassis_no?: string | null
  engine_no?: string | null
  valuation_amount?: number | null
  ex_showroom_price?: number | null
  on_road_price?: number | null
  existing_hypothecation?: string | null
}

import type { FinancingPartnerAllocation } from '../../shared/lib/leadQueues'

export interface CaseDetail {
  id: string
  org_id: string
  case_no: string
  product_type: ProductType
  status: CaseStatus
  current_stage?: string
  allocation_count?: number
  allocations?: FinancingPartnerAllocation[]
  loan_amount_requested: number
  loan_amount_sanctioned?: number | null
  loan_amount_disbursed?: number | null
  source_id: string
  source_name: string
  source_executive?: string | null
  owner_id: string
  owner_name: string
  assigned_processor_id?: string | null
  assigned_processor_name?: string | null
  assigned_telecaller_id?: string | null
  assigned_telecaller_name?: string | null
  call_outcome?: string | null
  telecaller_remarks?: string | null
  follow_up_at?: string | null
  call_attempts_count?: number
  referral_profile_id?: string | null
  referral_partner_name?: string | null
  notes?: string | null
  version: number
  is_stuck?: boolean
  sla?: {
    ageing_hours: number
    benchmark_sla_hours: number
    is_stuck: boolean
    stuck_hours: number
  } | null
  primary_party?: {
    id: string
    name: string
    mobile_primary: string
    pan_last_four?: string | null
    pan_masked?: string | null
    aadhaar_masked?: string | null
    employment_type?: string | null
    city?: string | null
    monthly_income?: number | null
  } | null
  vehicle?: VehicleDetail | null
  has_consent: boolean
  status_history: StatusHistoryItem[]
  created_at: string
  updated_at: string
}

export interface CaseCreatePayload {
  party_name: string
  party_mobile: string
  party_pan?: string
  party_aadhaar_last_four?: string
  product_type: ProductType
  loan_amount_requested: number
  source_id: string
  source_executive?: string
  vehicle_make: string
  vehicle_model: string
  vehicle_condition: 'new' | 'used'
  vehicle_registration_no?: string
  notes?: string
}

export interface DuplicateWarning {
  case_id: string
  case_no: string
  match_type: string
  details: string
}
