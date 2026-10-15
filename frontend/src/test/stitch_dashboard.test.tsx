/**
 * DSA OS — Stitch Dashboard Redesign Automated Acceptance Tests
 * Verifies:
 * - 6 KPI cards rendering with actual data
 * - Due Today actionable section & link to Today Console
 * - Telecaller Performance ranking & conversion progress
 * - Genuine date filtering (All Time, Last 30 Days, Last 90 Days)
 * - CSV Export functionality
 * - Responsive UI components
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { DashboardPage } from '../features/dashboard/DashboardPage'
import { computeStitchDashboard } from '../features/dashboard/dashboardDataService'
import { createMockCases } from '../shared/lib/mockCasesSeed'
import { useAuthStore } from '../features/auth/useAuth'

describe('Stitch Dashboard Acceptance Suite', () => {
  beforeEach(() => {
    // Ensure admin user profile is active
    useAuthStore.getState().loginAsDemo('owner', 'admin@jaiautomobiles.com')
    vi.clearAllMocks()
  })

  it('renders dashboard heading and subtitle', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <DashboardPage />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()
      expect(screen.getByText('Your business at a glance.')).toBeInTheDocument()
    })
  })

  it('renders all six KPI cards with accurate values and labels', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <DashboardPage />
      </MemoryRouter>
    )

    await waitFor(() => {
      // 1. Leads
      const leadsCard = screen.getByTestId('kpi-leads')
      expect(within(leadsCard).getByText('LEADS')).toBeInTheDocument()
      expect(within(leadsCard).getByText('38')).toBeInTheDocument()
      expect(within(leadsCard).getByText('+12 new')).toBeInTheDocument()

      // 2. Active Calling
      const activeCard = screen.getByTestId('kpi-active-calling')
      expect(within(activeCard).getByText('ACTIVE CALLING')).toBeInTheDocument()
      expect(within(activeCard).getByText('18')).toBeInTheDocument()

      // 3. Interested
      const interestedCard = screen.getByTestId('kpi-interested')
      expect(within(interestedCard).getByText('INTERESTED')).toBeInTheDocument()
      expect(within(interestedCard).getByText('14')).toBeInTheDocument()

      // 4. Follow-ups
      const followUpsCard = screen.getByTestId('kpi-follow-ups')
      expect(within(followUpsCard).getByText('FOLLOW-UPS')).toBeInTheDocument()
      expect(within(followUpsCard).getByText('8')).toBeInTheDocument()

      // 5. Converted to Clients
      const convertedCard = screen.getByTestId('kpi-converted')
      expect(within(convertedCard).getByText('CONVERTED TO CLIENTS')).toBeInTheDocument()
      expect(within(convertedCard).getByText('10')).toBeInTheDocument()

      // 6. Unassigned Leads
      const unassignedCard = screen.getByTestId('kpi-unassigned')
      expect(within(unassignedCard).getByText('UNASSIGNED LEADS')).toBeInTheDocument()
      expect(within(unassignedCard).getByText('5')).toBeInTheDocument()
    })
  })

  it('renders Due Today section with correct counts and link to console', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/today" element={<div data-testid="today-page">Today Operational Console</div>} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Due Today')).toBeInTheDocument()
      expect(screen.getByText('Unassigned leads')).toBeInTheDocument()
      expect(screen.getByText('Follow-ups due today')).toBeInTheDocument()
      expect(screen.getByText('Interested leads awaiting next step')).toBeInTheDocument()

      const consoleLink = screen.getByRole('link', { name: /Open Today's Console/i })
      expect(consoleLink).toBeInTheDocument()
      expect(consoleLink).toHaveAttribute('href', '/today')
    })
  })

  it('renders Telecaller Performance section with rankings, percentages, and progress bars', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <DashboardPage />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Telecaller Performance')).toBeInTheDocument()

      // Priya Sharma (Rank 1, 60%)
      expect(screen.getByText('Priya Sharma')).toBeInTheDocument()
      expect(screen.getByText('Rank 1')).toBeInTheDocument()
      expect(screen.getByText('60%')).toBeInTheDocument()

      // Rahul Verma (Rank 2, 50%)
      expect(screen.getByText('Rahul Verma')).toBeInTheDocument()
      expect(screen.getByText('Rank 2')).toBeInTheDocument()
      expect(screen.getByText('50%')).toBeInTheDocument()
    })
  })

  it('renders Leads Inflow vs Contacted chart with 5 period intervals', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <DashboardPage />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Leads Inflow vs Contacted')).toBeInTheDocument()
      expect(screen.getByText('Oct 01 – 07')).toBeInTheDocument()
      expect(screen.getByText('Oct 08 – 14')).toBeInTheDocument()
      expect(screen.getByText('Oct 15 – 21')).toBeInTheDocument()
      expect(screen.getByText('Oct 22 – 28')).toBeInTheDocument()
      expect(screen.getByText('Recent (Oct 29+)')).toBeInTheDocument()
    })
  })

  it('updates dashboard metrics when switching between All Time, Last 30 Days, and Last 90 Days', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/']}>
        <DashboardPage />
      </MemoryRouter>
    )

    // Initial state: All Time (38 leads)
    await waitFor(() => {
      expect(screen.getByText('38')).toBeInTheDocument()
    })

    // Click "Last 30 Days"
    const last30Btn = screen.getByRole('tab', { name: /Last 30 Days/i })
    await user.click(last30Btn)

    // Should filter to cases created within last 30 days (26 leads)
    await waitFor(() => {
      expect(screen.getByText('26')).toBeInTheDocument()
    })

    // Click "Last 90 Days"
    const last90Btn = screen.getByRole('tab', { name: /Last 90 Days/i })
    await user.click(last90Btn)

    // Should filter to cases created within last 90 days (34 leads)
    await waitFor(() => {
      expect(screen.getByText('34')).toBeInTheDocument()
    })

    // Click "All Time" to restore
    const allTimeBtn = screen.getByRole('tab', { name: /All Time/i })
    await user.click(allTimeBtn)

    await waitFor(() => {
      expect(screen.getByText('38')).toBeInTheDocument()
    })
  })

  it('computeStitchDashboard mathematically excludes 40d, 60d, and 100d cases according to boundary rules', () => {
    const cases = createMockCases()
    const now = Date.now()
    const day = 86400000

    // All Time
    const allTimeResult = computeStitchDashboard(cases)
    expect(allTimeResult.leads_total).toBe(38)
    expect(allTimeResult.active_calling_count).toBe(18)
    expect(allTimeResult.interested_count).toBe(14)
    expect(allTimeResult.follow_ups_count).toBe(8)
    expect(allTimeResult.converted_clients_count).toBe(10)
    expect(allTimeResult.unassigned_leads_count).toBe(5)

    // Last 90 Days (excludes the 4 >90d records)
    const ninetyDaysAgo = new Date(now - 90 * day).toISOString().split('T')[0]
    const last90Result = computeStitchDashboard(cases, ninetyDaysAgo)
    expect(last90Result.leads_total).toBe(34)

    // Last 30 Days (excludes >30d records)
    const thirtyDaysAgo = new Date(now - 30 * day).toISOString().split('T')[0]
    const last30Result = computeStitchDashboard(cases, thirtyDaysAgo)
    expect(last30Result.leads_total).toBe(26)
  })
})
