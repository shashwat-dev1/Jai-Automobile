import { describe, it, expect } from 'vitest'
import {
  calculatePartnerPayout,
  toPaise,
  toRupees,
  PayoutPolicy,
  PayoutReceipt,
} from '../shared/lib/payoutCalculator'
import type { FinancingPartnerAllocation } from '../shared/lib/leadQueues'

describe('DSA OS — Payout Calculation Engine', () => {
  // Test fixture policy from PRD prompt:
  // < ₹20L -> 1.0%
  // ₹20L to < ₹40L -> 1.5%
  // >= ₹40L -> 2.0%
  const samplePolicy: PayoutPolicy = {
    id: 'pol-axis-2026',
    financingPartnerId: 'axis-bank',
    financingPartnerName: 'Axis Bank',
    effectiveFrom: '2026-01-01',
    effectiveTo: null,
    period: 'monthly',
    calculationBasis: 'sanctioned_amount',
    tierMode: 'slab',
    tiers: [
      { minAmount: 0, maxAmount: 2000000, ratePercent: 1.0 }, // 0 to 20L: 1.0%
      { minAmount: 2000000, maxAmount: 4000000, ratePercent: 1.5 }, // 20L to 40L: 1.5%
      { minAmount: 4000000, maxAmount: null, ratePercent: 2.0 }, // >= 40L: 2.0%
    ],
  }

  it('correctly calculates integer paise to eliminate floating point issues', () => {
    expect(toPaise(100.55)).toBe(10055)
    expect(toRupees(10055)).toBe(100.55)
    expect(toPaise(0)).toBe(0)
  })

  it('runs worked example from specification: Axis Bank with ₹16,00,000 volume', () => {
    // 1 allocation of 16 Lakhs sanctioned in October 2026
    const allocations: FinancingPartnerAllocation[] = [
      {
        id: 'alloc_1',
        leadId: 'lead_1',
        financingPartnerId: 'axis-bank',
        financingPartnerName: 'Axis Bank',
        financingPartnerType: 'bank',
        status: 'Sanctioned',
        allocatedBy: 'admin',
        allocatedAt: '2026-10-05T00:00:00.000Z',
        sanctionAmount: 1600000,
        sanctionedAt: '2026-10-10T10:00:00.000Z', // Oct 2026
        requestedAmountSnapshot: 1600000,
      },
    ]

    const result = calculatePartnerPayout({
      partnerId: 'axis-bank',
      partnerName: 'Axis Bank',
      reportingMonth: '2026-10',
      allocations,
      policies: [samplePolicy],
      receipts: [],
    })

    expect(result.hasPolicy).toBe(true)
    expect(result.totalAttributedVolume).toBe(1600000)
    // In slab mode, 16L is entirely in Tier 1 (1.0%) -> Payout = 16,000
    expect(result.payoutEarned).toBe(16000)
    expect(result.amountReceived).toBe(0)
    expect(result.estimatedPayable).toBe(16000)
    expect(result.outstandingReceivable).toBe(16000)

    // Milestone tracking from prompt:
    // next milestone ₹20,00,000, remaining ₹4,00,000
    expect(result.nextMilestoneAmount).toBe(2000000)
    expect(result.amountRemainingToMilestone).toBe(400000)
    expect(result.isTopTierReached).toBe(false)
  })

  it('evaluates volume exactly at boundary ₹20,00,000', () => {
    const allocations: FinancingPartnerAllocation[] = [
      {
        id: 'alloc_20l',
        leadId: 'lead_2',
        financingPartnerId: 'axis-bank',
        financingPartnerName: 'Axis Bank',
        financingPartnerType: 'bank',
        status: 'Sanctioned',
        allocatedBy: 'admin',
        allocatedAt: '2026-10-05T00:00:00.000Z',
        sanctionAmount: 2000000,
        sanctionedAt: '2026-10-12T10:00:00.000Z',
        requestedAmountSnapshot: 2000000,
      },
    ]

    const result = calculatePartnerPayout({
      partnerId: 'axis-bank',
      partnerName: 'Axis Bank',
      reportingMonth: '2026-10',
      allocations,
      policies: [samplePolicy],
      receipts: [],
    })

    expect(result.totalAttributedVolume).toBe(2000000)
    // Tier 1: 20L * 1.0% = 20,000
    expect(result.payoutEarned).toBe(20000)
    // Next milestone is 40L, remaining is 20L
    expect(result.nextMilestoneAmount).toBe(4000000)
    expect(result.amountRemainingToMilestone).toBe(2000000)
  })

  it('evaluates volume above boundary: ₹30,00,000 in slab mode vs cliff mode', () => {
    const allocations: FinancingPartnerAllocation[] = [
      {
        id: 'alloc_30l',
        leadId: 'lead_3',
        financingPartnerId: 'axis-bank',
        financingPartnerName: 'Axis Bank',
        financingPartnerType: 'bank',
        status: 'Sanctioned',
        allocatedBy: 'admin',
        allocatedAt: '2026-10-05T00:00:00.000Z',
        sanctionAmount: 3000000,
        sanctionedAt: '2026-10-15T10:00:00.000Z',
        requestedAmountSnapshot: 3000000,
      },
    ]

    // 1. Slab mode calculation
    const slabResult = calculatePartnerPayout({
      partnerId: 'axis-bank',
      partnerName: 'Axis Bank',
      reportingMonth: '2026-10',
      allocations,
      policies: [samplePolicy],
      receipts: [],
    })
    // Tier 1 (first 20L): 20,000 (1%)
    // Tier 2 (next 10L): 15,000 (1.5%)
    // Total = 35,000
    expect(slabResult.payoutEarned).toBe(35000)

    // 2. Cliff mode calculation
    const cliffPolicy: PayoutPolicy = {
      ...samplePolicy,
      tierMode: 'cliff',
    }
    const cliffResult = calculatePartnerPayout({
      partnerId: 'axis-bank',
      partnerName: 'Axis Bank',
      reportingMonth: '2026-10',
      allocations,
      policies: [cliffPolicy],
      receipts: [],
    })
    // In cliff mode, the entire 30L gets the rate of Tier 2 (1.5%)
    // 30,00,000 * 1.5% = 45,000
    expect(cliffResult.payoutEarned).toBe(45000)
  })

  it('evaluates top tier reached boundary: ₹45,00,000', () => {
    const allocations: FinancingPartnerAllocation[] = [
      {
        id: 'alloc_top',
        leadId: 'lead_top',
        financingPartnerId: 'axis-bank',
        financingPartnerName: 'Axis Bank',
        financingPartnerType: 'bank',
        status: 'Sanctioned',
        allocatedBy: 'admin',
        allocatedAt: '2026-10-05T00:00:00.000Z',
        sanctionAmount: 4500000,
        sanctionedAt: '2026-10-18T10:00:00.000Z',
        requestedAmountSnapshot: 4500000,
      },
    ]

    const result = calculatePartnerPayout({
      partnerId: 'axis-bank',
      partnerName: 'Axis Bank',
      reportingMonth: '2026-10',
      allocations,
      policies: [samplePolicy],
      receipts: [],
    })

    expect(result.isTopTierReached).toBe(true)
    expect(result.nextMilestoneAmount).toBe(null)
    expect(result.amountRemainingToMilestone).toBe(null)
  })

  it('handles zero volume and missing receipts gracefully', () => {
    const result = calculatePartnerPayout({
      partnerId: 'axis-bank',
      partnerName: 'Axis Bank',
      reportingMonth: '2026-10',
      allocations: [],
      policies: [samplePolicy],
      receipts: [],
    })

    expect(result.totalAttributedVolume).toBe(0)
    expect(result.payoutEarned).toBe(0)
    expect(result.amountReceived).toBe(0)
    expect(result.hasReceipts).toBe(false)
    expect(result.estimatedPayable).toBe(0)
  })

  it('handles missing policy configuration without guessing', () => {
    const result = calculatePartnerPayout({
      partnerId: 'unconfigured-bank',
      partnerName: 'Unknown Bank',
      reportingMonth: '2026-10',
      allocations: [],
      policies: [],
      receipts: [],
    })

    expect(result.hasPolicy).toBe(false)
    expect(result.statusMessage).toBe('Policy not configured')
    expect(result.payoutEarned).toBe(0)
  })

  it('correctly credits admin receipts and flags overpayment', () => {
    const allocations: FinancingPartnerAllocation[] = [
      {
        id: 'alloc_part',
        leadId: 'lead_part',
        financingPartnerId: 'axis-bank',
        financingPartnerName: 'Axis Bank',
        financingPartnerType: 'bank',
        status: 'Sanctioned',
        allocatedBy: 'admin',
        allocatedAt: '2026-10-05T00:00:00.000Z',
        sanctionAmount: 1000000, // 10L -> 10,000 payout
        sanctionedAt: '2026-10-10T10:00:00.000Z',
        requestedAmountSnapshot: 1000000,
      },
    ]

    // Receipt of 6,000
    const receipts: PayoutReceipt[] = [
      {
        id: 'rcpt_1',
        financingPartnerId: 'axis-bank',
        period: '2026-10',
        amount: 6000,
        receivedOn: '2026-10-18',
        reference: 'UTR19283719',
        recordedBy: 'admin',
        recordedAt: '2026-10-18T10:00:00.000Z',
      },
    ]

    const result = calculatePartnerPayout({
      partnerId: 'axis-bank',
      partnerName: 'Axis Bank',
      reportingMonth: '2026-10',
      allocations,
      policies: [samplePolicy],
      receipts,
    })

    expect(result.payoutEarned).toBe(10000)
    expect(result.amountReceived).toBe(6000)
    expect(result.outstandingReceivable).toBe(4000)
    expect(result.isOverpaid).toBe(false)

    // Second receipt causing overpayment
    receipts.push({
      id: 'rcpt_2',
      financingPartnerId: 'axis-bank',
      period: '2026-10',
      amount: 7000, // Total = 13,000 (3,000 overpayment)
      receivedOn: '2026-10-20',
      reference: 'UTR19283720',
      recordedBy: 'admin',
      recordedAt: '2026-10-20T10:00:00.000Z',
    })

    const overpaidResult = calculatePartnerPayout({
      partnerId: 'axis-bank',
      partnerName: 'Axis Bank',
      reportingMonth: '2026-10',
      allocations,
      policies: [samplePolicy],
      receipts,
    })

    expect(overpaidResult.amountReceived).toBe(13000)
    expect(overpaidResult.outstandingReceivable).toBe(0)
    expect(overpaidResult.isOverpaid).toBe(true)
    expect(overpaidResult.overpaidAmount).toBe(3000)
  })

  it('de-duplicates allocations by ID so the same lead-partner pair is never double counted', () => {
    const allocations: FinancingPartnerAllocation[] = [
      {
        id: 'dup_alloc_1',
        leadId: 'lead_dup',
        financingPartnerId: 'axis-bank',
        financingPartnerName: 'Axis Bank',
        financingPartnerType: 'bank',
        status: 'Sanctioned',
        allocatedBy: 'admin',
        allocatedAt: '2026-10-05T00:00:00.000Z',
        sanctionAmount: 1000000,
        sanctionedAt: '2026-10-10T10:00:00.000Z',
        requestedAmountSnapshot: 1000000,
      },
      // Duplicate entry with same ID
      {
        id: 'dup_alloc_1',
        leadId: 'lead_dup',
        financingPartnerId: 'axis-bank',
        financingPartnerName: 'Axis Bank',
        financingPartnerType: 'bank',
        status: 'Sanctioned',
        allocatedBy: 'admin',
        allocatedAt: '2026-10-05T00:00:00.000Z',
        sanctionAmount: 1000000,
        sanctionedAt: '2026-10-10T10:00:00.000Z',
        requestedAmountSnapshot: 1000000,
      },
    ]

    const result = calculatePartnerPayout({
      partnerId: 'axis-bank',
      partnerName: 'Axis Bank',
      reportingMonth: '2026-10',
      allocations,
      policies: [samplePolicy],
      receipts: [],
    })

    expect(result.contributingAllocations.length).toBe(1)
    expect(result.totalAttributedVolume).toBe(1000000)
  })
})
