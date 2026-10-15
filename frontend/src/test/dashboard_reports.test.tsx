import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { KPIStrip } from '../features/dashboard/KPIStrip'
import { StageVelocity } from '../features/dashboard/StageVelocity'
import { CommissionChart } from '../features/dashboard/CommissionChart'
import { SourceTable } from '../features/dashboard/SourceTable'
import { AttentionPanel } from '../features/dashboard/AttentionPanel'
import { DashboardPage } from '../features/dashboard/DashboardPage'
import { TodayPage } from '../features/dashboard/TodayPage'
import { formatINR } from '../features/dashboard/utils'
import { api } from '../shared/lib/api'
import type { TodayViewResponse } from '../features/dashboard/types'
import { computeStitchDashboard } from '../features/dashboard/dashboardDataService'
import { createMockCases } from '../shared/lib/mockCasesSeed'

vi.mock('../shared/lib/api', () => ({
  api: {
    get: vi.fn(),
  },
}))

describe('Dashboard & Reports Component Suite (Phase 08)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('formatINR formats currency with Indian Rupee grouping', () => {
    expect(formatINR('500000.00')).toContain('5,00,000')
    expect(formatINR('1250000.50')).toContain('12,50,001')
    expect(formatINR('0.00')).toContain('0')
  })

  it('KPIStrip renders core lead operations and telecalling metric cards', () => {
    const pipeline = {
      active_files_count: 14,
      total_loan_amount_requested: '8500000.00',
      new_inflow_count: 5,
      docs_pending_count: 3,
      logged_in_count: 4,
      sanctioned_count: 3,
      disbursed_count: 4,
      disbursed_volume: '3400000.00',
      closed_count: 2,
      rejected_count: 1,
    }
    const payout = {
      total_expected_net: '68000.00',
      total_received_net: '64600.00',
      realisation_rate_pct: '95.00',
      outstanding_net: '3400.00',
      variance_net: '-3400.00',
    }

    render(<KPIStrip pipeline={pipeline} payout={payout} />)

    expect(screen.getByText('Cold Leads Intake')).toBeInTheDocument()
    expect(screen.getByText('14')).toBeInTheDocument()
    expect(screen.getByText('5 new inflow')).toBeInTheDocument()

    expect(screen.getByText('Active Calling Queue')).toBeInTheDocument()
    expect(screen.getByText('Interested Prospects')).toBeInTheDocument()
    expect(screen.getByText('Converted to Clients')).toBeInTheDocument()
    expect(screen.getByText(/34,00,000/)).toBeInTheDocument()

    expect(screen.getByText('Referral Attribution')).toBeInTheDocument()
    expect(screen.getByText(/68,000/)).toBeInTheDocument()
    expect(screen.getByText(/95.00% realisation/)).toBeInTheDocument()
  })


  it('StageVelocity renders pipeline stages and highlights bottlenecks', () => {
    const stages = [
      {
        stage: 'lead',
        stage_label: 'Lead Inflow',
        count: 5,
        total_amount: '2500000.00',
        avg_ageing_hours: '12.4',
        is_bottleneck: false,
      },
      {
        stage: 'documents_pending',
        stage_label: 'Docs Pending',
        count: 8,
        total_amount: '4000000.00',
        avg_ageing_hours: '54.2',
        is_bottleneck: true,
      },
    ]

    render(<StageVelocity stages={stages} />)

    expect(screen.getByText('Lead Inflow')).toBeInTheDocument()
    expect(screen.getByText('Docs Pending')).toBeInTheDocument()
    expect(screen.getByText('STUCK')).toBeInTheDocument()
    expect(screen.getByText('54.2h avg')).toBeInTheDocument()
  })

  it('CommissionChart displays comparative expected and settled bars', () => {
    const data = [
      {
        month: '2026-09',
        expected_amount: '120000.00',
        settled_amount: '115000.00',
        case_count: 6,
      },
    ]

    render(<CommissionChart data={data} />)

    expect(screen.getByText('2026-09')).toBeInTheDocument()
    expect(screen.getByText(/Exp:/)).toBeInTheDocument()
    expect(screen.getByText(/1,20,000/)).toBeInTheDocument()
    expect(screen.getByText(/Set:/)).toBeInTheDocument()
    expect(screen.getByText(/1,15,000/)).toBeInTheDocument()
  })

  it('SourceTable renders top originators with conversion % and accrued payout', () => {
    const sources = [
      {
        source_id: 'src-1',
        source_name: 'Apex Cars Dealership',
        source_type: 'dealer',
        total_cases: 10,
        disbursed_cases: 6,
        conversion_rate_pct: '60.0',
        disbursed_volume: '4500000.00',
        accrued_payout: '90000.00',
      },
    ]

    render(
      <MemoryRouter>
        <SourceTable sources={sources} />
      </MemoryRouter>
    )

    expect(screen.getByText('Apex Cars Dealership')).toBeInTheDocument()
    expect(screen.getByText('dealer')).toBeInTheDocument()
    expect(screen.getByText('6 / 10')).toBeInTheDocument()
    expect(screen.getByText('60.0%')).toBeInTheDocument()
    expect(screen.getByText(/45,00,000/)).toBeInTheDocument()
    expect(screen.getByText(/90,000/)).toBeInTheDocument()
  })

  it('AttentionPanel displays urgent action items with counts and navigation links', () => {
    const attention = {
      stuck_cases_count: 2,
      urgent_tasks_count: 5,
      overdue_pdd_count: 1,
      discrepancy_payouts_count: 0,
      expiring_docs_count: 3,
    }

    render(
      <MemoryRouter>
        <AttentionPanel attention={attention} />
      </MemoryRouter>
    )

    expect(screen.getByText('Stuck Cases (> SLA)')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('Urgent Pending Tasks')).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.getByText('Expiring Documents')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('DashboardPage loads live data from api and renders complete console', async () => {
    const cases = createMockCases()
    const stitchOverview = computeStitchDashboard(cases)

    vi.mocked(api.get).mockResolvedValueOnce(stitchOverview)

    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()
      expect(screen.getByText('Your business at a glance.')).toBeInTheDocument()
      expect(screen.getByTestId('kpi-leads')).toBeInTheDocument()
    })
  })

  it('TodayPage loads daily operational checklist and displays tasks and stuck items', async () => {
    const mockToday: TodayViewResponse = {
      tasks_due_today: [
        {
          id: 't-1',
          title: 'Collect KYC from Ramesh',
          type: 'document_pickup',
          due_date: '2026-10-05T10:00:00Z',
          status: 'pending',
          case_no: 'CASE-771',
        },
      ],
      tasks_overdue: [],
      stuck_cases: [
        {
          case_id: 'c-88',
          case_no: 'CASE-882',
          stage: 'documents_pending',
          entered_stage_at: '2026-10-01T08:00:00Z',
          ageing_hours: '72.5',
          sla_hours: 48,
          owner_name: 'Amit Officer',
        },
      ],
      expiring_documents: [],
      pdd_items_due: [],
      counts: {
        due_today_count: 1,
        overdue_count: 0,
        stuck_cases_count: 1,
        expiring_docs_count: 0,
        pdd_due_count: 0,
      },
    }

    vi.mocked(api.get).mockResolvedValueOnce(mockToday)

    render(
      <MemoryRouter>
        <TodayPage />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: "Today's Console" })).toBeInTheDocument()
      expect(screen.getByText('Collect KYC from Ramesh')).toBeInTheDocument()
      expect(screen.getByText(/CASE-771/)).toBeInTheDocument()
    })
  })
})
