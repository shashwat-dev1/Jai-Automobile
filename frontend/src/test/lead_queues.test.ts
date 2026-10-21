import { describe, it, expect } from 'vitest'
import {
  getISTDateParts,
  getStartOfTodayIST,
  getEndOfTodayIST,
  isTodayIST,
  isOverdueIST,
  isFutureIST,
  deriveLeadStageFromAllocations,
  isEligibleForTelecallerAllocation,
  isTelecallerActiveCalling,
  isTelecallerDueToday,
  isTelecallerOverdue,
  isEligibleForPartnerAllocation,
  isPartnerAllocatedOrInProcess,
  evaluateAllQueues,
  FinancingPartnerAllocation,
  LeadItemLike,
} from '../shared/lib/leadQueues'

describe('DSA OS — IST Day Boundary & Timezone Calculations', () => {
  it('correctly calculates IST calendar date parts across UTC day boundaries', () => {
    // 2026-10-21 00:30:00 IST is 2026-10-20 19:00:00 UTC
    const dateUtc = new Date(Date.UTC(2026, 9, 20, 19, 0, 0))
    const parts = getISTDateParts(dateUtc)

    expect(parts.year).toBe(2026)
    expect(parts.month).toBe(10)
    expect(parts.day).toBe(21)
    expect(parts.hours).toBe(0)
    expect(parts.minutes).toBe(30)
    expect(parts.isoDateString).toBe('2026-10-21')
    expect(parts.reportingMonth).toBe('2026-10')
  })

  it('determines exact start of today IST (00:00:00.000) and end of today IST (23:59:59.999)', () => {
    const refDate = new Date('2026-10-21T12:00:00.000Z')
    const startIST = getStartOfTodayIST(refDate)
    const endIST = getEndOfTodayIST(refDate)

    const startParts = getISTDateParts(startIST)
    expect(startParts.hours).toBe(0)
    expect(startParts.minutes).toBe(0)
    expect(startParts.seconds).toBe(0)
    expect(startParts.isoDateString).toBe('2026-10-21')

    const endParts = getISTDateParts(endIST)
    expect(endParts.hours).toBe(23)
    expect(endParts.minutes).toBe(59)
    expect(endParts.seconds).toBe(59)
    expect(endParts.isoDateString).toBe('2026-10-21')
  })

  it('handles month and year rollover boundaries accurately without DST drift', () => {
    // New Year rollover: 2026-12-31 23:45 IST
    const newYearEve = new Date('2026-12-31T18:15:00.000Z') // 23:45 IST
    const partsEve = getISTDateParts(newYearEve)
    expect(partsEve.year).toBe(2026)
    expect(partsEve.month).toBe(12)
    expect(partsEve.day).toBe(31)

    // 30 minutes later: 2027-01-01 00:15 IST
    const newYear = new Date('2026-12-31T18:45:00.000Z') // 00:15 IST
    const partsNewYear = getISTDateParts(newYear)
    expect(partsNewYear.year).toBe(2027)
    expect(partsNewYear.month).toBe(1)
    expect(partsNewYear.day).toBe(1)
  })

  it('correctly classifies Today, Overdue, and Future follow-up timestamps in IST', () => {
    const ref = new Date('2026-10-21T10:00:00.000Z') // 15:30 IST on 2026-10-21

    // Follow-up scheduled for 18:00 IST on 2026-10-21 (Today)
    const todayFollowUp = '2026-10-21T12:30:00.000Z'
    expect(isTodayIST(todayFollowUp, ref)).toBe(true)
    expect(isOverdueIST(todayFollowUp, ref)).toBe(false)
    expect(isFutureIST(todayFollowUp, ref)).toBe(false)

    // Follow-up scheduled for 2026-10-20 17:00 IST (Yesterday -> Overdue)
    const overdueFollowUp = '2026-10-20T11:30:00.000Z'
    expect(isTodayIST(overdueFollowUp, ref)).toBe(false)
    expect(isOverdueIST(overdueFollowUp, ref)).toBe(true)
    expect(isFutureIST(overdueFollowUp, ref)).toBe(false)

    // Follow-up scheduled for 2026-10-22 10:00 IST (Tomorrow -> Future)
    const futureFollowUp = '2026-10-22T04:30:00.000Z'
    expect(isTodayIST(futureFollowUp, ref)).toBe(false)
    expect(isOverdueIST(futureFollowUp, ref)).toBe(false)
    expect(isFutureIST(futureFollowUp, ref)).toBe(true)
  })
})

describe('DSA OS — Pure Lead Stage Mapping from Allocations', () => {
  it('transitions lead stage to partner_allocated upon first successful allocation', () => {
    const allocations: FinancingPartnerAllocation[] = [
      {
        id: 'lead-1_hdfc-bank',
        leadId: 'lead-1',
        financingPartnerId: 'hdfc-bank',
        financingPartnerName: 'HDFC Bank',
        financingPartnerType: 'bank',
        status: 'Allocated',
        allocatedBy: 'usr-admin',
        allocatedAt: '2026-10-21T06:00:00.000Z',
        requestedAmountSnapshot: 500000,
      },
    ]

    const nextStage = deriveLeadStageFromAllocations('interested', allocations)
    expect(nextStage).toBe('partner_allocated')
  })

  it('keeps lead stage as partner_allocated if all allocations are Rejected (never Not Interested)', () => {
    const allocations: FinancingPartnerAllocation[] = [
      {
        id: 'lead-1_hdfc-bank',
        leadId: 'lead-1',
        financingPartnerId: 'hdfc-bank',
        financingPartnerName: 'HDFC Bank',
        financingPartnerType: 'bank',
        status: 'Rejected',
        allocatedBy: 'usr-admin',
        allocatedAt: '2026-10-21T06:00:00.000Z',
        rejectedAt: '2026-10-21T08:00:00.000Z',
        rejectionReason: 'CIBIL score below cutoff',
        requestedAmountSnapshot: 500000,
      },
    ]

    const nextStage = deriveLeadStageFromAllocations('partner_allocated', allocations)
    expect(nextStage).toBe('partner_allocated')
    expect(nextStage).not.toBe('not_interested')
  })

  it('transitions lead stage to sanctioned if any allocation is Sanctioned', () => {
    const allocations: FinancingPartnerAllocation[] = [
      {
        id: 'lead-1_hdfc-bank',
        leadId: 'lead-1',
        financingPartnerId: 'hdfc-bank',
        financingPartnerName: 'HDFC Bank',
        financingPartnerType: 'bank',
        status: 'Rejected',
        allocatedBy: 'usr-admin',
        allocatedAt: '2026-10-21T06:00:00.000Z',
        requestedAmountSnapshot: 800000,
      },
      {
        id: 'lead-1_axis-bank',
        leadId: 'lead-1',
        financingPartnerId: 'axis-bank',
        financingPartnerName: 'Axis Bank',
        financingPartnerType: 'bank',
        status: 'Sanctioned',
        allocatedBy: 'usr-admin',
        allocatedAt: '2026-10-21T06:00:00.000Z',
        sanctionAmount: 750000,
        sanctionedAt: '2026-10-21T10:00:00.000Z',
        requestedAmountSnapshot: 800000,
      },
    ]

    const nextStage = deriveLeadStageFromAllocations('partner_allocated', allocations)
    expect(nextStage).toBe('sanctioned')
    // Must never auto-set to disbursed or converted
    expect(nextStage).not.toBe('disbursed')
    expect(nextStage).not.toBe('converted')
  })

  it('never regresses terminal stages (disbursed, closed)', () => {
    const allocations: FinancingPartnerAllocation[] = [
      {
        id: 'lead-1_hdfc-bank',
        leadId: 'lead-1',
        financingPartnerId: 'hdfc-bank',
        financingPartnerName: 'HDFC Bank',
        financingPartnerType: 'bank',
        status: 'Rejected',
        allocatedBy: 'usr-admin',
        allocatedAt: '2026-10-21T06:00:00.000Z',
        requestedAmountSnapshot: 500000,
      },
    ]

    expect(deriveLeadStageFromAllocations('disbursed', allocations)).toBe('disbursed')
    expect(deriveLeadStageFromAllocations('closed', allocations)).toBe('closed')
  })
})

describe('DSA OS — Queue Selectors & Eligibility Rules', () => {
  const refDate = new Date('2026-10-21T10:00:00.000Z')

  it('Queue 1: Allocate to Telecaller eligibility', () => {
    // Unassigned + initial stage -> eligible
    const lead1: LeadItemLike = {
      id: 'l-1',
      status: 'lead',
      assigned_telecaller_id: null,
    }
    expect(isEligibleForTelecallerAllocation(lead1)).toBe(true)

    // Already assigned -> ineligible
    const lead2: LeadItemLike = {
      id: 'l-2',
      status: 'lead',
      assigned_telecaller_id: 'usr-telecaller-1',
    }
    expect(isEligibleForTelecallerAllocation(lead2)).toBe(false)

    // Not Interested -> ineligible
    const lead3: LeadItemLike = {
      id: 'l-3',
      status: 'lead',
      call_outcome: 'not_interested',
      assigned_telecaller_id: null,
    }
    expect(isEligibleForTelecallerAllocation(lead3)).toBe(false)
  })

  it('Queue 2: Telecaller Active Calling excludes future follow-ups', () => {
    // Assigned to Priya with no follow-up -> Active Calling
    const leadActive: LeadItemLike = {
      id: 'l-active',
      status: 'lead',
      assigned_telecaller_id: 'usr-telecaller-1',
      follow_up_at: null,
    }
    expect(isTelecallerActiveCalling(leadActive, 'usr-telecaller-1', refDate)).toBe(true)

    // Future follow-up -> Excluded from active calling
    const leadFuture: LeadItemLike = {
      id: 'l-future',
      status: 'lead',
      assigned_telecaller_id: 'usr-telecaller-1',
      follow_up_at: '2026-10-25T10:00:00.000Z', // 4 days later
    }
    expect(isTelecallerActiveCalling(leadFuture, 'usr-telecaller-1', refDate)).toBe(false)
  })

  it('Queue 3 & 4: Follow-up Due Today vs Overdue separation', () => {
    const leadDueToday: LeadItemLike = {
      id: 'l-today',
      status: 'lead',
      assigned_telecaller_id: 'usr-telecaller-1',
      follow_up_at: '2026-10-21T08:00:00.000Z', // 13:30 IST today
    }
    expect(isTelecallerDueToday(leadDueToday, 'usr-telecaller-1', refDate)).toBe(true)
    expect(isTelecallerOverdue(leadDueToday, 'usr-telecaller-1', refDate)).toBe(false)

    const leadOverdue: LeadItemLike = {
      id: 'l-overdue',
      status: 'lead',
      assigned_telecaller_id: 'usr-telecaller-1',
      follow_up_at: '2026-10-19T08:00:00.000Z', // 2 days ago
    }
    expect(isTelecallerDueToday(leadOverdue, 'usr-telecaller-1', refDate)).toBe(false)
    expect(isTelecallerOverdue(leadOverdue, 'usr-telecaller-1', refDate)).toBe(true)
  })

  it('Queue 5: Allocate to Partner eligibility (Interested + 0 allocations)', () => {
    const leadInterested: LeadItemLike = {
      id: 'l-int',
      status: 'lead',
      call_outcome: 'interested',
      allocationCount: 0,
    }
    expect(isEligibleForPartnerAllocation(leadInterested, [])).toBe(true)

    // Already allocated -> ineligible for initial partner allocation queue
    const alloc: FinancingPartnerAllocation = {
      id: 'l-int_hdfc',
      leadId: 'l-int',
      financingPartnerId: 'hdfc-bank',
      financingPartnerName: 'HDFC Bank',
      financingPartnerType: 'bank',
      status: 'Allocated',
      allocatedBy: 'admin',
      allocatedAt: '2026-10-21T06:00:00.000Z',
      requestedAmountSnapshot: 600000,
    }
    expect(isEligibleForPartnerAllocation(leadInterested, [alloc])).toBe(false)
    expect(isPartnerAllocatedOrInProcess(leadInterested, [alloc])).toBe(true)
  })

  it('Batch queue evaluation guarantees summary numbers match list lengths', () => {
    const leads: LeadItemLike[] = [
      { id: 'l1', status: 'lead', assigned_telecaller_id: null }, // unassigned
      { id: 'l2', status: 'lead', assigned_telecaller_id: 'usr-1', follow_up_at: null }, // active calling
      { id: 'l3', status: 'lead', call_outcome: 'interested', allocationCount: 0 }, // allocate to partner
      { id: 'l4', status: 'partner_allocated', current_stage: 'partner_allocated', allocationCount: 1 }, // partner allocated
      { id: 'l5', status: 'sanctioned', current_stage: 'sanctioned' }, // sanctioned
    ]

    const allocMap = new Map<string, FinancingPartnerAllocation[]>()
    allocMap.set('l4', [
      {
        id: 'l4_hdfc',
        leadId: 'l4',
        financingPartnerId: 'hdfc',
        financingPartnerName: 'HDFC Bank',
        financingPartnerType: 'bank',
        status: 'In Process',
        allocatedBy: 'admin',
        allocatedAt: '2026-10-21T00:00:00.000Z',
        requestedAmountSnapshot: 500000,
      },
    ])

    const result = evaluateAllQueues(leads, allocMap, refDate)

    expect(result.summary.totalLeads).toBe(5)
    expect(result.summary.allocateToTelecaller).toBe(result.allocateToTelecallerList.length)
    expect(result.summary.activeCalling).toBe(result.activeCallingList.length)
    expect(result.summary.allocateToPartner).toBe(result.allocateToPartnerList.length)
    expect(result.summary.partnerAllocated).toBe(result.partnerAllocatedList.length)
    expect(result.summary.sanctionedOrConverted).toBe(result.sanctionedOrConvertedList.length)
  })
})
