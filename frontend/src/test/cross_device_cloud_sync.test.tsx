/**
 * DSA OS — Cross-Device Cloud Sync & Production Data Consistency Acceptance Suite
 * 
 * Verifies the end-to-end multi-device workflow:
 * 1. Referral lead submission (from mobile viewport / public portal).
 * 2. Real-time persistence and visibility in Desktop Admin session.
 * 3. Assignment of lead to Telecaller (Rahul Verma).
 * 4. Verification that Rahul sees the lead in his workspace.
 * 5. Strict isolation: Telecaller Priya cannot see Rahul's assigned lead.
 * 6. Session persistence and consistent dashboard metrics across viewports.
 * 7. Tenant & organization isolation (organization_slug: 'jai-automobiles').
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { api } from '../shared/lib/api'
import {
  getStoredCases,
  sanitizeForFirestore,
  mergeRemoteCases,
} from '../shared/lib/storeSync'
import { useAuthStore } from '../features/auth/useAuth'
import type { MockCase } from '../shared/lib/mockDatabase'

describe('Critical Production Bug: Cross-Device Cloud Sync & Telecaller Assignment Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAuthStore.getState().loginAsDemo('owner', 'admin@jaiautomobiles.com')
  })

  it('sanitizes data cleanly for Firestore without undefined values', () => {
    const raw = {
      id: 'test-doc-1',
      name: 'Test Borrower',
      tele: undefined,
      nested: {
        amount: 500000,
        remarks: undefined,
      },
      list: [1, undefined, 'item'],
    }

    const clean = sanitizeForFirestore(raw) as any
    expect(clean.tele).toBeNull()
    expect(clean.nested.remarks).toBeNull()
    expect(clean.nested.amount).toBe(500000)
    expect(clean.list[1]).toBeNull()
  })

  it('executes full Mobile Referral Submission -> Desktop Admin -> Rahul Assignment -> Telecaller Isolation workflow', async () => {
    // -------------------------------------------------------------------------
    // Step 1: Submit new lead through public referral portal (as done on mobile)
    // -------------------------------------------------------------------------
    const testLeadPayload = {
      partner_mobile: '9820991122',
      partner_name: 'Apex Auto Dealer',
      applicant_name: 'Vikramaditya Singhania',
      applicant_mobile: '9819998877',
      product_type: 'used_car',
      vehicle_condition: 'used',
      vehicle_make: 'Toyota',
      vehicle_model: 'Fortuner 4x4',
      vehicle_reg_no: 'MH-02-EE-1999',
      loan_amount_requested: 1850000,
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400053',
      aadhaar_doc_id: 'doc-aadhaar-test-99',
      pan_doc_id: 'doc-pan-test-99',
      rc_doc_id: 'doc-rc-test-99',
    }

    const submitRes = await api.post<{
      success: boolean
      case_id: string
      case_no: string
      tracking_id: string
      partner_name: string
    }>('/referrals/guest-submit', testLeadPayload)

    expect(submitRes.success).toBe(true)
    expect(submitRes.case_id).toBeDefined()
    expect(submitRes.case_no).toMatch(/^JA-2025-/)

    const newCaseId = submitRes.case_id
    const newCaseNo = submitRes.case_no

    // -------------------------------------------------------------------------
    // Step 2: Verify lead is saved under the correct organization tenant
    // -------------------------------------------------------------------------
    const storedAfterSubmit = getStoredCases()
    const submittedCase = storedAfterSubmit.find((c) => c.id === newCaseId)
    expect(submittedCase).toBeDefined()
    expect(submittedCase?.organization_slug).toBe('jai-automobiles')
    expect(submittedCase?.applicant_name).toBe('Vikramaditya Singhania')
    expect(submittedCase?.assigned_telecaller_id).toBeNull()

    // -------------------------------------------------------------------------
    // Step 3: Desktop Admin queries the lead list & dashboard
    // -------------------------------------------------------------------------
    useAuthStore.getState().loginAsDemo('owner', 'admin@jaiautomobiles.com')
    const adminCases = await api.get<MockCase[]>('/cases')
    const adminFoundLead = adminCases.find((c) => c.id === newCaseId)

    expect(adminFoundLead).toBeDefined()
    expect(adminFoundLead?.case_no).toBe(newCaseNo)
    expect(adminFoundLead?.loan_amount_requested).toBe(1850000)

    // Dashboard Overview includes the new lead
    const dashboardRes = await api.get<any>('/dashboard/overview')
    expect(dashboardRes.leads_total).toBe(storedAfterSubmit.length)
    expect(dashboardRes.unassigned_leads_count).toBeGreaterThanOrEqual(5)

    // -------------------------------------------------------------------------
    // Step 4: Admin assigns the lead to Rahul Verma (usr-telecaller-2)
    // -------------------------------------------------------------------------
    const assignRes = await api.post<{
      assigned_count: number
      telecaller_id: string
      telecaller_name: string
    }>('/cases/assign', {
      case_ids: [newCaseId],
      telecaller_id: 'usr-telecaller-2',
    })

    expect(assignRes.telecaller_id).toBe('usr-telecaller-2')
    expect(assignRes.telecaller_name).toBe('Rahul Verma')

    // Verify assignment state in database
    const assignedCase = getStoredCases().find((c) => c.id === newCaseId)
    expect(assignedCase?.assigned_telecaller_id).toBe('usr-telecaller-2')
    expect(assignedCase?.assigned_telecaller_name).toBe('Rahul Verma')

    // -------------------------------------------------------------------------
    // Step 5: Log in as Rahul Verma & verify assigned lead is visible in workspace
    // -------------------------------------------------------------------------
    useAuthStore.getState().loginAsDemo('telecaller', 'rahul.verma@jaiautomobiles.com')
    const rahulWorkspace = await api.get<{
      total_assigned: number
      leads: MockCase[]
    }>('/cases/telecaller/workspace')

    const rahulHasLead = rahulWorkspace.leads.find((c) => c.id === newCaseId)
    expect(rahulHasLead).toBeDefined()
    expect(rahulHasLead?.assigned_telecaller_id).toBe('usr-telecaller-2')
    expect(rahulHasLead?.applicant_name).toBe('Vikramaditya Singhania')

    // -------------------------------------------------------------------------
    // Step 6: Log in as Priya Sharma & verify STRICT ISOLATION (cannot see Rahul lead)
    // -------------------------------------------------------------------------
    useAuthStore.getState().loginAsDemo('telecaller', 'priya.sharma@jaiautomobiles.com')
    const priyaWorkspace = await api.get<{
      total_assigned: number
      leads: MockCase[]
    }>('/cases/telecaller/workspace')

    const priyaHasLead = priyaWorkspace.leads.find((c) => c.id === newCaseId)
    expect(priyaHasLead).toBeUndefined() // MUST NOT be visible to Priya!

    // Direct access to Rahul's lead dossier throws 403 Forbidden for Priya
    await expect(api.get(`/cases/${newCaseId}`)).rejects.toThrow(/Access denied/i)

    // -------------------------------------------------------------------------
    // Step 7: Verify mergeRemoteCases seamlessly incorporates remote cloud records
    // -------------------------------------------------------------------------
    const remoteCloudLead: MockCase = {
      id: 'case-cloud-remote-777',
      case_no: 'JA-2025-7777',
      applicant_name: 'Remote Device Customer',
      primary_applicant_name: 'Remote Device Customer',
      mobile: '9820777777',
      primary_applicant_mobile: '9820777777',
      product: 'used_car',
      product_type: 'used_car',
      vehicle_summary: '2021 Hyundai Creta SX',
      status: 'lead',
      applied_loan_amount: 900000,
      loan_amount_requested: 900000,
      source_name: 'Direct Portal',
      owner_name: 'Aarav Sharma',
      organization_slug: 'jai-automobiles',
      assigned_telecaller_id: 'usr-telecaller-2',
      assigned_telecaller_name: 'Rahul Verma',
      call_outcome: 'new',
      call_attempts_count: 0,
      has_consent: true,
      age_in_days: 0,
      version: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    mergeRemoteCases([remoteCloudLead])

    const casesAfterMerge = getStoredCases()
    const mergedDoc = casesAfterMerge.find((c) => c.id === 'case-cloud-remote-777')
    expect(mergedDoc).toBeDefined()
    expect(mergedDoc?.applicant_name).toBe('Remote Device Customer')
    expect(mergedDoc?.assigned_telecaller_name).toBe('Rahul Verma')
  })
})
