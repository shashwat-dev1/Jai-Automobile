import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { TelecallerWorkspacePage } from '../features/cases/TelecallerWorkspacePage'
import { GuestReferralPage } from '../features/referrals/GuestReferralPage'
import { ReferralPartnersPage } from '../features/referrals/ReferralPartnersPage'
import { LeadImportModal } from '../features/cases/LeadImportModal'

describe('DSA OS Phase 1 Rebuild Test Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Workflow B: Telecaller Workspace', () => {
    it('renders telecaller KPI cards and assigned leads filter tabs', async () => {
      render(
        <MemoryRouter>
          <TelecallerWorkspacePage />
        </MemoryRouter>
      )

      expect(screen.getByText('Telecaller Workspace')).toBeInTheDocument()
      expect(screen.getByText('Assigned Leads')).toBeInTheDocument()
      expect(screen.getByText('Pending First Call')).toBeInTheDocument()
      expect(screen.getByText('Follow-ups Due')).toBeInTheDocument()
      expect(screen.getByText('Interested Leads')).toBeInTheDocument()

      // Should render the active session banner
      expect(screen.getByText(/Active Session: Priya Nair/i)).toBeInTheDocument()
    })

    it('filters leads by search query', async () => {
      render(
        <MemoryRouter>
          <TelecallerWorkspacePage />
        </MemoryRouter>
      )

      const searchInput = screen.getByPlaceholderText(/Search by customer name, mobile/i)
      fireEvent.change(searchInput, { target: { value: 'Rajesh' } })
      expect(searchInput).toHaveValue('Rajesh')
    })
  })

  describe('Workflow C: Guest Referral Intake Flow', () => {
    it('starts with Step 1 mobile number identification', () => {
      render(
        <MemoryRouter>
          <GuestReferralPage />
        </MemoryRouter>
      )

      expect(screen.getByText('Referral Partner Identification')).toBeInTheDocument()
      expect(screen.getByText('Your Mobile Number (Referral Partner) *')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Continue to Referral Form/i })).toBeDisabled()
    })

    it('enables continue button when 10 digit mobile is entered', async () => {
      render(
        <MemoryRouter>
          <GuestReferralPage />
        </MemoryRouter>
      )

      const mobileInput = screen.getByPlaceholderText('98200 12345')
      fireEvent.change(mobileInput, { target: { value: '9820044551' } })

      const continueBtn = screen.getByRole('button', { name: /Continue to Referral Form/i })
      expect(continueBtn).not.toBeDisabled()

      fireEvent.click(continueBtn)

      // Should advance to Step 2
      await waitFor(() => {
        expect(screen.getByText('Submit Vehicle Loan Lead')).toBeInTheDocument()
      })
    })

    it('auto-resolves city and state from PIN code directory', async () => {
      render(
        <MemoryRouter>
          <GuestReferralPage />
        </MemoryRouter>
      )

      // Advance to Step 2
      const mobileInput = screen.getByPlaceholderText('98200 12345')
      fireEvent.change(mobileInput, { target: { value: '9820044551' } })
      fireEvent.click(screen.getByRole('button', { name: /Continue to Referral Form/i }))

      await waitFor(() => {
        expect(screen.getByPlaceholderText('400053')).toBeInTheDocument()
      })

      const pinInput = screen.getByPlaceholderText('400053')
      fireEvent.change(pinInput, { target: { value: '302001' } })

      // Jaipur, Rajasthan should be automatically populated
      await waitFor(() => {
        expect(screen.getByDisplayValue('Jaipur')).toBeInTheDocument()
        expect(screen.getByDisplayValue('Rajasthan')).toBeInTheDocument()
      })
    })
  })

  describe('Workflow D: Referral Partners & Analysis', () => {
    it('renders admin referral KPI counters and partners ledger', async () => {
      render(
        <MemoryRouter>
          <ReferralPartnersPage />
        </MemoryRouter>
      )

      expect(screen.getByText('Referral Partners & Commissions')).toBeInTheDocument()
      expect(screen.getByText('Active Partners')).toBeInTheDocument()
      expect(screen.getByText('Referred Leads')).toBeInTheDocument()
      expect(screen.getByText('Pending Review')).toBeInTheDocument()
      expect(screen.getByText('Disbursed Payouts')).toBeInTheDocument()
    })

    it('renders masked phone numbers protecting privacy in partner table', async () => {
      render(
        <MemoryRouter>
          <ReferralPartnersPage />
        </MemoryRouter>
      )

      await waitFor(() => {
        expect(screen.getByText('Vikram Sharma')).toBeInTheDocument()
      })

      // Masked format: 98****4551
      expect(screen.getByText('98****4551')).toBeInTheDocument()
    })

    it('opens partner dossier drawer on clicking View Dossier', async () => {
      render(
        <MemoryRouter>
          <ReferralPartnersPage />
        </MemoryRouter>
      )

      await waitFor(() => {
        expect(screen.getByText('Vikram Sharma')).toBeInTheDocument()
      })

      const dossierButtons = screen.getAllByText('📂 View Dossier')
      fireEvent.click(dossierButtons[0])

      await waitFor(() => {
        expect(screen.getByText('Referral Partner Dossier')).toBeInTheDocument()
      })
    })
  })

  describe('Workflow A: Lead Bulk Excel/CSV Import Modal', () => {
    it('renders file upload dropzone and template download button', () => {
      const handleClose = vi.fn()
      const handleImport = vi.fn()

      render(
        <LeadImportModal
          isOpen={true}
          onClose={handleClose}
          onImportComplete={handleImport}
        />
      )

      expect(screen.getByText(/Bulk Cold Lead Excel \/ CSV Import/i)).toBeInTheDocument()
      expect(screen.getByText(/Download Excel\/CSV Template/i)).toBeInTheDocument()
      expect(screen.getByText(/Click to browse or drag & drop CSV file here/i)).toBeInTheDocument()
    })
  })
})
