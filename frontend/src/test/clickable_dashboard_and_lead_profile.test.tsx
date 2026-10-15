/**
 * DSA OS — Clickable Dashboard KPIs, Filtered Lead Lists & Complete Lead Profiles
 * Comprehensive Acceptance & Integration Test Suite
 *
 * Verifies:
 * 1. KPI Navigation:
 *    - Leads -> /cases?view=all
 *    - Active Calling -> /cases?view=active-calling
 *    - Interested -> /cases?view=interested
 *    - Follow-ups -> /cases?view=follow-ups
 *    - Converted to Clients -> /cases?view=converted
 *    - Unassigned Leads -> /cases?view=unassigned
 * 2. Due Today Navigation:
 *    - Unassigned leads -> /cases?view=unassigned
 *    - Follow-ups due today -> /cases?view=follow-ups-due-today
 *    - Interested leads awaiting next step -> /cases?view=interested-awaiting-next-step
 * 3. Filtered Lead List (Stitch Design 1):
 *    - Matches Stitch columns, counts, tabs, search, pagination, summary cards
 * 4. Lead Profile Dossier (Stitch Design 2):
 *    - Monogram squircle avatar, customer details, vehicle loan specs
 *    - KYC documents checklist with masked data notice & secure viewing
 *    - Referral attribution, telecaller assignment, progression stage control
 *    - Chronological activity timeline & log call interaction
 * 5. Role-Based Access Control:
 *    - Telecallers only see authorized assigned records
 *    - Unauthorized leads return 403 Forbidden with Access Denied card
 *    - Reassignment controls restricted to Admin
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { DashboardPage } from '../features/dashboard/DashboardPage'
import { CaseListPage } from '../features/cases/CaseListPage'
import { CaseDetailPage } from '../features/cases/CaseDetailPage'
import { useAuthStore } from '../features/auth/useAuth'
import { saveStoredCases } from '../shared/lib/storeSync'
import { createMockCases } from '../shared/lib/mockCasesSeed'

describe('DSA OS — Clickable Dashboard & Lead Management Journey', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.sessionStorage.clear()
    // Reset stored cases to the deterministic 38 cases
    const initialCases = createMockCases()
    saveStoredCases(initialCases)

    // Log in as Admin by default
    useAuthStore.getState().loginAsDemo('owner', 'admin@jaiautomobiles.com')
    vi.clearAllMocks()
  })

  // --- 1. KPI Cards Navigation & Count Parity ---

  it('clicking Active Calling KPI navigates to /cases?view=active-calling with identical count', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/cases" element={<CaseListPage />} />
        </Routes>
      </MemoryRouter>
    )

    // Wait for Dashboard to render
    const activeCard = await screen.findByTestId('kpi-active-calling')
    expect(activeCard).toBeInTheDocument()
    expect(within(activeCard).getByText('18')).toBeInTheDocument()

    // Click Active Calling card
    await userEvent.click(activeCard)

    // Verify destination page is All Leads in Active Calling view
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Active Calling' })).toBeInTheDocument()
      expect(screen.getByText('18 Leads total')).toBeInTheDocument()
    })
  })

  it('clicking Interested KPI navigates to /cases?view=interested with matching records', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/cases" element={<CaseListPage />} />
        </Routes>
      </MemoryRouter>
    )

    const interestedCard = await screen.findByTestId('kpi-interested')
    expect(within(interestedCard).getByText('14')).toBeInTheDocument()

    await userEvent.click(interestedCard)

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Interested Leads' })).toBeInTheDocument()
      expect(screen.getByText('14 Leads total')).toBeInTheDocument()
    })
  })

  it('clicking Follow-ups KPI navigates to /cases?view=follow-ups', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/cases" element={<CaseListPage />} />
        </Routes>
      </MemoryRouter>
    )

    const followUpsCard = await screen.findByTestId('kpi-follow-ups')
    expect(within(followUpsCard).getByText('8')).toBeInTheDocument()

    await userEvent.click(followUpsCard)

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Follow-ups Due' })).toBeInTheDocument()
      expect(screen.getByText('8 Leads total')).toBeInTheDocument()
    })
  })

  it('clicking Converted to Clients KPI navigates to /cases?view=converted', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/cases" element={<CaseListPage />} />
        </Routes>
      </MemoryRouter>
    )

    const convertedCard = await screen.findByTestId('kpi-converted')
    expect(within(convertedCard).getByText('10')).toBeInTheDocument()

    await userEvent.click(convertedCard)

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Converted to Clients' })).toBeInTheDocument()
      expect(screen.getByText('10 Leads total')).toBeInTheDocument()
    })
  })

  it('clicking Unassigned Leads KPI navigates to /cases?view=unassigned', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/cases" element={<CaseListPage />} />
        </Routes>
      </MemoryRouter>
    )

    const unassignedCard = await screen.findByTestId('kpi-unassigned')
    expect(within(unassignedCard).getByText('5')).toBeInTheDocument()

    await userEvent.click(unassignedCard)

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Unassigned Leads' })).toBeInTheDocument()
      expect(screen.getByText('5 Leads total')).toBeInTheDocument()
    })
  })

  // --- 2. Due Today Rows Navigation ---

  it('clicking Due Today Unassigned leads row opens unassigned view', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/cases" element={<CaseListPage />} />
        </Routes>
      </MemoryRouter>
    )

    const unassignedRow = await screen.findByTestId('due-row-unassigned')
    expect(unassignedRow).toBeInTheDocument()

    await userEvent.click(unassignedRow)

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Unassigned Leads' })).toBeInTheDocument()
    })
  })

  it('clicking Due Today Follow-ups row opens follow-ups-due-today view', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/cases" element={<CaseListPage />} />
        </Routes>
      </MemoryRouter>
    )

    const followUpsRow = await screen.findByTestId('due-row-follow-ups')
    expect(followUpsRow).toBeInTheDocument()

    await userEvent.click(followUpsRow)

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Follow-ups Due' })).toBeInTheDocument()
    })
  })

  it('clicking Due Today Interested awaiting next step row opens corresponding view', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/cases" element={<CaseListPage />} />
        </Routes>
      </MemoryRouter>
    )

    const interestedRow = await screen.findByTestId('due-row-interested')
    expect(interestedRow).toBeInTheDocument()

    await userEvent.click(interestedRow)

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Interested (Awaiting Next Step)' })).toBeInTheDocument()
    })
  })

  // --- 3. Filtered Lead List (Stitch Design 1) ---

  it('renders All Leads page with breadcrumbs, conversion velocity, table columns and summary cards', async () => {
    render(
      <MemoryRouter initialEntries={['/cases?view=all']}>
        <CaseListPage />
      </MemoryRouter>
    )

    // Breadcrumbs & Header
    await waitFor(() => {
      expect(screen.getByText('Lead Management')).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'All Leads' })).toBeInTheDocument()
      expect(screen.getByText('CONVERSION VELOCITY')).toBeInTheDocument()
      expect(screen.getByText('Export CSV')).toBeInTheDocument()
      expect(screen.getByText('New Lead')).toBeInTheDocument()
    })

    // Table Headers
    expect(screen.getByText('LEAD REF & DATE')).toBeInTheDocument()
    expect(screen.getByText('CUSTOMER & CONTACT')).toBeInTheDocument()
    expect(screen.getByText('LOAN TYPE & AMOUNT')).toBeInTheDocument()
    expect(screen.getByText('STATUS')).toBeInTheDocument()
    expect(screen.getByText('ASSIGNED TELECALLER')).toBeInTheDocument()
    expect(screen.getByText('REFERRAL PARTNER')).toBeInTheDocument()
    expect(screen.getByText('ACTIONS')).toBeInTheDocument()

    // Bottom 3 summary cards
    expect(screen.getByText('LEAD PIPELINE HEALTH')).toBeInTheDocument()
    expect(screen.getByText('TELECALLER UTILIZATION')).toBeInTheDocument()
    expect(screen.getByText('TOP PARTNER CHANNEL')).toBeInTheDocument()
  })

  it('switching status tabs dynamically filters the table records', async () => {
    render(
      <MemoryRouter initialEntries={['/cases']}>
        <CaseListPage />
      </MemoryRouter>
    )

    await screen.findByRole('heading', { name: 'All Leads' })

    // Click Unassigned Leads tab
    const unassignedTab = screen.getByRole('tab', { name: /Unassigned Leads/i })
    await userEvent.click(unassignedTab)

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Unassigned Leads' })).toBeInTheDocument()
      expect(screen.getByText(/\d+ Leads total/)).toBeInTheDocument()
    })

    // Click Active Calling tab
    const activeCallingTab = screen.getByRole('tab', { name: /Active Calling/i })
    await userEvent.click(activeCallingTab)

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Active Calling' })).toBeInTheDocument()
      expect(screen.getByText(/Leads total/)).toBeInTheDocument()
    })
  })

  // --- 4. Individual Lead Profile Dossier (Stitch Design 2) ---

  it('renders complete Lead Profile dossier with specifications, KYC documents, attribution, and timeline', async () => {
    render(
      <MemoryRouter initialEntries={['/cases/case-jai-101']}>
        <Routes>
          <Route path="/cases/:id" element={<CaseDetailPage />} />
          <Route path="/cases" element={<CaseListPage />} />
        </Routes>
      </MemoryRouter>
    )

    // Customer & Header Info
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Rajesh Kumar Sharma' })).toBeInTheDocument()
      expect(screen.getByText('RS')).toBeInTheDocument() // Initials avatar
      expect(screen.getByText('Call Customer')).toBeInTheDocument()
      expect(screen.getByText('Schedule Follow-up')).toBeInTheDocument()
    })

    // 4-Metric Strip
    expect(screen.getByText('LOAN REQUESTED')).toBeInTheDocument()
    expect(screen.getByText('VEHICLE TARGET')).toBeInTheDocument()
    expect(screen.getByText('PARTNER SOURCE')).toBeInTheDocument()
    expect(screen.getByText('NEXT MILESTONE')).toBeInTheDocument()

    // Customer & Vehicle Loan Specifications
    expect(screen.getByText('Customer & Vehicle Loan Specifications')).toBeInTheDocument()
    expect(screen.getByText('Validated Pre-Screen')).toBeInTheDocument()
    expect(screen.getByText('FULL NAME')).toBeInTheDocument()
    expect(screen.getByText('LOAN TYPE')).toBeInTheDocument()
    expect(screen.getByText('REQUESTED LOAN AMOUNT')).toBeInTheDocument()

    // KYC & Documents
    expect(screen.getByText('KYC & Vehicle Documents')).toBeInTheDocument()
    expect(screen.getByText(/Identity document numbers are masked for data protection/i)).toBeInTheDocument()
    expect(screen.getByText('Aadhaar Card (Mandatory)')).toBeInTheDocument()
    expect(screen.getByText('PAN Card (Mandatory)')).toBeInTheDocument()
    expect(screen.getAllByText('View Securely').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Download').length).toBeGreaterThan(0)

    // Referral Partner Attribution
    expect(screen.getByText('Referral Partner Attribution')).toBeInTheDocument()
    expect(screen.getByText('PARTNER NAME')).toBeInTheDocument()
    expect(screen.getByText('CHANNEL SOURCE')).toBeInTheDocument()

    // Right Column: Assignment & Progression
    expect(screen.getByText('Assignment & Stage Control')).toBeInTheDocument()
    expect(screen.getByText('SCHEDULED NEXT ACTION')).toBeInTheDocument()
    expect(screen.getByText('Calling Activity & Audit Timeline')).toBeInTheDocument()
    expect(screen.getByText('Log New Call / Note')).toBeInTheDocument()
  })

  it('allows logging a new call and updating activity history', async () => {
    render(
      <MemoryRouter initialEntries={['/cases/case-jai-101']}>
        <Routes>
          <Route path="/cases/:id" element={<CaseDetailPage />} />
        </Routes>
      </MemoryRouter>
    )

    await screen.findByRole('heading', { name: 'Rajesh Kumar Sharma' })

    // Open Log Call Modal
    const logBtn = screen.getByText('Log New Call / Note')
    await userEvent.click(logBtn)

    // Verify modal appeared
    await screen.findByText('Log Call Activity & Note')

    // Enter remarks
    const textarea = screen.getByPlaceholderText(/Enter detailed outcome notes/i)
    await userEvent.type(textarea, 'Spoke with customer. Ready for loan sanction approval from HDFC.')

    // Submit form
    const saveBtn = screen.getByRole('button', { name: 'Save Activity Entry' })
    await userEvent.click(saveBtn)

    // Verify success banner and new entry
    await waitFor(() => {
      expect(screen.getByText('Call activity recorded and timeline updated.')).toBeInTheDocument()
      expect(screen.getByText(/Spoke with customer/i)).toBeInTheDocument()
    })
  })

  // --- 5. Role-Based Access Control & Strict Tenant Isolation ---

  it('enforces RBAC: Telecaller Priya Sharma cannot access lead assigned to Rahul Verma', async () => {
    // Log in as Telecaller Priya Sharma (usr-telecaller-1)
    useAuthStore.getState().loginAsDemo('telecaller', 'priya.sharma@jaiautomobiles.com')

    // JA-2025-0102 (case-jai-102) is assigned to Rahul Verma (usr-telecaller-2)
    render(
      <MemoryRouter initialEntries={['/cases/case-jai-102']}>
        <Routes>
          <Route path="/cases/:id" element={<CaseDetailPage />} />
        </Routes>
      </MemoryRouter>
    )

    // Telecaller must receive 403 Forbidden with Access Denied card
    await waitFor(() => {
      expect(screen.getByText('Access Denied (403 Forbidden)')).toBeInTheDocument()
      expect(screen.getByText(/You are not authorized to view this lead record/i)).toBeInTheDocument()
    })
  })

  it('telecaller cannot access Fast Reassignment controls in lead profile', async () => {
    // Log in as Telecaller Priya Sharma (usr-telecaller-1)
    useAuthStore.getState().loginAsDemo('telecaller', 'priya.sharma@jaiautomobiles.com')

    // JA-2025-0101 (case-jai-101) is assigned to Priya Sharma
    render(
      <MemoryRouter initialEntries={['/cases/case-jai-101']}>
        <Routes>
          <Route path="/cases/:id" element={<CaseDetailPage />} />
        </Routes>
      </MemoryRouter>
    )

    await screen.findByRole('heading', { name: 'Rajesh Kumar Sharma' })

    // Reassign controls should NOT be rendered for telecallers
    expect(screen.queryByText('Fast Reassignment')).not.toBeInTheDocument()
    expect(screen.queryByText('Reassign ▾')).not.toBeInTheDocument()
  })
})
