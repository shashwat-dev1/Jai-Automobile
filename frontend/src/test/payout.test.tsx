/**
 * Frontend Unit Tests — Payout & Commission Engine Components
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { SplitEditorModal } from '../features/payout/SplitEditorModal'
import { OverrideExpectationModal } from '../features/payout/OverrideExpectationModal'
import { PayoutSection } from '../features/payout/PayoutSection'
import type { PayoutExpectation } from '../features/payout/types'
import { api } from '../shared/lib/api'

vi.mock('../shared/lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  },
  ApiError: class extends Error {
    status?: number
    constructor(message: string, status?: number) {
      super(message)
      this.status = status
    }
  },
}))

describe('Payout Components Test Suite', () => {
  const mockExpectation: PayoutExpectation = {
    id: 'exp-101',
    org_id: 'org-1',
    case_id: 'case-1',
    case_no: 'LOS-2026-888',
    applicant_name: 'Amit Patel',
    lender_application_id: 'app-1',
    lender_name: 'HDFC Bank',
    product: 'used_car',
    rule_id: 'rule-1',
    rule_snapshot: {
      basis: 'percent',
      rate_percent: '1.750',
      gating_type: 'pdd_complete',
    },
    disbursal_amount: 1000000,
    gross_amount: 17500,
    tds_rate_percent: 5.0,
    tds_amount: 875,
    net_amount: 16625,
    status: 'held',
    gating_status: 'pending',
    is_override: false,
    override_reason: null,
    original_gross_amount: null,
    version: 1,
    splits: [
      {
        id: 'split-1',
        org_id: 'org-1',
        expectation_id: 'exp-101',
        beneficiary_type: 'source',
        source_id: 'src-1',
        source_name: 'Maruti TrueValue Dealer',
        user_id: null,
        user_name: null,
        share_type: 'percent',
        share_value: 60,
        split_amount: 10500,
        created_at: '2026-03-01T10:00:00Z',
        updated_at: '2026-03-01T10:00:00Z',
      },
      {
        id: 'split-2',
        org_id: 'org-1',
        expectation_id: 'exp-101',
        beneficiary_type: 'company',
        source_id: null,
        source_name: null,
        user_id: null,
        user_name: null,
        share_type: 'percent',
        share_value: 40,
        split_amount: 7000,
        created_at: '2026-03-01T10:00:00Z',
        updated_at: '2026-03-01T10:00:00Z',
      },
    ],
    created_at: '2026-03-01T10:00:00Z',
    updated_at: '2026-03-01T10:00:00Z',
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ---------------------------------------------------------------------------
  // 1. SplitEditorModal (BR-09)
  // ---------------------------------------------------------------------------
  describe('SplitEditorModal Component', () => {
    it('renders current splits and total percentage calculation', async () => {
      vi.mocked(api.get).mockResolvedValue([])

      render(
        <MemoryRouter>
          <SplitEditorModal expectation={mockExpectation} onClose={vi.fn()} onSaved={vi.fn()} />
        </MemoryRouter>
      )

      expect(screen.getByText('Commission Allocation & Splits (BR-09)')).toBeInTheDocument()
      expect(screen.getByText('100.0% / 100%')).toBeInTheDocument()
    })

    it('enforces BR-09: shows error and disables submit when splits exceed 100%', async () => {
      vi.mocked(api.get).mockResolvedValue([])

      render(
        <MemoryRouter>
          <SplitEditorModal expectation={mockExpectation} onClose={vi.fn()} onSaved={vi.fn()} />
        </MemoryRouter>
      )

      // Find the first percentage input and change it from 60 to 80 (total becomes 120%)
      const inputs = screen.getAllByRole('spinbutton')
      fireEvent.change(inputs[0], { target: { value: '80' } })

      expect(screen.getByText('120.0% / 100%')).toBeInTheDocument()
      expect(
        screen.getByText(/BR-09 Violation: Total allocated share .* cannot exceed 100%/i)
      ).toBeInTheDocument()

      const saveBtn = screen.getByRole('button', { name: /save splits/i })
      expect(saveBtn).toBeDisabled()
    })
  })

  // ---------------------------------------------------------------------------
  // 2. OverrideExpectationModal (FR-PAY-005)
  // ---------------------------------------------------------------------------
  describe('OverrideExpectationModal Component', () => {
    it('renders original gross and requires justification note', async () => {
      render(
        <MemoryRouter>
          <OverrideExpectationModal
            expectation={mockExpectation}
            onClose={vi.fn()}
            onOverridden={vi.fn()}
          />
        </MemoryRouter>
      )

      expect(screen.getByText('Override Expected Payout (FR-PAY-005)')).toBeInTheDocument()
      expect(screen.getByText('FINANCIAL AUDIT NOTICE:')).toBeInTheDocument()

      const submitBtn = screen.getByRole('button', { name: /confirm override/i })
      expect(submitBtn).toBeInTheDocument()
    })
  })

  // ---------------------------------------------------------------------------
  // 3. PayoutSection Component (Dossier Integration)
  // ---------------------------------------------------------------------------
  describe('PayoutSection Component', () => {
    it('renders financial breakdown, PDD gating notice, and splits summary', async () => {
      vi.mocked(api.get).mockResolvedValue([mockExpectation])

      render(
        <MemoryRouter>
          <PayoutSection caseId="case-1" />
        </MemoryRouter>
      )

      await waitFor(() => {
        expect(screen.getByText('Expected Lender Commission')).toBeInTheDocument()
      })

      // PDD Gating notice
      expect(screen.getByText(/PDD GATED \(BR-10\):/i)).toBeInTheDocument()

      // Financial numbers
      expect(screen.getByText('Gross Payout')).toBeInTheDocument()
      expect(screen.getByText('Net Receivable')).toBeInTheDocument()

      // Contract snapshot terms
      expect(screen.getByText(/Contract Terms \(BR-13\):/i)).toBeInTheDocument()

      // Splits
      expect(screen.getByText(/Maruti TrueValue Dealer/)).toBeInTheDocument()
    })

    it('renders Attention notice when status is no_rule', async () => {
      const noRuleExp: PayoutExpectation = {
        ...mockExpectation,
        status: 'no_rule',
        gating_status: 'pending',
        gross_amount: 0,
        net_amount: 0,
      }
      vi.mocked(api.get).mockResolvedValue([noRuleExp])

      render(
        <MemoryRouter>
          <PayoutSection caseId="case-1" />
        </MemoryRouter>
      )

      await waitFor(() => {
        expect(screen.getByText(/ATTENTION REQUIRED \(FR-PAY-003\):/i)).toBeInTheDocument()
      })
    })
  })
})
