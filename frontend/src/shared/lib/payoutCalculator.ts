/**
 * DSA OS — Pure Payout Calculation Engine
 *
 * Implements deterministic payout computation per financing partner:
 * - Slab vs. Cliff calculation modes
 * - Integer paise arithmetic (1 INR = 100 paise) to eliminate floating-point drift
 * - Strict period and effective-date bounding in Asia/Kolkata (IST)
 * - Milestone tracking & remaining volume computation
 * - Missing policy & receipt state handling
 */

import { getISTDateParts } from './leadQueues'
import type { FinancingPartnerAllocation } from './leadQueues'

export type CalculationBasis = 'sanctioned_amount' | 'disbursed_amount'
export type TierMode = 'slab' | 'cliff'

export interface PayoutTier {
  minAmount: number // in INR (inclusive)
  maxAmount: number | null // in INR (exclusive), null if uncapped
  ratePercent: number // e.g. 1.5 for 1.5%
}

export interface PayoutPolicy {
  id: string
  financingPartnerId: string
  financingPartnerName?: string
  effectiveFrom: string // ISO date/instant (e.g. '2025-01-01')
  effectiveTo: string | null // ISO date/instant or null if current active
  period: 'monthly'
  calculationBasis: CalculationBasis
  tierMode: TierMode
  tiers: PayoutTier[]
  createdBy?: string
  createdAt?: string
}

export interface PayoutReceipt {
  id: string
  financingPartnerId: string
  period: string // YYYY-MM in IST
  amount: number // in INR (or integer paise internally)
  receivedOn: string // Date string YYYY-MM-DD
  reference: string // UTR / payment ref
  recordedBy: string
  recordedAt: string
}

export interface PayoutCalculationResult {
  hasPolicy: boolean
  policyId?: string
  partnerId: string
  partnerName: string
  reportingMonth: string // YYYY-MM
  tierMode?: TierMode
  calculationBasis?: CalculationBasis
  totalAttributedVolume: number // in INR
  totalAttributedPaise: number // in paise
  payoutEarned: number // in INR
  payoutEarnedPaise: number // in paise
  amountReceived: number // in INR
  amountReceivedPaise: number // in paise
  estimatedPayable: number // in INR
  outstandingReceivable: number // in INR
  isOverpaid: boolean
  overpaidAmount: number // in INR
  hasReceipts: boolean
  nextMilestoneAmount: number | null // in INR (null if top tier reached or no policy)
  amountRemainingToMilestone: number | null // in INR
  isTopTierReached: boolean
  appliedTierIndex: number | null
  contributingAllocations: FinancingPartnerAllocation[]
  breakdown: Array<{
    tierRange: string
    eligibleVolume: number
    ratePercent: number
    payoutAmount: number
  }>
  statusMessage?: string
}

// ---------------------------------------------------------------------------
// Helpers: Integer Paise Conversion & Formatting
// ---------------------------------------------------------------------------

export function toPaise(rupees: number | undefined | null): number {
  if (rupees === undefined || rupees === null || isNaN(rupees)) return 0
  return Math.round(Number(rupees) * 100)
}

export function toRupees(paise: number): number {
  return paise / 100
}

/**
 * Formats a number in Indian Lakh / Crore numbering system (e.g. ₹16,00,000)
 */
export function formatINR(val: number | undefined | null): string {
  const num = Number(val) || 0
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(num)
}

// ---------------------------------------------------------------------------
// Main Pure Calculator Engine
// ---------------------------------------------------------------------------

/**
 * Calculates payout for a given financing partner in a specific reporting period.
 * 
 * @param partnerId ID of the financing partner
 * @param partnerName Display name of the financing partner
 * @param reportingMonth Reporting month in YYYY-MM format (IST)
 * @param allocations Complete list of allocations in the system
 * @param policies Available policies for this partner
 * @param receipts Available receipts for this partner
 */
export function calculatePartnerPayout(params: {
  partnerId: string
  partnerName: string
  reportingMonth: string // YYYY-MM
  allocations: FinancingPartnerAllocation[]
  policies: PayoutPolicy[]
  receipts: PayoutReceipt[]
}): PayoutCalculationResult {
  const { partnerId, partnerName, reportingMonth, allocations, policies, receipts } = params

  // 1. Resolve applicable policy for this partner & period
  // We check effective date ranges against the reporting month
  const partnerPolicies = policies.filter((p) => p.financingPartnerId === partnerId)
  const applicablePolicy = findApplicablePolicy(partnerPolicies, reportingMonth)

  // 2. Filter contributing allocations for this partner & period (de-duplicated by allocation ID)
  const relevantAllocations = filterAllocationsForPeriod({
    partnerId,
    reportingMonth,
    allocations,
    calculationBasis: applicablePolicy?.calculationBasis || 'sanctioned_amount',
  })

  // 3. Receipts for this period
  const partnerReceipts = receipts.filter(
    (r) => r.financingPartnerId === partnerId && r.period === reportingMonth
  )
  const totalReceivedPaise = partnerReceipts.reduce((sum, r) => sum + toPaise(r.amount), 0)
  const totalReceived = toRupees(totalReceivedPaise)

  // If no policy is configured
  if (!applicablePolicy || !applicablePolicy.tiers || applicablePolicy.tiers.length === 0) {
    const totalVolume = relevantAllocations.reduce((sum, a) => {
      const amt = a.sanctionAmount || a.requestedAmountSnapshot || 0
      return sum + amt
    }, 0)

    return {
      hasPolicy: false,
      partnerId,
      partnerName,
      reportingMonth,
      totalAttributedVolume: totalVolume,
      totalAttributedPaise: toPaise(totalVolume),
      payoutEarned: 0,
      payoutEarnedPaise: 0,
      amountReceived: totalReceived,
      amountReceivedPaise: totalReceivedPaise,
      estimatedPayable: 0,
      outstandingReceivable: 0,
      isOverpaid: totalReceived > 0,
      overpaidAmount: totalReceived > 0 ? totalReceived : 0,
      hasReceipts: partnerReceipts.length > 0,
      nextMilestoneAmount: null,
      amountRemainingToMilestone: null,
      isTopTierReached: false,
      appliedTierIndex: null,
      contributingAllocations: relevantAllocations,
      breakdown: [],
      statusMessage: 'Policy not configured',
    }
  }

  // 4. Compute Total Attributed Volume (in paise)
  const basis = applicablePolicy.calculationBasis
  let totalVolumePaise = 0

  for (const alloc of relevantAllocations) {
    const amountInINR = basis === 'sanctioned_amount'
      ? (alloc.sanctionAmount || 0)
      : (alloc.sanctionAmount || alloc.requestedAmountSnapshot || 0)
    totalVolumePaise += toPaise(amountInINR)
  }

  const totalVolume = toRupees(totalVolumePaise)

  // 5. Compute Payout Earned based on tierMode ('slab' vs 'cliff')
  let earnedPaise = 0
  const breakdown: PayoutCalculationResult['breakdown'] = []
  const sortedTiers = [...applicablePolicy.tiers].sort((a, b) => a.minAmount - b.minAmount)

  if (applicablePolicy.tierMode === 'cliff') {
    // Cliff mode: The rate of the highest tier reached applies to the entire business volume
    let activeTier: PayoutTier | null = null

    for (let i = 0; i < sortedTiers.length; i++) {
      const tier = sortedTiers[i]
      if (totalVolume >= tier.minAmount) {
        if (tier.maxAmount === null || totalVolume < tier.maxAmount) {
          activeTier = tier
          break
        } else if (i === sortedTiers.length - 1 && totalVolume >= tier.minAmount) {
          activeTier = tier
        }
      }
    }

    if (activeTier) {
      // Entire volume gets activeTier.ratePercent
      earnedPaise = Math.round((totalVolumePaise * activeTier.ratePercent) / 100)
      breakdown.push({
        tierRange: activeTier.maxAmount ? `₹${activeTier.minAmount.toLocaleString('en-IN')} - ₹${activeTier.maxAmount.toLocaleString('en-IN')}` : `≥ ₹${activeTier.minAmount.toLocaleString('en-IN')}`,
        eligibleVolume: totalVolume,
        ratePercent: activeTier.ratePercent,
        payoutAmount: toRupees(earnedPaise),
      })
    }
  } else {
    // Slab mode: Each tier's rate applies only to the incremental amount within that tier
    for (const tier of sortedTiers) {
      const tierMinPaise = toPaise(tier.minAmount)
      const tierMaxPaise = tier.maxAmount !== null ? toPaise(tier.maxAmount) : Infinity

      if (totalVolumePaise > tierMinPaise) {
        const eligibleInTierPaise = Math.min(totalVolumePaise, tierMaxPaise) - tierMinPaise
        if (eligibleInTierPaise > 0) {
          const tierPayoutPaise = Math.round((eligibleInTierPaise * tier.ratePercent) / 100)
          earnedPaise += tierPayoutPaise

          breakdown.push({
            tierRange: tier.maxAmount ? `₹${tier.minAmount.toLocaleString('en-IN')} - ₹${tier.maxAmount.toLocaleString('en-IN')}` : `≥ ₹${tier.minAmount.toLocaleString('en-IN')}`,
            eligibleVolume: toRupees(eligibleInTierPaise),
            ratePercent: tier.ratePercent,
            payoutAmount: toRupees(tierPayoutPaise),
          })
        }
      }
    }
  }

  const payoutEarned = toRupees(earnedPaise)

  // 6. Milestone Calculation
  let nextMilestoneAmount: number | null = null
  let amountRemainingToMilestone: number | null = null
  let isTopTierReached = false

  for (const tier of sortedTiers) {
    if (tier.minAmount > totalVolume) {
      nextMilestoneAmount = tier.minAmount
      amountRemainingToMilestone = tier.minAmount - totalVolume
      break
    }
  }

  if (nextMilestoneAmount === null) {
    // Current volume is at or above the minimum of the highest tier
    isTopTierReached = true
  }

  // 7. Receivable & Payable reconciliation
  const outstandingPaise = Math.max(0, earnedPaise - totalReceivedPaise)
  const isOverpaid = totalReceivedPaise > earnedPaise
  const overpaidPaise = isOverpaid ? totalReceivedPaise - earnedPaise : 0

  return {
    hasPolicy: true,
    policyId: applicablePolicy.id,
    partnerId,
    partnerName,
    reportingMonth,
    tierMode: applicablePolicy.tierMode,
    calculationBasis: applicablePolicy.calculationBasis,
    totalAttributedVolume: totalVolume,
    totalAttributedPaise: totalVolumePaise,
    payoutEarned,
    payoutEarnedPaise: earnedPaise,
    amountReceived: totalReceived,
    amountReceivedPaise: totalReceivedPaise,
    estimatedPayable: toRupees(outstandingPaise),
    outstandingReceivable: toRupees(outstandingPaise),
    isOverpaid,
    overpaidAmount: toRupees(overpaidPaise),
    hasReceipts: partnerReceipts.length > 0,
    nextMilestoneAmount,
    amountRemainingToMilestone,
    isTopTierReached,
    appliedTierIndex: sortedTiers.findIndex((t) => totalVolume >= t.minAmount && (t.maxAmount === null || totalVolume < t.maxAmount)),
    contributingAllocations: relevantAllocations,
    breakdown,
  }
}

/**
 * Finds the applicable policy for a given reporting month (YYYY-MM).
 * Enforces effectiveFrom <= monthStart and (effectiveTo is null OR effectiveTo >= monthEnd)
 */
export function findApplicablePolicy(
  policies: PayoutPolicy[],
  reportingMonth: string
): PayoutPolicy | null {
  if (!policies || policies.length === 0) return null

  // Sort by effectiveFrom descending to pick the most specific/latest version
  const sorted = [...policies].sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))

  for (const p of sorted) {
    const fromMonth = p.effectiveFrom.slice(0, 7) // 'YYYY-MM'
    const toMonth = p.effectiveTo ? p.effectiveTo.slice(0, 7) : null

    if (reportingMonth >= fromMonth) {
      if (!toMonth || reportingMonth <= toMonth) {
        return p
      }
    }
  }

  return sorted[0] || null
}

/**
 * Filters and de-duplicates allocations relevant to this financing partner and reporting month
 */
export function filterAllocationsForPeriod(params: {
  partnerId: string
  reportingMonth: string // YYYY-MM
  allocations: FinancingPartnerAllocation[]
  calculationBasis?: CalculationBasis
}): FinancingPartnerAllocation[] {
  const { partnerId, reportingMonth, allocations, calculationBasis: _calculationBasis } = params

  const seenIds = new Set<string>()
  const result: FinancingPartnerAllocation[] = []

  for (const alloc of allocations) {
    if (alloc.financingPartnerId !== partnerId) continue
    if (alloc.status !== 'Sanctioned') continue // Payout is generated on Sanctioned/Disbursed loans

    // De-duplicate by allocation ID so lead-partner pair is never counted twice
    if (seenIds.has(alloc.id)) continue

    // Determine relevant date for attribution
    const relevantDate = alloc.sanctionedAt || alloc.allocatedAt
    if (!relevantDate) continue

    const { reportingMonth: allocMonth } = getISTDateParts(relevantDate)
    if (allocMonth === reportingMonth) {
      seenIds.add(alloc.id)
      result.push(alloc)
    }
  }

  return result
}
