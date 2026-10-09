/**
 * Frontend Unit Tests — Lenders & Workflow Components
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SLAIndicator } from '../features/workflow/SLAIndicator'
import { ApplicationComparisonModal } from '../features/lenders/ApplicationComparisonModal'
import { DisbursalModal } from '../features/lenders/DisbursalModal'
import type { LenderApplication } from '../features/lenders/types'

describe('SLAIndicator Component', () => {
  it('renders healthy stage SLA duration', () => {
    render(
      <SLAIndicator
        sla={{
          ageing_hours: 14.5,
          benchmark_sla_hours: 24,
          is_stuck: false,
          stuck_hours: 0,
        }}
      />
    )
    expect(screen.getByText('15h in stage')).toBeInTheDocument()
    expect(screen.getByText(/Benchmark SLA: 1d/i)).toBeInTheDocument()
  })

  it('renders stuck alert when ageing exceeds benchmark SLA', () => {
    render(
      <SLAIndicator
        sla={{
          ageing_hours: 36,
          benchmark_sla_hours: 24,
          is_stuck: true,
          stuck_hours: 12,
        }}
      />
    )
    expect(screen.getByText('STUCK (+12h)')).toBeInTheDocument()
  })

  it('renders compact pill for pipeline table rows', () => {
    render(
      <SLAIndicator
        compact
        sla={{
          ageing_hours: 48,
          benchmark_sla_hours: 24,
          is_stuck: true,
          stuck_hours: 24,
        }}
      />
    )
    expect(screen.getByText('⚠ Stuck +1d')).toBeInTheDocument()
  })
})

describe('ApplicationComparisonModal (FR-LAP-003)', () => {
  const mockApps: LenderApplication[] = [
    {
      id: 'app-1',
      org_id: 'org-1',
      case_id: 'case-1',
      lender_id: 'len-1',
      lender_name: 'HDFC Bank',
      product: 'used_car',
      login_ref: 'HDFC-991',
      login_date: '2026-03-01',
      status: 'sanctioned',
      query_notes: null,
      sanction_amount: 450000,
      sanction_tenure_months: 60,
      sanction_rate: 9.75,
      sanction_margin_money: 50000,
      sanction_date: '2026-03-02',
      rejection_reason_code: null,
      rejection_notes: null,
      disbursal_date: null,
      disbursal_amount: null,
      disbursal_ref: null,
      disbursal_override_reason: null,
      is_winning: true,
      version: 1,
      created_at: '2026-03-01T10:00:00Z',
      updated_at: '2026-03-02T10:00:00Z',
    },
    {
      id: 'app-2',
      org_id: 'org-1',
      case_id: 'case-1',
      lender_id: 'len-2',
      lender_name: 'ICICI Bank',
      product: 'used_car',
      login_ref: 'ICICI-882',
      login_date: '2026-03-01',
      status: 'sanctioned',
      query_notes: null,
      sanction_amount: 425000,
      sanction_tenure_months: 48,
      sanction_rate: 10.25,
      sanction_margin_money: 75000,
      sanction_date: '2026-03-02',
      rejection_reason_code: null,
      rejection_notes: null,
      disbursal_date: null,
      disbursal_amount: null,
      disbursal_ref: null,
      disbursal_override_reason: null,
      is_winning: false,
      version: 1,
      created_at: '2026-03-01T10:00:00Z',
      updated_at: '2026-03-02T10:00:00Z',
    },
  ]

  it('renders comparison table with multiple lenders and winning highlight', () => {
    render(
      <ApplicationComparisonModal
        applications={mockApps}
        isOpen={true}
        onClose={vi.fn()}
      />
    )

    expect(screen.getByText('HDFC Bank')).toBeInTheDocument()
    expect(screen.getByText('ICICI Bank')).toBeInTheDocument()
    expect(screen.getByText('₹4,50,000')).toBeInTheDocument()
    expect(screen.getByText('₹4,25,000')).toBeInTheDocument()
    expect(screen.getByText('9.75%')).toBeInTheDocument()
    expect(screen.getByText('10.25%')).toBeInTheDocument()
    expect(screen.getByText('★ WINNING')).toBeInTheDocument()
  })
})

describe('DisbursalModal BR-08 Override Handling', () => {
  const mockApp: LenderApplication = {
    id: 'app-1',
    org_id: 'org-1',
    case_id: 'case-1',
    lender_id: 'len-1',
    lender_name: 'Kotak Mahindra Bank',
    product: 'used_car',
    login_ref: 'KOTAK-100',
    login_date: '2026-03-01',
    status: 'sanctioned',
    query_notes: null,
    sanction_amount: 400000,
    sanction_tenure_months: 60,
    sanction_rate: 9.99,
    sanction_margin_money: null,
    sanction_date: '2026-03-02',
    rejection_reason_code: null,
    rejection_notes: null,
    disbursal_date: null,
    disbursal_amount: null,
    disbursal_ref: null,
    disbursal_override_reason: null,
    is_winning: true,
    version: 1,
    created_at: '2026-03-01T10:00:00Z',
    updated_at: '2026-03-02T10:00:00Z',
  }

  it('shows BR-08 override reason field when disbursal exceeds sanction amount', () => {
    render(
      <DisbursalModal
        application={mockApp}
        isOpen={true}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    )

    const amountInput = screen.getByLabelText(/Disbursed Amount/i)
    // Initially amount is 400000 (equal to sanction)
    expect(screen.queryByText(/BR-08/i)).not.toBeInTheDocument()

    // Enter disbursal amount > sanction (e.g. 450000)
    fireEvent.change(amountInput, { target: { value: '450000' } })

    // Override alert and reason field must appear
    expect(screen.getByText(/exceeds sanction/i)).toBeInTheDocument()
    expect(screen.getByText(/Manager \/ Underwriter Override Reason/i)).toBeInTheDocument()
  })
})
