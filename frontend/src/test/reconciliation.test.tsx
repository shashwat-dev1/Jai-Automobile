import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { StatementImportWizard } from '../features/payout/StatementImportWizard'
import { UnmatchedQueue } from '../features/payout/UnmatchedQueue'
import { ManualMatchModal } from '../features/payout/ManualMatchModal'
import { ReconciliationPage } from '../features/payout/ReconciliationPage'
import { OutstandingReportPage } from '../features/payout/OutstandingReportPage'
import { api } from '../shared/lib/api'
import type { PayoutExpectation, PayoutReceipt } from '../features/payout/types'

vi.mock('../shared/lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}))

describe('Reconciliation Components Test Suite (Gate MONEY-01)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ---------------------------------------------------------------------------
  // 1. StatementImportWizard
  // ---------------------------------------------------------------------------
  describe('StatementImportWizard Component', () => {
    it('renders step 1 with lender selection and mapping fields', async () => {
      vi.mocked(api.get).mockImplementation(async (url: string) => {
        if (url.includes('/lenders')) {
          return [{ id: 'lender-1', name: 'HDFC Bank' }]
        }
        if (url.includes('/column-mappings/')) {
          return []
        }
        return []
      })

      render(
        <MemoryRouter>
          <StatementImportWizard onClose={vi.fn()} onImportComplete={vi.fn()} />
        </MemoryRouter>
      )

      expect(screen.getByText('Lender Statement Ingestion Wizard')).toBeInTheDocument()
      expect(screen.getByText('1. Upload & Map')).toBeInTheDocument()
      expect(screen.getByText('Select Lender')).toBeInTheDocument()
      expect(screen.getByText('Match Tolerance (₹)')).toBeInTheDocument()
    })

    it('detects CSV headers and maps standard fields automatically', async () => {
      vi.mocked(api.get).mockImplementation(async (url: string) => {
        if (url.includes('/lenders')) {
          return [{ id: 'lender-1', name: 'ICICI Bank' }]
        }
        return []
      })

      render(
        <MemoryRouter>
          <StatementImportWizard onClose={vi.fn()} onImportComplete={vi.fn()} />
        </MemoryRouter>
      )

      const textarea = screen.getByPlaceholderText(/Loan ID,Borrower Name,Commission/i)
      fireEvent.change(textarea, {
        target: {
          value: 'Loan_No,Customer_Name,Commission_Amount,TDS,Payment_Date,UTR\nLAN001,Rajesh,15000,750,2026-09-20,UTR123',
        },
      })

      await waitFor(() => {
        expect(screen.getByText('Map CSV Columns to System Fields')).toBeInTheDocument()
      })
    })
  })

  // ---------------------------------------------------------------------------
  // 2. UnmatchedQueue
  // ---------------------------------------------------------------------------
  describe('UnmatchedQueue Component', () => {
    const mockReceipt: PayoutReceipt = {
      id: 'receipt-1',
      org_id: 'org-1',
      lender_id: 'lender-1',
      lender_name: 'Axis Bank',
      loan_account_no: 'AXIS-LAN-777',
      customer_name: 'Priya Sharma',
      received_amount: 18000,
      tds_amount: 900,
      net_amount: 17100,
      payment_date: '2026-09-22',
      utr_reference: 'UTR777888',
      match_status: 'unmatched',
      version: 1,
      created_at: '2026-09-22T10:00:00Z',
      updated_at: '2026-09-22T10:00:00Z',
    }

    it('renders orphan receipts table and open match action', async () => {
      vi.mocked(api.get).mockImplementation(async (url: string) => {
        if (url.includes('/lenders')) {
          return [{ id: 'lender-1', name: 'Axis Bank' }]
        }
        if (url.includes('/receipts/unmatched')) {
          return [mockReceipt]
        }
        return []
      })

      render(
        <MemoryRouter>
          <UnmatchedQueue />
        </MemoryRouter>
      )

      await waitFor(() => {
        expect(screen.getByText('1 Orphans')).toBeInTheDocument()
        expect(screen.getByText('AXIS-LAN-777')).toBeInTheDocument()
        expect(screen.getByText('Priya Sharma')).toBeInTheDocument()
        expect(screen.getByText('Match Manually')).toBeInTheDocument()
      })
    })
  })

  // ---------------------------------------------------------------------------
  // 3. ManualMatchModal
  // ---------------------------------------------------------------------------
  describe('ManualMatchModal Component', () => {
    const mockReceipt: PayoutReceipt = {
      id: 'receipt-101',
      org_id: 'org-1',
      lender_id: 'lender-1',
      lender_name: 'HDFC Bank',
      loan_account_no: 'HDFC-888',
      customer_name: 'Anand Kumar',
      received_amount: 15000,
      tds_amount: 750,
      net_amount: 14250,
      payment_date: '2026-09-25',
      match_status: 'unmatched',
      version: 1,
      created_at: '2026-09-25T10:00:00Z',
      updated_at: '2026-09-25T10:00:00Z',
    }

    const mockExpectation: PayoutExpectation = {
      id: 'exp-101',
      org_id: 'org-1',
      case_id: 'case-1',
      case_no: 'CASE-2026-99',
      applicant_name: 'Anand Kumar',
      lender_application_id: 'app-1',
      lender_name: 'HDFC Bank',
      disbursal_amount: 1000000,
      gross_amount: 15000,
      tds_rate_percent: 5,
      tds_amount: 750,
      net_amount: 14250,
      status: 'due',
      gating_status: 'satisfied',
      is_override: false,
      version: 1,
      splits: [],
      created_at: '2026-09-20T10:00:00Z',
      updated_at: '2026-09-20T10:00:00Z',
    }

    it('calculates variance preview and submits match successfully', async () => {
      vi.mocked(api.get).mockResolvedValue([mockExpectation])
      vi.mocked(api.post).mockResolvedValue({
        id: 'recon-1',
        expectation_id: 'exp-101',
        receipt_id: 'receipt-101',
        variance_amount: 0,
        status: 'matched',
      })

      const onSuccess = vi.fn()
      const onClose = vi.fn()

      render(
        <MemoryRouter>
          <ManualMatchModal
            receipt={mockReceipt}
            onClose={onClose}
            onSuccess={onSuccess}
          />
        </MemoryRouter>
      )

      await waitFor(() => {
        expect(screen.getByText('CASE-2026-99')).toBeInTheDocument()
      })

      // Click on row to select expectation
      fireEvent.click(screen.getByText('CASE-2026-99'))

      await waitFor(() => {
        expect(screen.getByText('Within Tolerance (Matched)')).toBeInTheDocument()
      })

      const matchButton = screen.getByRole('button', { name: /confirm match/i })
      expect(matchButton).not.toBeDisabled()
      fireEvent.click(matchButton)

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith('/payout/reconciliation/match', expect.objectContaining({
          expectation_id: 'exp-101',
          receipt_id: 'receipt-101',
        }))
        expect(onSuccess).toHaveBeenCalled()
      })
    })
  })

  // ---------------------------------------------------------------------------
  // 4. ReconciliationPage
  // ---------------------------------------------------------------------------
  describe('ReconciliationPage Component', () => {
    it('renders tabs and batch history table with 24h reversal option', async () => {
      vi.mocked(api.get).mockImplementation(async (url: string) => {
        if (url.includes('/reconciliation/batches')) {
          return [
            {
              id: 'batch-1',
              org_id: 'org-1',
              lender_id: 'lender-1',
              lender_name: 'HDFC Bank',
              filename: 'hdfc_batch_today.csv',
              total_rows: 10,
              matched_rows: 8,
              unmatched_rows: 2,
              error_rows: 0,
              total_received_amount: 150000,
              status: 'committed',
              created_at: new Date().toISOString(), // recent -> within 24h
              updated_at: new Date().toISOString(),
            },
          ]
        }
        return []
      })

      render(
        <MemoryRouter>
          <ReconciliationPage />
        </MemoryRouter>
      )

      await waitFor(() => {
        expect(screen.getByText('Payout Reconciliation')).toBeInTheDocument()
        expect(screen.getByText('hdfc_batch_today.csv')).toBeInTheDocument()
        expect(screen.getByText('Reverse Batch (24h)')).toBeInTheDocument()
      })

      // Switch to Missing tab
      fireEvent.click(screen.getByText('Missing Receipts (>45 Days)'))
      await waitFor(() => {
        expect(api.get).toHaveBeenCalledWith(expect.stringContaining('/missing-expectations'))
      })
    })
  })

  // ---------------------------------------------------------------------------
  // 5. OutstandingReportPage
  // ---------------------------------------------------------------------------
  describe('OutstandingReportPage Component', () => {
    it('renders KPIs and lender ageing breakdown ledger', async () => {
      vi.mocked(api.get).mockResolvedValue({
        total_expected: 500000,
        total_received: 350000,
        total_outstanding: 150000,
        lenders: [
          {
            lender_id: 'lender-1',
            lender_name: 'State Bank of India',
            total_expected: 500000,
            total_received: 350000,
            total_outstanding: 150000,
            total_variance: -150000,
            pending_cases_count: 5,
            ageing_0_30: 50000,
            ageing_31_60: 50000,
            ageing_61_90: 50000,
            ageing_90_plus: 0,
          },
        ],
      })

      render(
        <MemoryRouter>
          <OutstandingReportPage />
        </MemoryRouter>
      )

      await waitFor(() => {
        expect(screen.getByText('Lender Receivables & Ageing Report')).toBeInTheDocument()
        expect(screen.getAllByText(/5,00,000\.00/).length).toBeGreaterThan(0)
        expect(screen.getByText('State Bank of India')).toBeInTheDocument()
        expect(screen.getByText('1 Active Lenders')).toBeInTheDocument()
      })
    })
  })
})
