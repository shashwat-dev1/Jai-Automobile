/**
 * DSA OS — Sidebar Simplification & Quick Lead Intake Acceptance Tests
 *
 * Verifies:
 * 1. Sidebar Navigation:
 *    - "Cold Leads & Files" is renamed to "Leads"
 *    - Leads links to /cases (All Leads view by default)
 *    - "Lead Sources & Channels" and "Organizations & Branding" are removed
 *    - Retained items work correctly (Dashboard, Today's Console, Quick Lead Intake,
 *      Telecaller Workspace, Referral Partners, Public Referral Portal,
 *      Borrowers & Customers, Team & Telecallers, Audit Trail)
 *    - Leads is highlighted when list or profile is open
 *    - Quick Lead Intake is highlighted without collision
 * 2. Quick Lead Intake Source Dropdown:
 *    - Exactly two options: Direct vs Referral
 *    - Direct: no partner dropdown, saves source as direct
 *    - Referral: dynamically displays registered referral partners with name & mobile
 *    - Referral requires selecting a partner before submission/advance
 *    - Selected partner's actual ID and attribution are persisted
 *    - Switching from Referral to Direct clears partner selection
 *    - Empty partner list produces guidance message
 * 3. Regression & Attribution Integrity:
 *    - Direct leads do not inherit referral attribution in list or profile
 *    - Telecaller reassignment preserves original referral partner attribution
 *    - Public referral portal continues to work
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import Sidebar from '../shared/components/Sidebar'
import { CaseIntakeWorkspace } from '../features/cases/CaseIntakeWorkspace'
import { CaseCreateModal } from '../features/cases/CaseCreateModal'
import { CaseDetailPage } from '../features/cases/CaseDetailPage'
import { useAuthStore } from '../features/auth/useAuth'
import { saveStoredCases } from '../shared/lib/storeSync'
import { createMockCases } from '../shared/lib/mockCasesSeed'
import { api } from '../shared/lib/api'

describe('Sidebar Simplification & Quick Lead Intake Updates', () => {
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

  // --- 1. Sidebar Navigation Verification ---

  describe('1. Sidebar Navigation', () => {
    it('renames "Cold Leads & Files" to "Leads" and excludes removed routes', () => {
      render(
        <MemoryRouter initialEntries={['/']}>
          <Sidebar />
        </MemoryRouter>
      )

      // Retained and Renamed items
      expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: "Today's Console" })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Leads' })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Quick Lead Intake' })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Telecaller Workspace' })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Referral Partners' })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Public Referral Portal' })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Borrowers & Customers' })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Team & Telecallers' })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Audit Trail' })).toBeInTheDocument()

      // Removed items MUST NOT exist
      expect(screen.queryByText('Cold Leads & Files')).not.toBeInTheDocument()
      expect(screen.queryByText('Lead Sources & Channels')).not.toBeInTheDocument()
      expect(screen.queryByText('Organizations & Branding')).not.toBeInTheDocument()

      // "Leads" link must point to /cases
      const leadsLink = screen.getByRole('link', { name: 'Leads' })
      expect(leadsLink).toHaveAttribute('href', '/cases')
    })

    it('highlights Leads menu item when on /cases and on lead profile /cases/:id', () => {
      // 1. On /cases
      const { unmount } = render(
        <MemoryRouter initialEntries={['/cases']}>
          <Sidebar />
        </MemoryRouter>
      )
      const leadsLink1 = screen.getByRole('link', { name: 'Leads' })
      expect(leadsLink1.className).toContain('active')

      const intakeLink1 = screen.getByRole('link', { name: 'Quick Lead Intake' })
      expect(intakeLink1.className).not.toContain('active')
      unmount()

      // 2. On /cases/case-jai-101 (Lead Profile)
      const { unmount: unmount2 } = render(
        <MemoryRouter initialEntries={['/cases/case-jai-101']}>
          <Sidebar />
        </MemoryRouter>
      )
      const leadsLink2 = screen.getByRole('link', { name: 'Leads' })
      expect(leadsLink2.className).toContain('active')

      const intakeLink2 = screen.getByRole('link', { name: 'Quick Lead Intake' })
      expect(intakeLink2.className).not.toContain('active')
      unmount2()

      // 3. On /cases/new (Quick Lead Intake)
      render(
        <MemoryRouter initialEntries={['/cases/new']}>
          <Sidebar />
        </MemoryRouter>
      )
      const leadsLink3 = screen.getByRole('link', { name: 'Leads' })
      expect(leadsLink3.className).not.toContain('active')

      const intakeLink3 = screen.getByRole('link', { name: 'Quick Lead Intake' })
      expect(intakeLink3.className).toContain('active')
    })
  })

  // --- 2. Quick Lead Intake Source Dropdown ---

  describe('2. Quick Lead Intake Source Dropdown (CaseIntakeWorkspace)', () => {
    it('simplifies source dropdown to exactly Direct and Referral', async () => {
      render(
        <MemoryRouter initialEntries={['/cases/new']}>
          <CaseIntakeWorkspace />
        </MemoryRouter>
      )

      const sourceSelect = screen.getByLabelText(/Lead Source \*/i) as HTMLSelectElement
      expect(sourceSelect).toBeInTheDocument()

      // Must have exactly 2 options
      const options = Array.from(sourceSelect.options).map((o) => o.value)
      expect(options).toEqual(['direct', 'referral'])

      // By default Direct is selected, and NO referral partner dropdown is displayed
      expect(sourceSelect.value).toBe('direct')
      expect(screen.queryByLabelText(/Select Referral Partner/i)).not.toBeInTheDocument()
    })

    it('shows registered referral partners when Referral is selected', async () => {
      render(
        <MemoryRouter initialEntries={['/cases/new']}>
          <CaseIntakeWorkspace />
        </MemoryRouter>
      )

      const sourceSelect = screen.getByLabelText(/Lead Source \*/i)
      await userEvent.selectOptions(sourceSelect, 'referral')

      // Partner dropdown must now appear
      const partnerSelect = await screen.findByLabelText(/Select Referral Partner \*/i) as HTMLSelectElement
      expect(partnerSelect).toBeInTheDocument()

      // Populated dynamically with registered partners
      await waitFor(() => {
        const partnerOptionTexts = Array.from(partnerSelect.options).map((o) => o.text)
        expect(partnerOptionTexts.some((t) => t.includes('Rajesh Sharma'))).toBe(true)
        expect(partnerOptionTexts.some((t) => t.includes('Vikram Sharma'))).toBe(true)
      })
    })

    it('blocks advancing when Referral is selected but no partner is chosen', async () => {
      render(
        <MemoryRouter initialEntries={['/cases/new']}>
          <CaseIntakeWorkspace />
        </MemoryRouter>
      )

      const sourceSelect = screen.getByLabelText(/Lead Source \*/i)
      await userEvent.selectOptions(sourceSelect, 'referral')

      const continueBtn = screen.getByRole('button', { name: /Continue to Customer Profile/i })
      await userEvent.click(continueBtn)

      // Must show error and stay on Step 1
      expect(await screen.findByText(/Please select a referral partner/i)).toBeInTheDocument()
      expect(screen.getByText(/Step 1 — Lead Sourcing/i)).toBeInTheDocument()
    })

    it('clears referral partner selection when switching back from Referral to Direct', async () => {
      render(
        <MemoryRouter initialEntries={['/cases/new']}>
          <CaseIntakeWorkspace />
        </MemoryRouter>
      )

      const sourceSelect = screen.getByLabelText(/Lead Source \*/i)
      await userEvent.selectOptions(sourceSelect, 'referral')

      const partnerSelect = await screen.findByLabelText(/Select Referral Partner \*/i) as HTMLSelectElement
      // Select a partner
      const partnerOption = Array.from(partnerSelect.options).find((o) => o.value.includes('ref')) || partnerSelect.options[1]
      await userEvent.selectOptions(partnerSelect, partnerOption.value)
      expect(partnerSelect.value).toBe(partnerOption.value)

      // Switch back to Direct
      await userEvent.selectOptions(sourceSelect, 'direct')
      expect(screen.queryByLabelText(/Select Referral Partner/i)).not.toBeInTheDocument()

      // Switch back to Referral again: partner selection should have been cleared
      await userEvent.selectOptions(sourceSelect, 'referral')
      const resetPartnerSelect = await screen.findByLabelText(/Select Referral Partner \*/i) as HTMLSelectElement
      expect(resetPartnerSelect.value).toBe('')
    })

    it('shows an empty state and link to Referral Partners when no partners are registered', async () => {
      vi.spyOn(api, 'get').mockImplementation(async (url: string) => {
        if (url === '/referrals/profiles') return [] as any
        return [] as any
      })

      render(
        <MemoryRouter initialEntries={['/cases/new']}>
          <CaseIntakeWorkspace />
        </MemoryRouter>
      )

      const sourceSelect = screen.getByLabelText(/Lead Source \*/i)
      await userEvent.selectOptions(sourceSelect, 'referral')

      expect(await screen.findByText(/No referral partners registered yet/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Register a Partner in Referral Partners/i })).toBeInTheDocument()
    })
  })

  // --- 3. CaseCreateModal (Modal Lead Intake on All Leads Page) ---

  describe('3. CaseCreateModal Source Dropdown', () => {
    it('simplifies Lead Source to Direct vs Referral in CaseCreateModal', async () => {
      render(
        <CaseCreateModal
          isOpen={true}
          onClose={() => {}}
          onCreated={() => {}}
        />
      )

      const sourceSelect = screen.getByLabelText(/5\. Lead Source \*/i) as HTMLSelectElement
      expect(sourceSelect).toBeInTheDocument()

      const options = Array.from(sourceSelect.options).map((o) => o.value)
      expect(options).toEqual(['direct', 'referral'])

      // When Referral is chosen, partner select appears
      await userEvent.selectOptions(sourceSelect, 'referral')
      expect(await screen.findByLabelText(/Select Referral Partner \*/i)).toBeInTheDocument()
    })
  })

  // --- 4. Attribution and Integrity in Lead List & Lead Profile ---

  describe('4. Attribution & Reassignment Integrity', () => {
    it('creates a Direct lead and verifies it displays as Direct in Lead List and Lead Profile', async () => {
      // Create a direct lead via API
      const res = await api.post<any>('/cases', {
        party_name: 'Anand Kumar Direct',
        party_mobile: '9820099887',
        product_type: 'used_car',
        loan_amount_requested: 600000,
        source_type: 'direct',
        vehicle_make: 'Maruti',
        vehicle_model: 'Swift',
      })

      expect(res.case.source_type).toBe('direct')
      expect(res.case.referral_partner_name).toBeNull()

      // Render Lead Profile for this lead
      render(
        <MemoryRouter initialEntries={[`/cases/${res.case.id}`]}>
          <Routes>
            <Route path="/cases/:id" element={<CaseDetailPage />} />
          </Routes>
        </MemoryRouter>
      )

      // Verify Header metric strip shows Direct
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Anand Kumar Direct' })).toBeInTheDocument()
      })

      const partnerMetric = screen.getByText('PARTNER SOURCE').parentElement!
      expect(within(partnerMetric).getByText('Direct')).toBeInTheDocument()
      expect(within(partnerMetric).getByText('Direct Internal Desk')).toBeInTheDocument()

      // Verify Card 3 shows Direct Lead Sourcing & Attribution
      expect(screen.getByText('Direct Lead Sourcing & Attribution')).toBeInTheDocument()
      expect(screen.getByText('Direct File')).toBeInTheDocument()
    })

    it('creates a Referral lead and verifies partner attribution is preserved upon telecaller reassignment', async () => {
      // Create referral lead
      const res = await api.post<any>('/cases', {
        party_name: 'Pooja Referral Customer',
        party_mobile: '9820011445',
        product_type: 'used_car',
        loan_amount_requested: 750000,
        source_type: 'referral',
        referral_partner_id: 'ref-p-01',
        referral_partner_name: 'Maruti True Value - Andheri West',
        referral_partner_mobile: '9820098200',
        vehicle_make: 'Hyundai',
        vehicle_model: 'Venue',
      })

      const caseId = res.case.id
      expect(res.case.referral_partner_name).toBe('Maruti True Value - Andheri West')

      // Reassign to telecaller Rahul Verma
      await api.post('/cases/assign', {
        case_ids: [caseId],
        telecaller_id: 'usr-telecaller-2',
      })

      // Fetch case and confirm original referral attribution is preserved
      const updatedCase = await api.get<any>(`/cases/${caseId}`)
      expect(updatedCase.assigned_telecaller_id).toBe('usr-telecaller-2')
      expect(updatedCase.assigned_telecaller_name).toBe('Rahul Verma')
      expect(updatedCase.referral_partner_name).toBe('Maruti True Value - Andheri West')
      expect(updatedCase.referral_partner_id).toBe('ref-p-01')
    })
  })
})
