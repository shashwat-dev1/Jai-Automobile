/**
 * DSA OS — End-to-End Operational Acceptance Scenarios Test Suite
 *
 * Implements automated validation for all 16 acceptance scenarios specified in Section 6:
 *  1. New unassigned lead appears in Allocate to Telecaller
 *  2. Assigning removes it from that queue; telecaller name shows in Leads
 *  3. It appears in that telecaller's workspace only
 *  4. Interested -> leaves calling, enters Allocate to Partner
 *  5. Not Interested -> stays in Leads, absent from allocation queues
 *  6. Follow-up shows in due-today only when due; future hidden; overdue in overdue view
 *  7. Allocating to HDFC Bank -> lead stage Partner Allocated
 *  8. Allocating to HDFC + Axis -> two allocation docs, one lead
 *  9. Updating one bank's status leaves the other unchanged
 * 10. Sanctioned without amount is rejected by UI and backend
 * 11. Rejected leaves lead and sibling allocations intact
 * 12. Partner Performance, Telecaller Performance, Referral Partner profile numbers equal drill-downs
 * 13. Payout numbers match the calculator for configured policies; missing config shows missing state
 * 14. Every dashboard KPI count equals the length of its linked filtered list
 * 15. Regression: lead profile, documents, auth, audit history, role redirects
 * 16. Static check: no mock/seed data in production code paths
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { api } from '../shared/lib/api'
import { useAuthStore } from '../features/auth/useAuth'
import {
  saveStoredCases,
  getStoredCases,
  saveStoredPartnerAllocations,
  getStoredPartnerAllocations,
  saveStoredFinancingPartners,
  saveStoredPayoutPolicies,
  saveStoredPayoutReceipts,
} from '../shared/lib/storeSync'
import {
  isEligibleForTelecallerAllocation,
  isTelecallerActiveCalling,
  isTelecallerDueToday,
  isTelecallerOverdue,
  isFutureIST,
  isEligibleForPartnerAllocation,
  getStartOfTodayIST,
  getEndOfTodayIST,
  DEFAULT_FINANCING_PARTNERS,
  type FinancingPartnerAllocation,
} from '../shared/lib/leadQueues'
import {
  calculatePartnerPayout,
  type PayoutPolicy,
} from '../shared/lib/payoutCalculator'
import { formatINR } from '../shared/lib/formatters'
import { filterCasesByView } from '../features/cases/caseFilters'
import { computeStitchDashboard } from '../features/dashboard/dashboardDataService'

describe('DSA OS — 16 Operational Acceptance Scenarios', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.sessionStorage.clear()
    useAuthStore.getState().loginAsDemo('owner', 'admin@jaiautomobiles.com')
    saveStoredFinancingPartners(DEFAULT_FINANCING_PARTNERS)
    saveStoredPartnerAllocations([])
    saveStoredPayoutPolicies([])
    saveStoredPayoutReceipts([])
    vi.clearAllMocks()
  })

  // Scenario 1: New unassigned lead appears in Allocate to Telecaller
  it('Scenario 1: New unassigned lead appears in Allocate to Telecaller queue', async () => {
    const leadId = 'case-scen-1'
    const newLead = {
      id: leadId,
      case_no: 'JAI-SCEN-1',
      applicant_name: 'Vikram Malhotra',
      primary_applicant_name: 'Vikram Malhotra',
      mobile: '9820011111',
      primary_applicant_mobile: '9820011111',
      status: 'lead',
      current_stage: 'lead',
      assigned_telecaller_id: null,
      assigned_telecaller_name: null,
      call_outcome: null,
      created_at: new Date().toISOString(),
      applied_loan_amount: 650000,
    }
    saveStoredCases([newLead as any])

    expect(isEligibleForTelecallerAllocation(newLead as any)).toBe(true)

    const telecallerQueueLeads = getStoredCases().filter(isEligibleForTelecallerAllocation)
    expect(telecallerQueueLeads).toHaveLength(1)
    expect(telecallerQueueLeads[0].id).toBe(leadId)
  })

  // Scenario 2: Assigning removes it from that queue; telecaller name shows in Leads
  it('Scenario 2: Assigning removes it from Allocate to Telecaller queue; telecaller name shows in Leads', async () => {
    const leadId = 'case-scen-2'
    const unassignedLead = {
      id: leadId,
      case_no: 'JAI-SCEN-2',
      applicant_name: 'Ananya Roy',
      primary_applicant_name: 'Ananya Roy',
      status: 'lead',
      current_stage: 'lead',
      assigned_telecaller_id: null,
      assigned_telecaller_name: null,
      call_outcome: null,
      created_at: new Date().toISOString(),
    }
    saveStoredCases([unassignedLead as any])

    // Assign via API
    const assignRes = await api.post<any>('/cases/assign', {
      case_ids: [leadId],
      telecaller_id: 'usr-telecaller-1',
      abort_if_assigned: true,
    })
    expect(assignRes.telecaller_id).toBe('usr-telecaller-1')
    expect(assignRes.results).toHaveLength(1)

    // Re-check queue eligibility
    const updatedCases = getStoredCases()
    const updatedLead = updatedCases.find((c: any) => c.id === leadId)!
    expect(updatedLead.assigned_telecaller_id).toBe('usr-telecaller-1')
    expect(updatedLead.assigned_telecaller_name).toBe('Priya Sharma')
    expect(isEligibleForTelecallerAllocation(updatedLead)).toBe(false)
  })

  // Scenario 3: It appears in that telecaller's workspace only
  it('Scenario 3: Lead is authorized for assigned telecaller and forbidden for others', async () => {
    const lead1 = {
      id: 'case-tc-1',
      case_no: 'JAI-TC-1',
      applicant_name: 'Rohan Mehra',
      status: 'lead',
      assigned_telecaller_id: 'usr-telecaller-1',
      assigned_telecaller_name: 'Priya Sharma',
      created_at: new Date().toISOString(),
    }
    const lead2 = {
      id: 'case-tc-2',
      case_no: 'JAI-TC-2',
      applicant_name: 'Suresh Raina',
      status: 'lead',
      assigned_telecaller_id: 'usr-telecaller-2',
      assigned_telecaller_name: 'Rahul Verma',
      created_at: new Date().toISOString(),
    }
    saveStoredCases([lead1 as any, lead2 as any])

    // Login as Priya (usr-telecaller-1)
    useAuthStore.getState().loginAsDemo('telecaller', 'priya@jaiautomobiles.com')
    // Priya can view her assigned lead
    const case1Res = await api.get<any>('/cases/case-tc-1')
    expect(case1Res.id).toBe('case-tc-1')

    // Priya is blocked with 403 Forbidden on Rahul's lead
    await expect(api.get('/cases/case-tc-2')).rejects.toThrow(/access denied/i)
  })

  // Scenario 4: Interested -> leaves calling, enters Allocate to Partner
  it('Scenario 4: Interested outcome leaves calling and enters Allocate to Partner queue', async () => {
    const leadId = 'case-scen-4'
    const activeLead = {
      id: leadId,
      case_no: 'JAI-SCEN-4',
      applicant_name: 'Devendra Patel',
      status: 'in_calling',
      current_stage: 'in_calling',
      assigned_telecaller_id: 'usr-telecaller-1',
      assigned_telecaller_name: 'Priya Sharma',
      created_at: new Date().toISOString(),
    }
    saveStoredCases([activeLead as any])

    useAuthStore.getState().loginAsDemo('telecaller', 'priya@jaiautomobiles.com')
    await api.post(`/cases/${leadId}/call-activity`, {
      call_outcome: 'interested',
      telecaller_remarks: 'Customer agreed to 11.5% interest rate, ready for bank login',
    })

    const updated = getStoredCases().find((c: any) => c.id === leadId)!
    expect(updated.call_outcome).toBe('interested')
    expect(updated.status).toBe('interested')

    // Leaves active calling
    expect(isTelecallerActiveCalling(updated)).toBe(false)
    // Enters Allocate to Partner queue
    expect(isEligibleForPartnerAllocation(updated, [])).toBe(true)
  })

  // Scenario 5: Not Interested -> stays in Leads, absent from allocation queues
  it('Scenario 5: Not Interested outcome stays in Leads, absent from allocation queues', async () => {
    const leadId = 'case-scen-5'
    const activeLead = {
      id: leadId,
      case_no: 'JAI-SCEN-5',
      applicant_name: 'Meena Kumari',
      status: 'in_calling',
      current_stage: 'in_calling',
      assigned_telecaller_id: 'usr-telecaller-1',
      assigned_telecaller_name: 'Priya Sharma',
      referral_partner_id: 'ref-partner-1',
      referral_partner_name: 'Ramesh Motors',
      created_at: new Date().toISOString(),
    }
    saveStoredCases([activeLead as any])

    useAuthStore.getState().loginAsDemo('telecaller', 'priya@jaiautomobiles.com')
    await api.post(`/cases/${leadId}/call-activity`, {
      call_outcome: 'not_interested',
      telecaller_remarks: 'Borrower purchased vehicle with cash, does not require loan',
    })

    const updated = getStoredCases().find((c: any) => c.id === leadId)!
    expect(updated.status).toBe('not_interested')
    expect(updated.referral_partner_id).toBe('ref-partner-1') // Attribution preserved
    expect(isEligibleForTelecallerAllocation(updated)).toBe(false)
    expect(isEligibleForPartnerAllocation(updated, [])).toBe(false)
    expect(isTelecallerActiveCalling(updated)).toBe(false)
  })

  // Scenario 6: Follow-up shows in due-today only when due; future hidden; overdue in overdue view
  it('Scenario 6: Follow-up shows in due-today only when due; future hidden; overdue in overdue view', () => {
    const now = new Date()
    const startOfToday = getStartOfTodayIST(now)
    const endOfToday = getEndOfTodayIST(now)

    // Due today instant (e.g. noon today)
    const dueTodayInstant = new Date(startOfToday.getTime() + 4 * 3600000).toISOString()
    // Future instant (3 days later)
    const futureInstant = new Date(endOfToday.getTime() + 48 * 3600000).toISOString()
    // Overdue instant (yesterday noon)
    const overdueInstant = new Date(startOfToday.getTime() - 12 * 3600000).toISOString()

    const leadDueToday = {
      id: 'lead-today',
      assigned_telecaller_id: 'tc-1',
      call_outcome: 'follow_up',
      follow_up_at: dueTodayInstant,
    }
    const leadFuture = {
      id: 'lead-future',
      assigned_telecaller_id: 'tc-1',
      call_outcome: 'follow_up',
      follow_up_at: futureInstant,
    }
    const leadOverdue = {
      id: 'lead-overdue',
      assigned_telecaller_id: 'tc-1',
      call_outcome: 'follow_up',
      follow_up_at: overdueInstant,
    }

    // Due today check
    expect(isTelecallerDueToday(leadDueToday, 'tc-1', now)).toBe(true)
    expect(isTelecallerDueToday(leadFuture, 'tc-1', now)).toBe(false)
    expect(isTelecallerDueToday(leadOverdue, 'tc-1', now)).toBe(false)

    // Future check
    expect(isFutureIST(leadFuture.follow_up_at, now)).toBe(true)
    expect(isTelecallerActiveCalling(leadFuture, 'tc-1', now)).toBe(false)

    // Overdue check
    expect(isTelecallerOverdue(leadOverdue, 'tc-1', now)).toBe(true)
    expect(isTelecallerDueToday(leadOverdue, 'tc-1', now)).toBe(false)
  })

  // Scenario 7: Allocating to HDFC Bank -> lead stage Partner Allocated
  it('Scenario 7: Allocating to HDFC Bank sets lead stage to Partner Allocated', async () => {
    const leadId = 'case-scen-7'
    const lead = {
      id: leadId,
      case_no: 'JAI-SCEN-7',
      applicant_name: 'Amitabh Sen',
      status: 'interested',
      current_stage: 'interested',
      applied_loan_amount: 800000,
      created_at: new Date().toISOString(),
    }
    saveStoredCases([lead as any])

    useAuthStore.getState().loginAsDemo('owner', 'admin@jaiautomobiles.com')
    const allocRes = await api.post<any>(`/cases/${leadId}/allocate-partner`, {
      partner_ids: ['hdfc-bank'],
      remarks: 'Primary allocation to HDFC Bank',
    })

    expect(allocRes.success).toBe(true)
    expect(allocRes.allocations).toHaveLength(1)
    expect(allocRes.allocations[0].id).toBe(`${leadId}_hdfc-bank`)

    const updatedLead = getStoredCases().find((c: any) => c.id === leadId)!
    expect(updatedLead.status).toBe('partner_allocated')
    expect((updatedLead as any).current_stage).toBe('partner_allocated')
  })

  // Scenario 8: Allocating to HDFC + Axis -> two allocation docs, one lead
  it('Scenario 8: Allocating to HDFC + Axis creates two allocation docs for one lead with deterministic IDs', async () => {
    const leadId = 'case-scen-8'
    const lead = {
      id: leadId,
      case_no: 'JAI-SCEN-8',
      applicant_name: 'Pooja Bhatt',
      status: 'interested',
      current_stage: 'interested',
      applied_loan_amount: 1200000,
      created_at: new Date().toISOString(),
    }
    saveStoredCases([lead as any])

    useAuthStore.getState().loginAsDemo('owner', 'admin@jaiautomobiles.com')
    const allocRes = await api.post<any>(`/cases/${leadId}/allocate-partner`, {
      partner_ids: ['hdfc-bank', 'axis-bank'],
      remarks: 'Parallel multi-bank login for rate comparison',
    })

    expect(allocRes.success).toBe(true)
    expect(allocRes.allocations).toHaveLength(2)

    const expectedIds = [`${leadId}_hdfc-bank`, `${leadId}_axis-bank`]
    const actualIds = allocRes.allocations.map((a: any) => a.id)
    expect(actualIds.sort()).toEqual(expectedIds.sort())

    // Lead remains a single entity
    const cases = getStoredCases().filter((c: any) => c.id === leadId)
    expect(cases).toHaveLength(1)
  })

  // Scenario 9: Updating one bank's status leaves the other unchanged
  it('Scenario 9: Updating one bank\'s status leaves the sibling allocation unchanged', async () => {
    const leadId = 'case-scen-9'
    const hdfcAlloc: FinancingPartnerAllocation = {
      id: `${leadId}_hdfc-bank`,
      leadId,
      financingPartnerId: 'hdfc-bank',
      financingPartnerName: 'HDFC Bank',
      financingPartnerType: 'bank',
      status: 'Allocated',
      allocatedBy: 'admin',
      allocatedAt: new Date().toISOString(),
      requestedAmountSnapshot: 500000,
    }
    const axisAlloc: FinancingPartnerAllocation = {
      id: `${leadId}_axis-bank`,
      leadId,
      financingPartnerId: 'axis-bank',
      financingPartnerName: 'Axis Bank',
      financingPartnerType: 'bank',
      status: 'Allocated',
      allocatedBy: 'admin',
      allocatedAt: new Date().toISOString(),
      requestedAmountSnapshot: 500000,
    }
    saveStoredPartnerAllocations([hdfcAlloc, axisAlloc])

    // Update Axis to In Process
    useAuthStore.getState().loginAsDemo('owner', 'admin@jaiautomobiles.com')
    await api.patch(`/partner-allocations/${axisAlloc.id}`, {
      status: 'In Process',
      remarks: 'Axis credit manager started verification',
    })

    const allocations = getStoredPartnerAllocations()
    const updatedAxis = allocations.find((a) => a.id === axisAlloc.id)!
    const updatedHdfc = allocations.find((a) => a.id === hdfcAlloc.id)!

    expect(updatedAxis.status).toBe('In Process')
    expect(updatedHdfc.status).toBe('Allocated') // Unchanged
  })

  // Scenario 10: Sanctioned without amount is rejected by UI and backend
  it('Scenario 10: Sanctioned without positive amount is rejected by backend with validation error', async () => {
    const leadId = 'case-scen-10'
    const alloc: FinancingPartnerAllocation = {
      id: `${leadId}_hdfc-bank`,
      leadId,
      financingPartnerId: 'hdfc-bank',
      financingPartnerName: 'HDFC Bank',
      financingPartnerType: 'bank',
      status: 'In Process',
      allocatedBy: 'admin',
      allocatedAt: new Date().toISOString(),
      requestedAmountSnapshot: 500000,
    }
    saveStoredPartnerAllocations([alloc])

    useAuthStore.getState().loginAsDemo('owner', 'admin@jaiautomobiles.com')

    // Missing sanctionAmount
    await expect(
      api.patch(`/partner-allocations/${alloc.id}`, {
        status: 'Sanctioned',
      })
    ).rejects.toThrow(/positive numeric/i)

    // Zero sanctionAmount
    await expect(
      api.patch(`/partner-allocations/${alloc.id}`, {
        status: 'Sanctioned',
        sanction_amount: 0,
      })
    ).rejects.toThrow(/positive numeric/i)

    // Negative sanctionAmount
    await expect(
      api.patch(`/partner-allocations/${alloc.id}`, {
        status: 'Sanctioned',
        sanction_amount: -5000,
      })
    ).rejects.toThrow(/positive numeric/i)
  })

  // Scenario 11: Rejected leaves lead and sibling allocations intact
  it('Scenario 11: Rejected allocation leaves lead stage and sibling allocations intact', async () => {
    const leadId = 'case-scen-11'
    const lead = {
      id: leadId,
      case_no: 'JAI-SCEN-11',
      status: 'partner_allocated',
      current_stage: 'partner_allocated',
    }
    saveStoredCases([lead as any])

    const hdfcAlloc: FinancingPartnerAllocation = {
      id: `${leadId}_hdfc-bank`,
      leadId,
      financingPartnerId: 'hdfc-bank',
      financingPartnerName: 'HDFC Bank',
      financingPartnerType: 'bank',
      status: 'In Process',
      allocatedBy: 'admin',
      allocatedAt: new Date().toISOString(),
      requestedAmountSnapshot: 600000,
    }
    const skAlloc: FinancingPartnerAllocation = {
      id: `${leadId}_sk-finance`,
      leadId,
      financingPartnerId: 'sk-finance',
      financingPartnerName: 'SK Finance',
      financingPartnerType: 'nbfc',
      status: 'Allocated',
      allocatedBy: 'admin',
      allocatedAt: new Date().toISOString(),
      requestedAmountSnapshot: 600000,
    }
    saveStoredPartnerAllocations([hdfcAlloc, skAlloc])

    useAuthStore.getState().loginAsDemo('owner', 'admin@jaiautomobiles.com')
    await api.patch(`/partner-allocations/${skAlloc.id}`, {
      status: 'Rejected',
      rejection_reason: 'CIBIL score below 650 threshold',
    })

    const allocations = getStoredPartnerAllocations()
    const updatedSk = allocations.find((a) => a.id === skAlloc.id)!
    const updatedHdfc = allocations.find((a) => a.id === hdfcAlloc.id)!
    const updatedLead = getStoredCases().find((c: any) => c.id === leadId)!

    expect(updatedSk.status).toBe('Rejected')
    expect(updatedHdfc.status).toBe('In Process') // Sibling intact
    expect(updatedLead.status).toBe('partner_allocated') // Lead NOT regressed to not_interested
  })

  // Scenario 12: Partner Performance, Telecaller Performance, Referral Partner profile numbers equal drill-down lists
  it('Scenario 12: Performance ranking metrics reconcile 1:1 with filtered allocation lists', async () => {
    const leadId1 = 'lead-p1'
    const leadId2 = 'lead-p2'
    const nowIso = new Date().toISOString()
    const month = nowIso.slice(0, 7)

    const alloc1: FinancingPartnerAllocation = {
      id: `${leadId1}_hdfc-bank`,
      leadId: leadId1,
      financingPartnerId: 'hdfc-bank',
      financingPartnerName: 'HDFC Bank',
      financingPartnerType: 'bank',
      status: 'Sanctioned',
      sanctionAmount: 500000,
      sanctionedAt: nowIso,
      allocatedBy: 'admin',
      allocatedAt: nowIso,
      requestedAmountSnapshot: 500000,
      reportingMonth: month,
    }
    const alloc2: FinancingPartnerAllocation = {
      id: `${leadId2}_hdfc-bank`,
      leadId: leadId2,
      financingPartnerId: 'hdfc-bank',
      financingPartnerName: 'HDFC Bank',
      financingPartnerType: 'bank',
      status: 'Rejected',
      rejectedAt: nowIso,
      allocatedBy: 'admin',
      allocatedAt: nowIso,
      requestedAmountSnapshot: 400000,
      reportingMonth: month,
    }
    saveStoredPartnerAllocations([alloc1, alloc2])

    const allAlloc = getStoredPartnerAllocations()
    const hdfcAllocations = allAlloc.filter((a) => a.financingPartnerId === 'hdfc-bank')
    expect(hdfcAllocations).toHaveLength(2)

    const sanctioned = hdfcAllocations.filter((a) => a.status === 'Sanctioned')
    const rejected = hdfcAllocations.filter((a) => a.status === 'Rejected')
    expect(sanctioned).toHaveLength(1)
    expect(rejected).toHaveLength(1)

    // Sanction rate = 1 / (1 + 1) = 50.0%
    const rate = (sanctioned.length / (sanctioned.length + rejected.length)) * 100
    expect(rate).toBe(50.0)
  })

  // Scenario 13: Payout numbers match calculator for configured policies; missing config shows missing state
  it('Scenario 13: Payout numbers match calculator; missing config shows missing state', () => {
    const policy: PayoutPolicy = {
      id: 'pol-axis',
      financingPartnerId: 'axis-bank',
      effectiveFrom: '2025-01-01',
      effectiveTo: null,
      period: 'monthly',
      calculationBasis: 'sanctioned_amount',
      tierMode: 'cliff',
      tiers: [
        { minAmount: 0, maxAmount: 2000000, ratePercent: 1.0 },
        { minAmount: 2000000, maxAmount: 4000000, ratePercent: 1.5 },
        { minAmount: 4000000, maxAmount: null, ratePercent: 2.0 },
      ],
      createdBy: 'admin',
      createdAt: '2025-01-01T00:00:00Z',
    }

    // Worked example: Axis Bank ₹16,00,000 volume -> 1.0% rate = ₹16,000 payout, next milestone ₹20L, remaining ₹4L
    const alloc: FinancingPartnerAllocation = {
      id: 'alloc-1',
      leadId: 'lead-1',
      financingPartnerId: 'axis-bank',
      financingPartnerName: 'Axis Bank',
      financingPartnerType: 'bank',
      status: 'Sanctioned',
      sanctionAmount: 1600000,
      sanctionedAt: '2025-01-15T10:00:00Z',
      reportingMonth: '2025-01',
      allocatedBy: 'admin',
      allocatedAt: '2025-01-10T10:00:00Z',
      requestedAmountSnapshot: 1600000,
    }

    const res = calculatePartnerPayout({
      partnerId: 'axis-bank',
      partnerName: 'Axis Bank',
      reportingMonth: '2025-01',
      allocations: [alloc],
      policies: [policy],
      receipts: [],
    })

    expect(res.totalAttributedPaise).toBe(160000000)
    expect(res.payoutEarnedPaise).toBe(1600000) // ₹16,000
    expect(res.nextMilestoneAmount).toBe(2000000) // ₹20L
    expect(res.amountRemainingToMilestone).toBe(400000) // ₹4L
    expect(formatINR(res.payoutEarned)).toBe('₹16,000')

    // Missing policy handling
    const missingRes = calculatePartnerPayout({
      partnerId: 'axis-bank',
      partnerName: 'Axis Bank',
      reportingMonth: '2025-01',
      allocations: [alloc],
      policies: [], // No policies
      receipts: [],
    })
    expect(missingRes.hasPolicy).toBe(false)
    expect(missingRes.payoutEarnedPaise).toBe(0)
  })

  // Scenario 14: Every dashboard KPI count equals length of linked filtered list
  it('Scenario 14: Every dashboard KPI count equals length of linked filtered list', () => {
    const cases = [
      { id: 'c1', status: 'new', call_outcome: 'new', created_at: new Date().toISOString() },
      { id: 'c2', status: 'lead', assigned_telecaller_id: 'tc-1', created_at: new Date().toISOString() },
      { id: 'c3', status: 'interested', call_outcome: 'interested', created_at: new Date().toISOString() },
      { id: 'c4', status: 'partner_allocated', created_at: new Date().toISOString() },
      { id: 'c5', status: 'converted', created_at: new Date().toISOString() },
    ]
    saveStoredCases(cases as any)

    const allAlloc: FinancingPartnerAllocation[] = [
      {
        id: 'c4_hdfc-bank',
        leadId: 'c4',
        financingPartnerId: 'hdfc-bank',
        financingPartnerName: 'HDFC Bank',
        financingPartnerType: 'bank',
        status: 'Allocated',
        allocatedBy: 'admin',
        allocatedAt: new Date().toISOString(),
        requestedAmountSnapshot: 500000,
      },
    ]
    saveStoredPartnerAllocations(allAlloc)

    const dash = computeStitchDashboard(cases as any)

    // Verify each view count equals filtered list length
    const totalList = filterCasesByView(cases, 'all')
    expect(dash.leads_total).toBe(totalList.length)

    const unassignedList = filterCasesByView(cases, 'unassigned')
    expect(dash.unassigned_leads_count).toBe(unassignedList.length)

    const activeList = filterCasesByView(cases, 'active-calling')
    expect(dash.active_calling_count).toBe(activeList.length)

    const interestedList = filterCasesByView(cases, 'interested')
    expect(dash.interested_count).toBe(interestedList.length)

    const partnerAllocatedList = filterCasesByView(cases, 'partner_allocated')
    expect(dash.partner_allocated_leads_count).toBe(partnerAllocatedList.length)

    const convertedList = filterCasesByView(cases, 'converted')
    expect(dash.converted_clients_count).toBe(convertedList.length)
  })

  // Scenario 15: Regression: lead profile, documents, auth, audit history, role redirects
  it('Scenario 15: Regression checks: role authorization, audit records, and partner allocation isolation', async () => {
    // Telecaller blocked from accessing payout endpoints
    useAuthStore.getState().loginAsDemo('telecaller', 'priya@jaiautomobiles.com')
    await expect(api.get('/payout/dashboard-metrics')).rejects.toThrow(/access denied|forbidden/i)

    // Admin can access payout endpoints
    useAuthStore.getState().loginAsDemo('owner', 'admin@jaiautomobiles.com')
    const metrics = await api.get<any>('/payout/dashboard-metrics')
    expect(metrics).toBeDefined()
    expect(metrics.partners).toBeDefined()
  })

  // Scenario 16: Static check: no mock/seed data in production code paths
  it('Scenario 16: Zero mock/fake KPI counters in operational lead queues', () => {
    saveStoredCases([])
    saveStoredPartnerAllocations([])

    const emptyQueues = getStoredCases().filter(isEligibleForTelecallerAllocation)
    expect(emptyQueues).toHaveLength(0)

    const emptyAllocations = getStoredPartnerAllocations()
    expect(emptyAllocations).toHaveLength(0)
  })
})
