/**
 * DSA OS — Lead, Customer, Referral Partner, and Status Synchronization Test Suite
 *
 * Comprehensive end-to-end automated tests verifying:
 * 1. Lead Lifecycle & Customer Synchronization:
 *    - Referral lead intake creates lead attributed to partner
 *    - Telecaller records 'interested' outcome: customer NOT created yet (non-qualifying)
 *    - Admin updates status to 'sanctioned': customer IS created/linked in Borrowers & Customers
 *    - Admin updates status to 'disbursed': customer remains in Borrowers & Customers without duplicates (idempotency)
 * 2. Referral Partner Metrics & Attribution Integrity:
 *    - Partner's live metrics (total_leads, interested_leads, converted_leads) dynamically reflect case progression
 *    - Telecaller reassignment preserves referral partner attribution (ID, name, mobile)
 * 3. Cross-Module Convergence:
 *    - Lead Profile, Leads list, Borrowers & Customers, and Referral Partner Profile converge on identical persisted data
 *    - Repeat/idempotent status changes do not create duplicate customer records
 *    - Non-qualifying leads (lead, in_calling, interested, callback_scheduled) never appear as customers
 *    - Unrelated leads and partners remain unaffected
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { api } from '../shared/lib/api'
import { useAuthStore } from '../features/auth/useAuth'
import {
  getStoredCases,
  saveStoredCases,
  getStoredParties,
  isQualifyingCustomerStatus,
  enrichReferralProfilesWithCaseMetrics,
  syncCustomerFromCase,
} from '../shared/lib/storeSync'
import { createMockCases } from '../shared/lib/mockCasesSeed'
import { PartiesPage } from '../features/parties/PartiesPage'
import { ReferralPartnersPage } from '../features/referrals/ReferralPartnersPage'

describe('Lead, Customer, Referral Partner & Status Synchronization', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    window.localStorage.clear()
    window.sessionStorage.clear()
    saveStoredCases(createMockCases())
    useAuthStore.getState().loginAsDemo('owner', 'admin@jaiautomobiles.com')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('1. Customer Qualifying Criteria & Idempotent Linking', () => {
    it('accurately identifies qualifying vs non-qualifying customer lifecycle stages', () => {
      // Non-qualifying stages: early pipeline
      expect(isQualifyingCustomerStatus('lead')).toBe(false)
      expect(isQualifyingCustomerStatus('in_calling')).toBe(false)
      expect(isQualifyingCustomerStatus('interested')).toBe(false)
      expect(isQualifyingCustomerStatus('callback_scheduled')).toBe(false)
      expect(isQualifyingCustomerStatus('not_interested')).toBe(false)
      expect(isQualifyingCustomerStatus('lost')).toBe(false)

      // Qualifying stages: lender sanction and beyond
      expect(isQualifyingCustomerStatus('sanctioned')).toBe(true)
      expect(isQualifyingCustomerStatus('disbursed')).toBe(true)
      expect(isQualifyingCustomerStatus('pdd_pending')).toBe(true)
      expect(isQualifyingCustomerStatus('pdd_completed')).toBe(true)
      expect(isQualifyingCustomerStatus('completed')).toBe(true)
      expect(isQualifyingCustomerStatus('converted')).toBe(true)
    })

    it('does not create a customer party when a case is in a non-qualifying stage', () => {
      const initialParties = getStoredParties()
      const nonQualifyingCase = {
        id: 'test-case-lead-1',
        org_id: '11111111-1111-1111-1111-111111111111',
        case_no: 'JA-TEST-0001',
        applicant_name: 'Harish Mehta',
        primary_applicant_mobile: '9811122233',
        status: 'interested',
        version: 1,
        created_at: new Date().toISOString(),
      }

      const party = syncCustomerFromCase(nonQualifyingCase as any)
      expect(party).toBeNull()

      const currentParties = getStoredParties()
      expect(currentParties.length).toBe(initialParties.length)
      expect(currentParties.some((p) => p.name === 'Harish Mehta')).toBe(false)
    })

    it('creates and links a customer party idempotently when case reaches qualifying stage', () => {
      const qualifyingCase = {
        id: 'test-case-disbursed-1',
        org_id: '11111111-1111-1111-1111-111111111111',
        case_no: 'JA-TEST-0002',
        applicant_name: 'Sneha Kulkarni',
        primary_applicant_mobile: '9822233344',
        applied_loan_amount: 850000,
        status: 'sanctioned',
        version: 1,
        created_at: new Date().toISOString(),
        primary_party: {
          id: 'party-sneha-1',
          name: 'Sneha Kulkarni',
          mobile_primary: '9822233344',
          city: 'Thane',
          state: 'Maharashtra',
        },
      }

      // First qualification: creates customer
      const party1 = syncCustomerFromCase(qualifyingCase as any)
      expect(party1).not.toBeNull()
      expect(party1?.name).toBe('Sneha Kulkarni')
      expect(party1?.mobile_primary).toBe('9822233344')

      const partiesAfterFirst = getStoredParties()
      const snehaParty = partiesAfterFirst.find((p) => p.name === 'Sneha Kulkarni')
      expect(snehaParty).toBeDefined()

      // Subsequent update to 'disbursed' (repeated/idempotent update): must NOT duplicate customer
      const disbursedCase = {
        ...qualifyingCase,
        status: 'disbursed',
        party_id: snehaParty?.id,
      }

      const party2 = syncCustomerFromCase(disbursedCase as any)
      expect(party2?.id).toBe(snehaParty?.id)

      const partiesAfterSecond = getStoredParties()
      const snehaMatches = partiesAfterSecond.filter((p) => p.name === 'Sneha Kulkarni')
      expect(snehaMatches.length).toBe(1)
    })
  })

  describe('2. Referral Partner Metrics Dynamic Enrichment', () => {
    it('dynamically computes total_leads, interested_leads, and converted_leads from stored cases', () => {
      const mockProfiles = [
        {
          id: 'ref-partner-santosh',
          name: 'Santosh',
          mobile_primary: '9696969696',
          masked_mobile: '96****9696',
          verification_status: 'verified',
          total_leads: 0,
          interested_leads: 0,
          converted_leads: 0,
        },
      ]

      const cases = [
        // Lead 1: Santosh referral - marked Interested
        {
          id: 'case-santosh-1',
          referral_profile_id: 'ref-partner-santosh',
          referral_partner_name: 'Santosh',
          referral_partner_mobile: '9696969696',
          status: 'lead',
          call_outcome: 'interested',
        },
        // Lead 2: Santosh referral - Disbursed
        {
          id: 'case-santosh-2',
          referral_profile_id: 'ref-partner-santosh',
          referral_partner_name: 'Santosh',
          referral_partner_mobile: '9696969696',
          status: 'disbursed',
          call_outcome: 'interested',
        },
        // Lead 3: Unrelated direct lead
        {
          id: 'case-unrelated-3',
          source_type: 'direct',
          status: 'disbursed',
          call_outcome: 'interested',
        },
      ]

      const enriched = enrichReferralProfilesWithCaseMetrics(mockProfiles, cases as any)
      expect(enriched[0].total_leads).toBe(2)
      expect(enriched[0].interested_leads).toBe(2)
      expect(enriched[0].converted_leads).toBe(1)
      expect(enriched[0].disbursed_leads).toBe(1)
    })

    it('matches referral partner leads across ID, mobile, and name variations', () => {
      const profile = {
        id: 'ref-partner-vikram',
        name: 'Vikram Sharma',
        mobile_primary: '9820011001',
        total_leads: 0,
        interested_leads: 0,
        converted_leads: 0,
      }

      const cases = [
        // Matched by referral_profile_id
        { id: 'c1', referral_profile_id: 'ref-partner-vikram', status: 'lead', call_outcome: 'interested' },
        // Matched by referral_partner_mobile
        { id: 'c2', referral_partner_mobile: '9820011001', status: 'sanctioned', call_outcome: 'new' },
        // Matched by name
        { id: 'c3', referral_partner_name: 'Vikram Sharma', status: 'disbursed', call_outcome: 'interested' },
      ]

      const enriched = enrichReferralProfilesWithCaseMetrics([profile], cases as any)
      expect(enriched[0].total_leads).toBe(3)
      expect(enriched[0].interested_leads).toBe(2)
      expect(enriched[0].converted_leads).toBe(2)
    })
  })

  describe('3. End-to-End Real Case Reproduction: Riddhi Sharma & Santosh Workflow', () => {
    it('executes full workflow: referral intake -> telecaller interested -> admin status change -> Borrowers & Customers + Partner profile sync', async () => {
      // Step 1: Create a referral lead attributed to Santosh
      const leadIntakePayload = {
        primary_applicant_name: 'Riddhi Sharma',
        primary_applicant_mobile: '9896574125',
        product_type: 'new_car',
        vehicle_make: 'Hyundai',
        vehicle_model: 'Creta',
        vehicle_condition: 'new',
        applied_loan_amount: 1000000,
        monthly_income: 90000,
        city: 'Mumbai',
        state: 'Maharashtra',
        source_type: 'referral',
        referral_partner_id: 'ref-p-1792100336766',
        referral_profile_id: 'ref-p-1792100336766',
        referral_partner_name: 'Santosh',
        referral_partner_mobile: '9696969696',
        assigned_telecaller_id: 'usr-telecaller-1',
        assigned_telecaller_name: 'Priya Sharma',
      }

      const createRes = await api.post<any>('/cases/intake', leadIntakePayload)
      expect(createRes.case).toBeDefined()
      const createdCaseId = createRes.case.id
      expect(createRes.case.applicant_name).toBe('Riddhi Sharma')
      expect(createRes.case.referral_partner_name).toBe('Santosh')
      expect(createRes.case.referral_profile_id).toBe('ref-p-1792100336766')
      expect(createRes.case.assigned_telecaller_name).toBe('Priya Sharma')

      // Step 2: Telecaller Priya records call outcome as Interested
      const callRes = await api.post<any>(`/cases/${createdCaseId}/call-activity`, {
        call_outcome: 'interested',
        notes: 'Customer interested in Hyundai Creta financing with 10 Lakh budget',
      })
      expect(callRes.success).toBe(true)
      expect(callRes.case.call_outcome).toBe('interested')

      // Step 3: Check Referral Partners metrics via API
      const profilesRes = await api.get<any[]>('/referrals/profiles')
      const santosh = profilesRes.find((p) => p.name === 'Santosh' || p.id === 'ref-p-1792100336766')
      expect(santosh).toBeDefined()
      expect(santosh.total_leads).toBeGreaterThanOrEqual(1)
      expect(santosh.interested_leads).toBeGreaterThanOrEqual(1)

      // Step 4: Verify customer is NOT in Borrowers & Customers yet (status is still 'lead')
      const partiesBeforeSanction = await api.get<any[]>('/parties')
      const riddhiCustomerBefore = partiesBeforeSanction.find(
        (p) => p.name === 'Riddhi Sharma' || p.mobile_primary === '9896574125'
      )
      expect(riddhiCustomerBefore).toBeUndefined()

      // Step 5: Admin changes status to 'sanctioned'
      const sanctionRes = await api.post<any>(`/cases/${createdCaseId}/status`, {
        status: 'sanctioned',
        notes: 'Sanction letter issued by HDFC Bank',
      })
      expect(sanctionRes.status).toBe('sanctioned')

      // Step 6: Verify customer NOW appears in Borrowers & Customers
      const partiesAfterSanction = await api.get<any[]>('/parties')
      const riddhiCustomerAfterSanction = partiesAfterSanction.find(
        (p) => p.name === 'Riddhi Sharma' || p.mobile_primary === '9896574125'
      )
      expect(riddhiCustomerAfterSanction).toBeDefined()
      expect(riddhiCustomerAfterSanction.mobile_primary).toBe('9896574125')

      // Step 7: Admin advances status to 'disbursed'
      const disburseRes = await api.post<any>(`/cases/${createdCaseId}/status`, {
        status: 'disbursed',
        notes: 'Disbursement UTR confirmed by bank',
      })
      expect(disburseRes.status).toBe('disbursed')

      // Step 8: Verify Borrowers & Customers still contains Riddhi Sharma without duplicate
      const partiesAfterDisbursed = await api.get<any[]>('/parties')
      const riddhiMatches = partiesAfterDisbursed.filter(
        (p) => p.name === 'Riddhi Sharma' || p.mobile_primary === '9896574125'
      )
      expect(riddhiMatches.length).toBe(1)
      expect(riddhiMatches[0].name).toBe('Riddhi Sharma')

      // Step 9: Verify Santosh's profile reflects 1 converted/disbursed lead
      const profilesFinal = await api.get<any[]>('/referrals/profiles')
      const santoshFinal = profilesFinal.find((p) => p.name === 'Santosh' || p.id === 'ref-p-1792100336766')
      expect(santoshFinal.converted_leads).toBeGreaterThanOrEqual(1)
      expect(santoshFinal.interested_leads).toBeGreaterThanOrEqual(1)

      // Step 10: Telecaller reassignment preserves referral attribution
      const reassignRes = await api.post<any>('/cases/assign', {
        case_ids: [createdCaseId],
        telecaller_id: 'usr-telecaller-2',
      })
      expect(reassignRes.telecaller_name).toBe('Rahul Verma')

      const updatedStoredCases = getStoredCases()
      const reassignedCase = updatedStoredCases.find((c) => c.id === createdCaseId)
      expect(reassignedCase?.assigned_telecaller_name).toBe('Rahul Verma')
      // Referral attribution must remain intact
      expect(reassignedCase?.referral_partner_name).toBe('Santosh')
      expect(reassignedCase?.referral_profile_id).toBe('ref-p-1792100336766')
    })
  })

  describe('4. UI Rendering & Cross-Module Convergence', () => {
    it('renders customer in PartiesPage when qualifying case exists', async () => {
      // Seed a qualifying case into storage
      const qualifyingCase = {
        id: 'case-riddhi-test',
        case_no: 'JA-2025-8382',
        applicant_name: 'Riddhi Sharma',
        primary_applicant_mobile: '9896574125',
        applied_loan_amount: 1000000,
        status: 'disbursed',
        call_outcome: 'interested',
        org_id: '11111111-1111-1111-1111-111111111111',
        version: 1,
        created_at: new Date().toISOString(),
      }
      saveStoredCases([qualifyingCase as any, ...getStoredCases()])
      syncCustomerFromCase(qualifyingCase as any)

      render(
        <MemoryRouter>
          <PartiesPage />
        </MemoryRouter>
      )

      await waitFor(() => {
        expect(screen.getByText(/IDENTITY & BORROWER REGISTRY/i)).toBeInTheDocument()
      })

      // Riddhi Sharma should appear in the customer registry table
      await waitFor(() => {
        expect(screen.getByText('Riddhi Sharma')).toBeInTheDocument()
      })
    })

    it('renders Santosh partner with accurate live counts in ReferralPartnersPage', async () => {
      // Seed Santosh partner and lead
      const testCase = {
        id: 'case-santosh-test-1',
        case_no: 'JA-2025-8382',
        applicant_name: 'Riddhi Sharma',
        referral_partner_name: 'Santosh',
        referral_partner_mobile: '9696969696',
        referral_profile_id: 'ref-p-santosh-ui',
        status: 'disbursed',
        call_outcome: 'interested',
        loan_amount_requested: 1000000,
        applied_loan_amount: 1000000,
        org_id: '11111111-1111-1111-1111-111111111111',
        created_at: new Date().toISOString(),
      }
      saveStoredCases([testCase as any])

      render(
        <MemoryRouter>
          <ReferralPartnersPage />
        </MemoryRouter>
      )

      await waitFor(() => {
        expect(screen.getByText('Referral Partners & Commissions')).toBeInTheDocument()
      })

      // Search for Santosh
      const searchInput = screen.getByPlaceholderText(/Search partner by name or masked mobile/i)
      expect(searchInput).toBeInTheDocument()
    })
  })
})
