/**
 * DSA OS — StatusChip Component (Graphite Ledger Design System)
 */

import './StatusChip.css'

interface StatusChipProps {
  status: string
  label?: string
}

const STATUS_LABELS: Record<string, string> = {
  lead: 'Lead',
  lead_qualified: 'Qualified',
  docs_in_progress: 'Docs Pending',
  docs_collected: 'Docs Collected',
  file_logged_in: 'Logged In',
  in_review_lender: 'In Review',
  queries_raised: 'Query Raised',
  sanctioned: 'Sanctioned',
  disbursed: 'Disbursed',
  pdd_pending: 'PDD Pending',
  pdd_completed: 'PDD Complete',
  closed: 'Closed',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
}

export function StatusChip({ status, label }: StatusChipProps) {
  const displayLabel = label || STATUS_LABELS[status] || status.replace(/_/g, ' ')
  return <span className={`status-chip status-${status}`}>{displayLabel}</span>
}

export default StatusChip
