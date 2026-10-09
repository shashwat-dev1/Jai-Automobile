/**
 * DSA OS — Post-Disbursal Documents (PDD) Types
 */

export type PDDStatus =
  | 'pending'
  | 'collected'
  | 'sent_to_lender'
  | 'acknowledged_by_lender'
  | 'rejected'

export type PDDAgeingBucket = '0_7' | '8_15' | '16_30' | '30_plus'

export interface PDDItem {
  id: string
  org_id: string
  case_id: string
  case_no: string | null
  applicant_name: string | null
  lender_application_id: string
  lender_name: string | null
  document_type: string
  title: string
  description: string | null
  status: PDDStatus
  due_date: string
  collected_at: string | null
  submitted_to_lender_at: string | null
  acknowledged_at: string | null
  rejection_reason: string | null
  lender_acknowledgement_ref: string | null
  document_id: string | null
  owner_id: string | null
  owner_name: string | null
  ageing_days: number
  ageing_bucket: PDDAgeingBucket
  is_overdue: boolean
  version: number
  created_at: string
  updated_at: string
}

export interface PDDItemUpdatePayload {
  status?: PDDStatus
  collected_at?: string
  submitted_to_lender_at?: string
  acknowledged_at?: string
  rejection_reason?: string
  lender_acknowledgement_ref?: string
  document_id?: string
  owner_id?: string
  version: number
}

export interface PDDBoardResponse {
  bucket_0_7_count: number
  bucket_8_15_count: number
  bucket_16_30_count: number
  bucket_30_plus_count: number
  total_pending: number
  total_completed: number
  items: PDDItem[]
}

export const PDD_STATUS_CONFIG: Record<
  PDDStatus,
  { label: string; color: string; bg: string }
> = {
  pending: { label: 'Pending Collection', color: '#9ca3af', bg: 'rgba(156, 163, 175, 0.15)' },
  collected: { label: 'Collected from Customer', color: '#60a5fa', bg: 'rgba(96, 165, 250, 0.15)' },
  sent_to_lender: { label: 'Submitted to Bank', color: '#facc15', bg: 'rgba(250, 204, 21, 0.15)' },
  acknowledged_by_lender: { label: 'Bank Acknowledged', color: '#4ade80', bg: 'rgba(74, 222, 128, 0.15)' },
  rejected: { label: 'Rejected by Bank', color: '#f87171', bg: 'rgba(248, 113, 113, 0.15)' },
}
