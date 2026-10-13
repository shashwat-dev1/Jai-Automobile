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

      expect(screen.getByText('Enter Mobile Number')).toBeInTheDocument()
      expect(screen.getByText('Registered Partner Mobile')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Continue/i })).toBeDisabled()
    })

    it('enables continue button when 10 digit mobile is entered and verified', async () => {
      render(
        <MemoryRouter>
          <GuestReferralPage />
        </MemoryRouter>
      )

      const mobileInput = screen.getByPlaceholderText('98765 43210')
      fireEvent.change(mobileInput, { target: { value: '9876543210' } })

      // Auto-lookup should resolve Rajesh Sharma
      await waitFor(() => {
        expect(screen.getByText('Rajesh Sharma')).toBeInTheDocument()
      })

      const continueBtn = screen.getByRole('button', { name: /Continue/i })
      expect(continueBtn).not.toBeDisabled()

      fireEvent.click(continueBtn)

      // Should advance to Step 2
      await waitFor(() => {
        expect(screen.getByText('New Lead Submission')).toBeInTheDocument()
      })
    })

    it('auto-resolves city and state from PIN code directory', async () => {
      render(
        <MemoryRouter>
          <GuestReferralPage />
        </MemoryRouter>
      )

      // Advance to Step 2
      const mobileInput = screen.getByPlaceholderText('98765 43210')
      fireEvent.change(mobileInput, { target: { value: '9876543210' } })

      await waitFor(() => {
        expect(screen.getByText('Rajesh Sharma')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByRole('button', { name: /Continue/i }))

      await waitFor(() => {
        expect(screen.getByPlaceholderText('400001')).toBeInTheDocument()
      })

      const pinInput = screen.getByPlaceholderText('400001')
      fireEvent.change(pinInput, { target: { value: '302001' } })

      // Jaipur, RJ should be automatically populated in city card
      await waitFor(() => {
        expect(screen.getByText(/Jaipur, RJ/i)).toBeInTheDocument()
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
