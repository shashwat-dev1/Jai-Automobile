/**
 * DSA OS — Workflow, Tasks & SLA Types
 */

export interface Task {
  id: string
  org_id: string
  case_id: string | null
  case_no: string | null
  lender_application_id: string | null
  type: string
  title: string
  description: string | null
  owner_id: string
  owner_name: string | null
  due_date: string
  status: 'pending' | 'completed' | 'cancelled'
  completed_at: string | null
  notes: string | null
  is_overdue: boolean
  created_at: string
  updated_at: string
}

export interface TaskCreatePayload {
  case_id?: string
  lender_application_id?: string
  type: string
  title: string
  description?: string
  due_date: string
  assigned_to_id?: string
}

export interface TaskUpdatePayload {
  status?: 'pending' | 'completed' | 'cancelled'
  outcome_notes?: string
  due_date?: string
  assigned_to_id?: string
}

export interface SLAInfo {
  ageing_hours: number
  benchmark_sla_hours: number
  is_stuck: boolean
  stuck_hours: number
}

export const TASK_TYPES = [
  { code: 'call', label: 'Phone Call / Follow-up' },
  { code: 'document_pickup', label: 'Document Pickup' },
  { code: 'query_resolution', label: 'Query Resolution' },
  { code: 'field_visit', label: 'Field / FI Visit' },
  { code: 'verification', label: 'Customer Verification' },
  { code: 'other', label: 'General Operational Task' },
]
