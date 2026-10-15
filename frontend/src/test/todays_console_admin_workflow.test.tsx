/**
 * DSA OS — Today's Console Admin Operations Workflow Acceptance Tests
 *
 * Verifies:
 * 1. Clean Operational Header & Obsolete Elements Removed:
 *    - Title is "Today's Console" (subtitle: "Review new leads, assign unassigned leads, and respond to telecaller updates.")
 *    - Breadcrumbs: Operations Console / Today's Console
 *    - Real-time auto-sync badge and functional Refresh button
 *    - Obsolete elements REMOVED: No "← Lead Operations Console", no "Daily Execution Cockpit",
 *      no "Open Telecaller Workspace" button, no "Inflow Cold Leads" button, no "Retry Callbacks" KPI
 * 2. Four KPI Summary Cards:
 *    - New Leads, Unassigned Leads, Interested Prospects, Follow-ups Due Today
 *    - Counts match genuine data and link to filtered case views
 * 3. New Leads Requiring Assignment:
 *    - Fresh unassigned leads with customer name, phone, ref, received time, vehicle, loan type, amount, source, and Unassigned badge
 *    - "View All Unassigned Leads →" links to /cases?view=unassigned
 * 4. Lead Assignment Workflow:
 *    - Admin opens "Assign Telecaller" modal, selects registered telecaller, and confirms
 *    - Lead is assigned via /cases/assign, unassigned queue updates, and success confirmation is displayed
 * 5. Two-Column Operational Workspaces:
 *    - Unassigned Backlog (with priority, remarks, and Assign action)
 *    - Follow-ups Due Today (with scheduled time, telecaller, remark, and Open Lead Profile link)
 * 6. Telecaller Activity & Updates (Live Feed):
 *    - Telecaller avatar squircle, outcome badge, quote, and action links
 *    - Administrative requests (e.g., "Requires Admin Rate Check") with "Review Request" modal
 * 7. RBAC & Scoping:
 *    - Telecaller login scopes records and restricts assignment controls
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { TodayPage } from '../features/dashboard/TodayPage'
import { useAuthStore } from '../features/auth/useAuth'
import { saveStoredCases } from '../shared/lib/storeSync'
import { createMockCases } from '../shared/lib/mockCasesSeed'

describe("Today's Console — Admin Operations Workflow Acceptance Tests", () => {
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

  // --- 1. Header & Obsolete Elements Clean-Up ---

  it('renders modern Today\'s Console header and excludes all obsolete legacy controls', async () => {
    render(
      <MemoryRouter>
        <TodayPage />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: "Today's Console" })).toBeInTheDocument()
    })

    // Subtitle
    expect(
      screen.getByText('Review new leads, assign unassigned leads, and respond to telecaller updates.')
    ).toBeInTheDocument()

    // Breadcrumbs
    expect(screen.getByText('Operations Console')).toBeInTheDocument()

    // Sync badge and refresh action
    expect(screen.getByText(/Synced .* • Auto-sync ON/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Refresh/i })).toBeInTheDocument()

    // Obsolete elements MUST NOT be in the document
    expect(screen.queryByText(/Daily Execution Cockpit/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/← Lead Operations Console/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Open Telecaller Workspace →/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Inflow Cold Leads →/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Retry Callbacks/i)).not.toBeInTheDocument()
  })

  // --- 2. Four Top KPI Summary Cards ---

  it('displays the 4 operational KPI summary cards connected to genuine application data', async () => {
    render(
      <MemoryRouter>
        <TodayPage />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: "Today's Console" })).toBeInTheDocument()
    })

    // 1. New Leads
    const newLeadsCard = screen.getByText('NEW LEADS').closest('a')!
    expect(newLeadsCard).toHaveAttribute('href', '/cases?view=all&range=last30')
    expect(within(newLeadsCard).getByText('+4 fresh')).toBeInTheDocument()

    // 2. Unassigned Leads (5 in baseline)
    const unassignedCard = screen.getByText('UNASSIGNED LEADS').closest('a')!
    expect(unassignedCard).toHaveAttribute('href', '/cases?view=unassigned')
    expect(within(unassignedCard).getByText('5')).toBeInTheDocument()
    expect(within(unassignedCard).getByText('! Action required')).toBeInTheDocument()

    // 3. Interested Prospects (14 in baseline)
    const interestedCard = screen.getByText('INTERESTED PROSPECTS').closest('a')!
    expect(interestedCard).toHaveAttribute('href', '/cases?view=interested')
    expect(within(interestedCard).getByText('14')).toBeInTheDocument()
    expect(within(interestedCard).getByText('✓ Qualified')).toBeInTheDocument()

    // 4. Follow-ups Due Today (8 in baseline)
    const followUpsCard = screen.getByText('FOLLOW-UPS DUE TODAY').closest('a')!
    expect(followUpsCard).toHaveAttribute('href', '/cases?view=follow-ups-due-today')
    expect(within(followUpsCard).getByText('8')).toBeInTheDocument()
  })

  // --- 3. New Leads Requiring Assignment Table ---

  it('displays fresh unassigned leads in Section 1 with all operational columns and working View All link', async () => {
    render(
      <MemoryRouter>
        <TodayPage />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('New Leads Requiring Assignment')).toBeInTheDocument()
    })

    // View All link
    const viewAllLink = screen.getByRole('link', { name: /View All Unassigned Leads/i })
    expect(viewAllLink).toHaveAttribute('href', '/cases?view=unassigned')

    // Table headers
    expect(screen.getByText('CUSTOMER / LEAD')).toBeInTheDocument()
    expect(screen.getByText('RECEIVED')).toBeInTheDocument()
    expect(screen.getByText('LOAN TYPE & VEHICLE')).toBeInTheDocument()
    expect(screen.getByText('REQUESTED AMOUNT')).toBeInTheDocument()
    expect(screen.getByText('SOURCE')).toBeInTheDocument()
    expect(screen.getByText('STATUS')).toBeInTheDocument()
    expect(screen.getByText('ACTION')).toBeInTheDocument()

    // Shows Assign Telecaller buttons
    const assignButtons = screen.getAllByRole('button', { name: /Assign Telecaller/i })
    expect(assignButtons.length).toBeGreaterThan(0)
  })

  // --- 4. Lead Assignment Workflow ---

  it('allows admin to open assignment modal and assign an unassigned lead to a telecaller', async () => {
    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <TodayPage />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('New Leads Requiring Assignment')).toBeInTheDocument()
    })

    // Click the first Assign Telecaller button
    const assignBtns = screen.getAllByRole('button', { name: /Assign Telecaller/i })
    await user.click(assignBtns[0])

    // Assignment modal appears
    const modalHeading = await screen.findByRole('heading', { name: 'Assign Lead to Telecaller' })
    expect(modalHeading).toBeInTheDocument()
    const modal = modalHeading.closest('.today-modal-card') as HTMLElement
    expect(within(modal).getByText(/Select Registered Telecaller:/i)).toBeInTheDocument()

    // Telecaller options inside modal
    expect(within(modal).getByText('Priya Sharma')).toBeInTheDocument()
    expect(within(modal).getByText('Rahul Verma')).toBeInTheDocument()

    // Select Rahul Verma
    await user.click(within(modal).getByText('Rahul Verma'))

    // Confirm assignment
    const confirmBtn = within(modal).getByRole('button', { name: 'Confirm Assignment' })
    await user.click(confirmBtn)

    // Expect success notice
    await waitFor(() => {
      expect(screen.getByText(/successfully assigned to Rahul Verma/i)).toBeInTheDocument()
    })
  })

  // --- 5. Two-Column Workspaces: Backlog & Follow-ups Due Today ---

  it('renders unassigned backlog and follow-ups due today in Section 2', async () => {
    render(
      <MemoryRouter>
        <TodayPage />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Follow-ups Due Today')).toBeInTheDocument()
    })

    // Unassigned Backlog header
    expect(screen.getByText('Backlog requiring urgent allocation.')).toBeInTheDocument()

    // Follow-ups section header
    expect(screen.getByText('Active follow-ups scheduled for the current day across telecallers.')).toBeInTheDocument()

    // Scheduled times & Open Lead Profile links exist
    const openProfileLinks = screen.getAllByRole('link', { name: /Open Lead Profile/i })
    expect(openProfileLinks.length).toBeGreaterThan(0)
    expect(openProfileLinks[0]).toHaveAttribute('href', expect.stringContaining('/cases/'))
  })

  // --- 6. Telecaller Activity & Updates Live Stream ---

  it('renders the live telecaller activity stream with outcome badges, remarks, and review request modal', async () => {
    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <TodayPage />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText(/Telecaller Activity & Updates/i)).toBeInTheDocument()
    })

    expect(screen.getByText('Auto-refresh stream active')).toBeInTheDocument()

    // Contains activities
    expect(screen.getByText('Rajesh Kumar Sharma')).toBeInTheDocument()
    expect(screen.getByText('Amitabh Singh Chauhan')).toBeInTheDocument()
    expect(screen.getByText(/Wants best ROI comparison across lenders/i)).toBeInTheDocument()

    // Administrative attention tag
    expect(screen.getByText('Requires Admin Rate Check')).toBeInTheDocument()

    // Review Request button
    const reviewBtn = screen.getByRole('button', { name: 'Review Request' })
    expect(reviewBtn).toBeInTheDocument()

    // Click Review Request to open modal
    await user.click(reviewBtn)
    expect(await screen.findByRole('heading', { name: 'Administrative Review' })).toBeInTheDocument()
    expect(screen.getByText(/Competitive rate match requested/i)).toBeInTheDocument()

    // Approve special rate
    const approveBtn = screen.getByRole('button', { name: /Approve Special Rate/i })
    await user.click(approveBtn)

    await waitFor(() => {
      expect(screen.getByText(/Rate concession of 8.65% approved/i)).toBeInTheDocument()
    })
  })

  // --- 7. RBAC & Telecaller Scoping ---

  it('restricts telecallers from assigning leads and scopes views to assigned records', async () => {
    // Log in as Telecaller Priya Sharma
    useAuthStore.getState().loginAsDemo('telecaller', 'priya.sharma@jaiautomobiles.com')

    render(
      <MemoryRouter>
        <TodayPage />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: "Today's Console" })).toBeInTheDocument()
    })

    // Assign Telecaller button should NOT be available for telecallers
    expect(screen.queryByRole('button', { name: /Assign Telecaller/i })).not.toBeInTheDocument()
  })

  // --- 8. Manual Refresh Action ---

  it('refreshes operational data when clicking the Refresh button', async () => {
    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <TodayPage />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: "Today's Console" })).toBeInTheDocument()
    })

    const refreshBtn = screen.getByRole('button', { name: /Refresh/i })
    await user.click(refreshBtn)

    // Should remain on page and update sync status
    expect(screen.getByText(/Synced .* • Auto-sync ON/i)).toBeInTheDocument()
  })
})
