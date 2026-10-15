/**
 * DSA OS — Case Filtering Engine & Unified Query Predicates
 *
 * Single Source of Truth for:
 * 1. Dashboard KPI Cards (Leads, Active Calling, Interested, Follow-ups, Converted, Unassigned)
 * 2. Due Today Rows (Unassigned leads, Follow-ups due today, Interested leads awaiting next step)
 * 3. All Leads Page Status Tabs & Table Filtering
 *
 * Guarantees that clicking a KPI card or Due Today row displays the EXACT
 * records that produced the metric.
 */

export type CaseViewFilter =
  | 'all'
  | 'active-calling'
  | 'interested'
  | 'follow-ups'
  | 'follow-ups-due-today'
  | 'converted'
  | 'unassigned'
  | 'interested-awaiting-next-step'

export interface FilterCriteria {
  view?: string | null
  range?: string | null
  search?: string | null
  telecaller?: string | null
  loanType?: string | null
  referral?: string | null
}

/**
 * Filter cases by date range:
 * - 'last30' / '30d': created within the last 30 days
 * - 'last90' / '90d': created within the last 90 days
 * - 'all' / undefined: all time
 */
export function filterCasesByDateRange<T extends { created_at?: string }>(
  cases: T[],
  range?: string | null
): T[] {
  if (!range || range === 'all') return cases

  const now = Date.now()
  const dayMs = 86400000

  let days = 0
  if (range === 'last30' || range === '30d') days = 30
  else if (range === 'last90' || range === '90d') days = 90

  if (days <= 0) return cases

  const cutoff = now - days * dayMs
  return cases.filter((c) => {
    if (!c.created_at) return true
    const t = new Date(c.created_at).getTime()
    return !isNaN(t) && t >= cutoff
  })
}

// --- Individual Predicates ---

export function isActiveCallingCase(c: any): boolean {
  return (
    Boolean(c.assigned_telecaller_id && c.assigned_telecaller_id !== 'unassigned') &&
    !['closed', 'rejected', 'withdrawn'].includes(c.status)
  )
}

export function isInterestedCase(c: any): boolean {
  return c.call_outcome === 'interested' || c.status === 'interested'
}

export function isFollowUpCase(c: any): boolean {
  return (
    c.call_outcome === 'follow_up' ||
    c.status === 'callback_scheduled' ||
    Boolean(c.follow_up_at)
  )
}

export function isConvertedCase(c: any): boolean {
  return (
    c.status === 'disbursed' ||
    c.status === 'sanctioned' ||
    c.status === 'converted'
  )
}

export function isUnassignedCase(c: any): boolean {
  return (
    !c.assigned_telecaller_id &&
    (!c.assigned_telecaller_name || c.assigned_telecaller_name === 'Unassigned') &&
    (c.call_outcome === 'new' || c.status === 'new')
  )
}

export function isFollowUpDueTodayCase(c: any): boolean {
  if (!isFollowUpCase(c)) return false
  if (!c.follow_up_at) return true // prototype default: active scheduled callback is due today
  const d = new Date(c.follow_up_at)
  if (isNaN(d.getTime())) return true
  const today = new Date()
  return (
    d.getDate() === today.getDate() &&
    d.getMonth() === today.getMonth() &&
    d.getFullYear() === today.getFullYear()
  )
}

export function isInterestedAwaitingNextStepCase(c: any): boolean {
  return (
    isInterestedCase(c) &&
    (!c.status || c.status === 'lead' || c.status === 'in_calling' || c.status === 'new' || c.status === 'interested')
  )
}

/**
 * Filter an array of cases by a view key
 */
export function filterCasesByView<T extends any>(cases: T[], view?: string | null): T[] {
  if (!view || view === 'all') return cases

  switch (view) {
    case 'active-calling':
      return cases.filter(isActiveCallingCase)
    case 'interested':
      return cases.filter(isInterestedCase)
    case 'follow-ups':
      return cases.filter(isFollowUpCase)
    case 'follow-ups-due-today':
      return cases.filter(isFollowUpDueTodayCase)
    case 'converted':
      return cases.filter(isConvertedCase)
    case 'unassigned':
      return cases.filter(isUnassignedCase)
    case 'interested-awaiting-next-step':
      return cases.filter(isInterestedAwaitingNextStepCase)
    default:
      return cases
  }
}

/**
 * Compute real counts across all views for a given base list of cases
 */
export function computeViewCounts(cases: any[]) {
  return {
    all: cases.length,
    activeCalling: cases.filter(isActiveCallingCase).length,
    interested: cases.filter(isInterestedCase).length,
    followUps: cases.filter(isFollowUpCase).length,
    followUpsDueToday: cases.filter(isFollowUpDueTodayCase).length,
    converted: cases.filter(isConvertedCase).length,
    unassigned: cases.filter(isUnassignedCase).length,
    interestedAwaitingNextStep: cases.filter(isInterestedAwaitingNextStepCase).length,
  }
}

/**
 * Full unified filter combining:
 * Date Range -> View -> Search -> Telecaller -> Loan Type -> Referral Partner
 */
export function filterCasesWithAllCriteria(cases: any[], criteria: FilterCriteria): any[] {
  let list = filterCasesByDateRange(cases, criteria.range)

  // Apply View Filter
  if (criteria.view && criteria.view !== 'all') {
    list = filterCasesByView(list, criteria.view)
  }

  // Apply Search
  if (criteria.search && criteria.search.trim()) {
    const q = criteria.search.trim().toLowerCase()
    list = list.filter((c: any) => {
      const matchNo = (c.case_no || '').toLowerCase().includes(q)
      const matchName = (c.primary_applicant_name || c.applicant_name || '').toLowerCase().includes(q)
      const matchPhone = (c.primary_applicant_mobile || c.mobile || '').includes(q)
      const matchReg = (c.vehicle_reg_no || c.vehicle?.registration_no || '').toLowerCase().includes(q)
      const matchVeh = (c.vehicle_summary || c.vehicle_details || '').toLowerCase().includes(q)
      const matchPartner = (c.referral_partner_name || c.source_name || '').toLowerCase().includes(q)
      return matchNo || matchName || matchPhone || matchReg || matchVeh || matchPartner
    })
  }

  // Apply Telecaller Filter
  if (criteria.telecaller && criteria.telecaller !== 'all') {
    if (criteria.telecaller === 'unassigned') {
      list = list.filter(isUnassignedCase)
    } else {
      list = list.filter((c: any) => {
        return (
          c.assigned_telecaller_id === criteria.telecaller ||
          (c.assigned_telecaller_name || '').toLowerCase().includes(criteria.telecaller!.toLowerCase())
        )
      })
    }
  }

  // Apply Loan Type Filter
  if (criteria.loanType && criteria.loanType !== 'all') {
    const targetType = criteria.loanType.toLowerCase()
    list = list.filter((c: any) => {
      const prod = (c.product_type || c.product || '').toLowerCase()
      const veh = (c.vehicle_details || c.vehicle_summary || '').toLowerCase()
      if (targetType === 'used_car' || targetType === 'used') {
        return prod === 'used_car' || veh.includes('used') || c.vehicle?.condition === 'used'
      }
      if (targetType === 'new_car' || targetType === 'new') {
        return prod === 'new_car' || veh.includes('new') || c.vehicle?.condition === 'new'
      }
      if (targetType === 'commercial') {
        return prod.includes('commercial') || veh.includes('commercial') || veh.includes('ace')
      }
      return prod.includes(targetType)
    })
  }

  // Apply Referral Partner / Sourcing Filter
  if (criteria.referral && criteria.referral !== 'all') {
    const targetRef = criteria.referral.toLowerCase()
    list = list.filter((c: any) => {
      if (targetRef === 'direct') {
        return (
          c.source_type === 'direct' ||
          (!c.referral_partner_id &&
            !c.referral_partner_name &&
            !c.referral_profile_id &&
            ((c.source_name || '').toLowerCase().includes('direct') || c.source_name === 'Quick Intake Desk'))
        )
      }
      const pName = (c.referral_partner_name || c.source_name || '').toLowerCase()
      return pName.includes(targetRef)
    })
  }

  return list
}
