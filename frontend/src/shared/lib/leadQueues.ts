/**
 * DSA OS — Single Source of Truth Queue Selectors & Lead Lifecycle Engine
 *
 * All queue filtering, status derivation, and scheduling logic strictly use
 * the Asia/Kolkata (IST) timezone.
 */

export type AllocationStatus = 'Allocated' | 'In Process' | 'Sanctioned' | 'Rejected'

export interface FinancingPartnerAllocation {
  id: string // Deterministic: `${leadId}_${financingPartnerId}`
  leadId: string
  financingPartnerId: string
  financingPartnerName: string
  financingPartnerType: 'bank' | 'nbfc'
  status: AllocationStatus
  allocatedBy: string
  allocatedByName?: string
  allocatedAt: string // ISO instant
  statusUpdatedBy?: string
  statusUpdatedAt?: string // ISO instant
  requestedAmountSnapshot: number
  sanctionAmount?: number | null
  sanctionedAt?: string | null // ISO instant
  rejectedAt?: string | null // ISO instant
  rejectionReason?: string | null
  reportingMonth?: string // YYYY-MM in IST
  history?: Array<{
    id: string
    fromStatus?: AllocationStatus
    toStatus: AllocationStatus
    reason?: string
    updatedBy: string
    updatedAt: string
    sanctionAmount?: number | null
  }>
}

export interface FinancingPartnerMaster {
  id: string // Stable slug, e.g. 'hdfc-bank'
  name: string
  type: 'bank' | 'nbfc'
  active: boolean
  createdAt: string
  createdBy: string
}

// Default initial master list (idempotently seeded)
export const DEFAULT_FINANCING_PARTNERS: FinancingPartnerMaster[] = [
  {
    id: 'hdfc-bank',
    name: 'HDFC Bank',
    type: 'bank',
    active: true,
    createdAt: '2025-01-01T00:00:00.000Z',
    createdBy: 'system',
  },
  {
    id: 'sk-finance',
    name: 'SK Finance',
    type: 'nbfc',
    active: true,
    createdAt: '2025-01-01T00:00:00.000Z',
    createdBy: 'system',
  },
  {
    id: 'axis-bank',
    name: 'Axis Bank',
    type: 'bank',
    active: true,
    createdAt: '2025-01-01T00:00:00.000Z',
    createdBy: 'system',
  },
  {
    id: 'other-partner',
    name: 'Other',
    type: 'nbfc',
    active: true,
    createdAt: '2025-01-01T00:00:00.000Z',
    createdBy: 'system',
  },
]

// ---------------------------------------------------------------------------
// 1. Timezone & IST Day Boundaries (DST-free, strictly UTC+05:30)
// ---------------------------------------------------------------------------

export const IST_TIMEZONE = 'Asia/Kolkata'
export const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000 // +05:30 in ms

/**
 * Parses an ISO date/timestamp and returns calendar date parts in IST
 */
export function getISTDateParts(dateInput: string | number | Date = new Date()): {
  year: number
  month: number // 1-12
  day: number // 1-31
  hours: number
  minutes: number
  seconds: number
  isoDateString: string // YYYY-MM-DD
  reportingMonth: string // YYYY-MM
} {
  const d = new Date(dateInput)
  if (isNaN(d.getTime())) {
    throw new Error(`Invalid date input for IST calculation: ${String(dateInput)}`)
  }

  // Format parts reliably using Intl in Asia/Kolkata
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: IST_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })

  const parts = formatter.formatToParts(d)
  const partMap: Record<string, string> = {}
  parts.forEach((p) => {
    partMap[p.type] = p.value
  })

  const year = parseInt(partMap.year, 10)
  const month = parseInt(partMap.month, 10)
  const day = parseInt(partMap.day, 10)
  const hours = parseInt(partMap.hour, 10)
  const minutes = parseInt(partMap.minute, 10)
  const seconds = parseInt(partMap.second, 10)

  const monthPadded = String(month).padStart(2, '0')
  const dayPadded = String(day).padStart(2, '0')

  return {
    year,
    month,
    day,
    hours,
    minutes,
    seconds,
    isoDateString: `${year}-${monthPadded}-${dayPadded}`,
    reportingMonth: `${year}-${monthPadded}`,
  }
}

/**
 * Returns the exact UTC timestamp for the start of today in Asia/Kolkata (00:00:00.000 IST)
 */
export function getStartOfTodayIST(referenceDate: string | number | Date = new Date()): Date {
  const { year, month, day } = getISTDateParts(referenceDate)
  // Create UTC date corresponding to 00:00:00 IST (which is previous day 18:30:00 UTC)
  const utcDate = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0) - IST_OFFSET_MS)
  return utcDate
}

/**
 * Returns the exact UTC timestamp for the end of today in Asia/Kolkata (23:59:59.999 IST)
 */
export function getEndOfTodayIST(referenceDate: string | number | Date = new Date()): Date {
  const { year, month, day } = getISTDateParts(referenceDate)
  // 23:59:59.999 IST = (Start of today IST + 24 hours - 1 ms)
  const utcDate = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999) - IST_OFFSET_MS)
  return utcDate
}

/**
 * Checks if a given timestamp falls on calendar "today" in Asia/Kolkata
 */
export function isTodayIST(
  dateInput: string | number | Date | null | undefined,
  referenceDate: string | number | Date = new Date()
): boolean {
  if (!dateInput) return false
  const t = new Date(dateInput).getTime()
  if (isNaN(t)) return false

  const start = getStartOfTodayIST(referenceDate).getTime()
  const end = getEndOfTodayIST(referenceDate).getTime()
  return t >= start && t <= end
}

/**
 * Checks if a follow-up timestamp is overdue in Asia/Kolkata (before start of today IST)
 */
export function isOverdueIST(
  dateInput: string | number | Date | null | undefined,
  referenceDate: string | number | Date = new Date()
): boolean {
  if (!dateInput) return false
  const t = new Date(dateInput).getTime()
  if (isNaN(t)) return false

  const start = getStartOfTodayIST(referenceDate).getTime()
  return t < start
}

/**
 * Checks if a follow-up timestamp is strictly in the future (after end of today IST)
 */
export function isFutureIST(
  dateInput: string | number | Date | null | undefined,
  referenceDate: string | number | Date = new Date()
): boolean {
  if (!dateInput) return false
  const t = new Date(dateInput).getTime()
  if (isNaN(t)) return false

  const end = getEndOfTodayIST(referenceDate).getTime()
  return t > end
}

// ---------------------------------------------------------------------------
// 2. Pure Lead Stage Mapping from Allocations
// ---------------------------------------------------------------------------

/**
 * Normalizes case stage/status string for uniform comparison
 */
export function normalizeStage(stage?: string | null): string {
  if (!stage) return 'lead'
  return stage.toLowerCase().trim().replace(/[\s-]+/g, '_')
}

/**
 * Single pure function mapping lead stage from allocation records.
 * 
 * Rules:
 * 1. If lead is already disbursed or closed, keep it (never regressed).
 * 2. If any allocation is 'Sanctioned', lead stage becomes 'sanctioned'.
 *    (Never auto-set Converted or Disbursed from an allocation sanction).
 * 3. First successful allocation (at least one allocation with status Allocated or In Process)
 *    sets lead stage to 'partner_allocated'.
 * 4. Rejected allocations NEVER change lead to 'not_interested'.
 * 5. If all allocations are Rejected, lead remains 'partner_allocated' (marked as rejected allocations).
 * 6. If no allocations exist, lead retains its current operational stage (e.g. 'interested', 'lead', etc.).
 */
export function deriveLeadStageFromAllocations(
  currentStage: string,
  allocations: FinancingPartnerAllocation[] = []
): string {
  const normCurrent = normalizeStage(currentStage)

  // Terminal lifecycle stages are never regressed by allocation updates
  if (normCurrent === 'disbursed' || normCurrent === 'closed' || normCurrent === 'converted') {
    return normCurrent
  }

  if (!allocations || allocations.length === 0) {
    return normCurrent
  }

  // 1. Any allocation sanctioned -> Lead stage is 'sanctioned'
  const hasSanctioned = allocations.some((a) => a.status === 'Sanctioned')
  if (hasSanctioned) {
    return 'sanctioned'
  }

  // 2. Active allocations in process or allocated -> 'partner_allocated'
  const hasActive = allocations.some(
    (a) => a.status === 'Allocated' || a.status === 'In Process'
  )
  if (hasActive) {
    return 'partner_allocated'
  }

  // 3. All allocations rejected -> remains 'partner_allocated' (never 'not_interested')
  const allRejected = allocations.every((a) => a.status === 'Rejected')
  if (allRejected) {
    return 'partner_allocated'
  }

  return normCurrent
}

// ---------------------------------------------------------------------------
// 3. Centralized Queue Selectors (Single Source of Truth)
// ---------------------------------------------------------------------------

export interface LeadItemLike {
  id: string
  case_no?: string
  status?: string
  current_stage?: string
  call_outcome?: string | null
  assigned_telecaller_id?: string | null
  assigned_telecaller_name?: string | null
  follow_up_at?: string | null
  created_at?: string
  updated_at?: string
  [key: string]: any
}

/**
 * Queue 1: Allocate to Telecaller
 * Eligibility: assignedTelecallerId is empty AND stage is initial/new state AND not Not Interested
 */
export function isEligibleForTelecallerAllocation(lead: LeadItemLike): boolean {
  const hasTelecaller = Boolean(
    lead.assigned_telecaller_id &&
    lead.assigned_telecaller_id !== 'unassigned' &&
    lead.assigned_telecaller_id.trim() !== ''
  )
  if (hasTelecaller) return false

  const stage = normalizeStage(lead.current_stage || lead.status)
  const outcome = normalizeStage(lead.call_outcome)

  // Exclude Not Interested or closed/rejected states
  if (outcome === 'not_interested' || stage === 'not_interested') return false
  if (['closed', 'rejected', 'withdrawn', 'sanctioned', 'disbursed', 'converted'].includes(stage)) {
    return false
  }

  // Initial / new states: 'lead', 'new', 'lead_qualified', 'docs_in_progress'
  return ['lead', 'new', 'lead_qualified', 'docs_in_progress'].includes(stage)
}

/**
 * Queue 2: Telecaller Active Calling
 * Eligibility: Assigned to this telecaller AND stage is new/contacting AND no outstanding future follow-up
 */
export function isTelecallerActiveCalling(
  lead: LeadItemLike,
  telecallerId?: string | null,
  referenceDate: string | number | Date = new Date()
): boolean {
  if (!lead.assigned_telecaller_id) return false
  if (telecallerId && lead.assigned_telecaller_id !== telecallerId) return false

  const stage = normalizeStage(lead.current_stage || lead.status)
  const outcome = normalizeStage(lead.call_outcome)

  // Must not be in terminal or allocated states
  if (
    ['not_interested', 'closed', 'rejected', 'withdrawn', 'sanctioned', 'disbursed', 'partner_allocated'].includes(
      stage
    )
  ) {
    return false
  }
  if (outcome === 'not_interested' || outcome === 'interested') {
    return false
  }

  // Future follow-up appears in no active calling queue
  if (lead.follow_up_at && isFutureIST(lead.follow_up_at, referenceDate)) {
    return false
  }

  return true
}

/**
 * Queue 3: Telecaller Due Today
 * Eligibility: Assigned to this telecaller AND follow-up due time <= end of today IST AND >= start of today IST
 */
export function isTelecallerDueToday(
  lead: LeadItemLike,
  telecallerId?: string | null,
  referenceDate: string | number | Date = new Date()
): boolean {
  if (!lead.assigned_telecaller_id) return false
  if (telecallerId && lead.assigned_telecaller_id !== telecallerId) return false
  if (!lead.follow_up_at) return false

  const outcome = normalizeStage(lead.call_outcome)
  if (outcome === 'not_interested' || outcome === 'interested') return false

  return isTodayIST(lead.follow_up_at, referenceDate)
}

/**
 * Queue 4: Telecaller Overdue
 * Eligibility: Assigned to telecaller AND follow-up due time < start of today IST AND not completed
 */
export function isTelecallerOverdue(
  lead: LeadItemLike,
  telecallerId?: string | null,
  referenceDate: string | number | Date = new Date()
): boolean {
  if (!lead.assigned_telecaller_id) return false
  if (telecallerId && lead.assigned_telecaller_id !== telecallerId) return false
  if (!lead.follow_up_at) return false

  const outcome = normalizeStage(lead.call_outcome)
  if (outcome === 'not_interested' || outcome === 'interested') return false

  return isOverdueIST(lead.follow_up_at, referenceDate)
}

/**
 * Queue 5: Allocate to Partner (Admin Queue)
 * Eligibility: stage = 'Interested' (or outcome = 'interested') AND zero allocation records for the lead
 */
export function isEligibleForPartnerAllocation(
  lead: LeadItemLike,
  allocationsForLead: FinancingPartnerAllocation[] = []
): boolean {
  const stage = normalizeStage(lead.current_stage || lead.status)
  const outcome = normalizeStage(lead.call_outcome)

  // Must be marked Interested
  const isInterested = stage === 'interested' || outcome === 'interested'
  if (!isInterested) return false

  // Zero allocation records for the lead
  if (allocationsForLead && allocationsForLead.length > 0) {
    return false
  }
  const count = lead.allocationCount ?? lead.allocation_count ?? 0
  return count === 0
}

/**
 * Queue 6: Partner Allocated / In Process
 * Eligibility: Lead has >= 1 allocation with status Allocated or In Process
 */
export function isPartnerAllocatedOrInProcess(
  lead: LeadItemLike,
  allocationsForLead: FinancingPartnerAllocation[] = []
): boolean {
  if (allocationsForLead.length > 0) {
    return allocationsForLead.some(
      (a) => a.status === 'Allocated' || a.status === 'In Process'
    )
  }

  // Fallback to denormalized status if allocation records are loaded lazily
  const stage = normalizeStage(lead.current_stage || lead.status)
  return stage === 'partner_allocated' || stage === 'in_review_lender' || stage === 'file_logged_in'
}

/**
 * Check if lead is Sanctioned or Converted
 */
export function isSanctionedOrConverted(
  lead: LeadItemLike,
  allocationsForLead: FinancingPartnerAllocation[] = []
): boolean {
  const stage = normalizeStage(lead.current_stage || lead.status)
  if (stage === 'sanctioned' || stage === 'disbursed' || stage === 'converted') {
    return true
  }
  return allocationsForLead.some((a) => a.status === 'Sanctioned')
}

// ---------------------------------------------------------------------------
// 4. Batch Queue Evaluator for Consistent Dashboard & List Counts
// ---------------------------------------------------------------------------

export interface QueueCountSummary {
  totalLeads: number
  allocateToTelecaller: number
  activeCalling: number
  interested: number
  allocateToPartner: number
  partnerAllocated: number
  sanctionedOrConverted: number
}

/**
 * Evaluates queues across the entire dataset. Guarantees that Dashboard KPI counts
 * equal the exact length of the corresponding filtered lists.
 */
export function evaluateAllQueues(
  leads: LeadItemLike[],
  allocationsMap: Map<string, FinancingPartnerAllocation[]> = new Map(),
  referenceDate: string | number | Date = new Date()
): {
  summary: QueueCountSummary
  allocateToTelecallerList: LeadItemLike[]
  activeCallingList: LeadItemLike[]
  interestedList: LeadItemLike[]
  allocateToPartnerList: LeadItemLike[]
  partnerAllocatedList: LeadItemLike[]
  sanctionedOrConvertedList: LeadItemLike[]
} {
  const allocateToTelecallerList: LeadItemLike[] = []
  const activeCallingList: LeadItemLike[] = []
  const interestedList: LeadItemLike[] = []
  const allocateToPartnerList: LeadItemLike[] = []
  const partnerAllocatedList: LeadItemLike[] = []
  const sanctionedOrConvertedList: LeadItemLike[] = []

  for (const lead of leads) {
    const allocs = allocationsMap.get(lead.id) || (lead.allocations as FinancingPartnerAllocation[]) || []

    if (isEligibleForTelecallerAllocation(lead)) {
      allocateToTelecallerList.push(lead)
    }

    if (isTelecallerActiveCalling(lead, null, referenceDate)) {
      activeCallingList.push(lead)
    }

    const stage = normalizeStage(lead.current_stage || lead.status)
    const outcome = normalizeStage(lead.call_outcome)
    if (stage === 'interested' || outcome === 'interested') {
      interestedList.push(lead)
    }

    if (isEligibleForPartnerAllocation(lead, allocs)) {
      allocateToPartnerList.push(lead)
    }

    if (isPartnerAllocatedOrInProcess(lead, allocs)) {
      partnerAllocatedList.push(lead)
    }

    if (isSanctionedOrConverted(lead, allocs)) {
      sanctionedOrConvertedList.push(lead)
    }
  }

  const summary: QueueCountSummary = {
    totalLeads: leads.length,
    allocateToTelecaller: allocateToTelecallerList.length,
    activeCalling: activeCallingList.length,
    interested: interestedList.length,
    allocateToPartner: allocateToPartnerList.length,
    partnerAllocated: partnerAllocatedList.length,
    sanctionedOrConverted: sanctionedOrConvertedList.length,
  }

  return {
    summary,
    allocateToTelecallerList,
    activeCallingList,
    interestedList,
    allocateToPartnerList,
    partnerAllocatedList,
    sanctionedOrConvertedList,
  }
}
