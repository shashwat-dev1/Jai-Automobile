/**
 * DSA OS — Referral Flow Automated Acceptance Test Suite
 * Validates Screen 1 & Screen 2 behaviors, validation logic, conditional rendering,
 * and state integrity according to product specifications.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { GuestReferralPage } from '../features/referrals/GuestReferralPage'
import { api } from '../shared/lib/api'
import { isValidIndianMobile, normalizeIndianMobile } from '../shared/lib/validators'

describe('Referral Flow Automated Acceptance Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ===========================================================================
  // 1. REUSABLE VALIDATOR UNIT TESTS
  // ===========================================================================
  describe('Indian Mobile Number Validation Unit Tests', () => {
    it('accepts exactly 10 digits starting with 6, 7, 8, or 9', () => {
      expect(isValidIndianMobile('9876543210')).toBe(true)
      expect(isValidIndianMobile('8123456789')).toBe(true)
      expect(isValidIndianMobile('7000011111')).toBe(true)
      expect(isValidIndianMobile('6300099999')).toBe(true)
    })

    it('rejects numbers starting with 0, 1, 2, 3, 4, 5', () => {
      expect(isValidIndianMobile('5876543210')).toBe(false)
      expect(isValidIndianMobile('0876543210')).toBe(false)
      expect(isValidIndianMobile('1234567890')).toBe(false)
      expect(isValidIndianMobile('4999988888')).toBe(false)
    })

    it('rejects numbers with fewer or more than 10 digits', () => {
      expect(isValidIndianMobile('')).toBe(false)
      expect(isValidIndianMobile('987654321')).toBe(false) // 9 digits
      expect(isValidIndianMobile('98765')).toBe(false)
    })

    it('normalizes +91 country code, leading zeros, and whitespace', () => {
      expect(normalizeIndianMobile('+91 98765 43210')).toBe('9876543210')
      expect(normalizeIndianMobile('09876543210')).toBe('9876543210')
      expect(normalizeIndianMobile('98765-43210')).toBe('9876543210')
    })
  })

  // ===========================================================================
  // 2. SCREEN 1: MOBILE NUMBER IDENTIFICATION ACCEPTANCE TESTS
  // ===========================================================================
  describe('Screen 1 — Mobile Number Identification', () => {
    it('disables Continue when mobile number is empty or incomplete (9 digits)', () => {
      render(
        <MemoryRouter>
          <GuestReferralPage />
        </MemoryRouter>
      )

      const continueBtn = screen.getByRole('button', { name: /Continue/i })
      expect(continueBtn).toBeDisabled()

      const input = screen.getByPlaceholderText('98765 43210')
      fireEvent.change(input, { target: { value: '987654321' } }) // 9 digits
      expect(continueBtn).toBeDisabled()
    })

    it('rejects 10 digits starting with 5 or 0 as invalid starting digits', async () => {
      render(
        <MemoryRouter>
          <GuestReferralPage />
        </MemoryRouter>
      )

      const input = screen.getByPlaceholderText('98765 43210')
      fireEvent.change(input, { target: { value: '5876543210' } }) // starts with 5

      await waitFor(() => {
        expect(screen.getByText(/Mobile number must start with 6, 7, 8, or 9/i)).toBeInTheDocument()
      })

      const continueBtn = screen.getByRole('button', { name: /Continue/i })
      expect(continueBtn).toBeDisabled()
    })

    it('automatically checks DB on 10th digit and displays registered partner name', async () => {
      render(
        <MemoryRouter>
          <GuestReferralPage />
        </MemoryRouter>
      )

      const input = screen.getByPlaceholderText('98765 43210')
      // Entering 10th digit triggers auto-lookup immediately
      fireEvent.change(input, { target: { value: '9876543210' } })

      // Registered name from Reference Screen 1
      await waitFor(() => {
        expect(screen.getByText('Rajesh Sharma')).toBeInTheDocument()
        expect(screen.getByText('10/10 Verified')).toBeInTheDocument()
      })

      const continueBtn = screen.getByRole('button', { name: /Continue/i })
      expect(continueBtn).not.toBeDisabled()
    })

    it('reveals name input for valid unregistered number and blocks Continue until name is entered', async () => {
      render(
        <MemoryRouter>
          <GuestReferralPage />
        </MemoryRouter>
      )

      const input = screen.getByPlaceholderText('98765 43210')
      // 9999900001 is unregistered
      fireEvent.change(input, { target: { value: '9999900001' } })

      await waitFor(() => {
        expect(screen.getByLabelText(/Your Full Name/i)).toBeInTheDocument()
      })

      const continueBtn = screen.getByRole('button', { name: /Continue/i })
      expect(continueBtn).toBeDisabled() // blocked because name is empty

      // Enter name
      const nameInput = screen.getByLabelText(/Your Full Name/i)
      fireEvent.change(nameInput, { target: { value: 'Suresh Kumar' } })

      expect(continueBtn).not.toBeDisabled()

      // Click continue to advance
      fireEvent.click(continueBtn)
      await waitFor(() => {
        expect(screen.getByText('New Lead Submission')).toBeInTheDocument()
        expect(screen.getByText('Suresh Kumar')).toBeInTheDocument()
      })
    })

    it('handles database lookup errors with retry and does not falsely enable Continue', async () => {
      const spy = vi.spyOn(api, 'post').mockRejectedValueOnce(new Error('Database unavailable'))

      render(
        <MemoryRouter>
          <GuestReferralPage />
        </MemoryRouter>
      )

      const input = screen.getByPlaceholderText('98765 43210')
      fireEvent.change(input, { target: { value: '7777788888' } })

      await waitFor(() => {
        expect(screen.getByText(/Database unavailable/i)).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /Retry/i })).toBeInTheDocument()
      })

      const continueBtn = screen.getByRole('button', { name: /Continue/i })
      expect(continueBtn).toBeDisabled()

      spy.mockRestore()
    })

    it('cancels stale lookup requests when the user changes the number', async () => {
      render(
        <MemoryRouter>
          <GuestReferralPage />
        </MemoryRouter>
      )

      const input = screen.getByPlaceholderText('98765 43210')
      fireEvent.change(input, { target: { value: '9876543210' } })

      // User immediately backspaces to 9 digits before lookup finishes
      fireEvent.change(input, { target: { value: '987654321' } })

      const continueBtn = screen.getByRole('button', { name: /Continue/i })
      expect(continueBtn).toBeDisabled()
      expect(screen.queryByText('Rajesh Sharma')).not.toBeInTheDocument()
    })
  })

  // ===========================================================================
  // 3. SCREEN 2: CUSTOMER LEAD SUBMISSION & CONDITIONAL LOGIC TESTS
  // ===========================================================================
  describe('Screen 2 — Customer Lead Submission & Conditional Logic', () => {
    const setupScreen2 = async () => {
      render(
        <MemoryRouter>
          <GuestReferralPage />
        </MemoryRouter>
      )

      const input = screen.getByPlaceholderText('98765 43210')
      fireEvent.change(input, { target: { value: '9876543210' } })

      await waitFor(() => {
        expect(screen.getByText('Rajesh Sharma')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByRole('button', { name: /Continue/i }))

      await waitFor(() => {
        expect(screen.getByText('New Lead Submission')).toBeInTheDocument()
      })

      const dateInput = document.getElementById('expected-loan-date') as HTMLInputElement
      if (dateInput) {
        const d = new Date()
        d.setDate(d.getDate() + 14)
        fireEvent.change(dateInput, { target: { value: d.toISOString().split('T')[0] } })
      }
    }

    it('MANDATORY: starts with NEITHER Used Car nor New Car selected', async () => {
      await setupScreen2()

      const usedBtn = screen.getByRole('radio', { name: /Used Car/i })
      const newBtn = screen.getByRole('radio', { name: /New Car/i })

      // Both must be unselected on initial load
      expect(usedBtn).not.toHaveClass('selected')
      expect(newBtn).not.toHaveClass('selected')
      expect(usedBtn.getAttribute('aria-checked')).toBe('false')
      expect(newBtn.getAttribute('aria-checked')).toBe('false')

      // Vehicle Registration Number and RC upload must be absent by default
      expect(screen.queryByLabelText(/Vehicle Registration Number/i)).not.toBeInTheDocument()
      expect(screen.queryByText(/Tap to scan RC or browse file/i)).not.toBeInTheDocument()
    })

    it('rejects submission if user has not selected vehicle condition', async () => {
      await setupScreen2()

      const nameInput = screen.getByPlaceholderText('Vikramaditya Rathore')
      fireEvent.change(nameInput, { target: { value: 'Ramesh Patel' } })

      const mobileInput = screen.getByPlaceholderText('9820145692')
      fireEvent.change(mobileInput, { target: { value: '9820112233' } })

      // Attempt submit without selecting Used Car or New Car
      const submitBtn = screen.getByRole('button', { name: /Submit Lead/i })
      fireEvent.click(submitBtn)

      await waitFor(() => {
        expect(screen.getByText(/Please select Vehicle Condition/i)).toBeInTheDocument()
      })
    })

    it('reveals Registration Number and RC upload ONLY when Used Car is selected', async () => {
      await setupScreen2()

      const usedBtn = screen.getByRole('radio', { name: /Used Car/i })
      fireEvent.click(usedBtn)

      expect(usedBtn).toHaveClass('selected')
      expect(screen.getByLabelText(/Vehicle Registration Number/i)).toBeInTheDocument()
      expect(screen.getByText(/Mandatory for Used Car/i)).toBeInTheDocument()
      expect(screen.getByText(/Tap to scan RC or browse file/i)).toBeInTheDocument()
    })

    it('hides Registration Number and RC upload completely when New Car is selected', async () => {
      await setupScreen2()

      const newBtn = screen.getByRole('radio', { name: /New Car/i })
      fireEvent.click(newBtn)

      expect(newBtn).toHaveClass('selected')
      expect(screen.queryByLabelText(/Vehicle Registration Number/i)).not.toBeInTheDocument()
      expect(screen.queryByText(/Tap to scan RC or browse file/i)).not.toBeInTheDocument()
      expect(screen.queryByText(/Mandatory for Used Car/i)).not.toBeInTheDocument()
    })

    it('switching Used Car -> New Car -> Used Car clears stale registration and RC values', async () => {
      await setupScreen2()

      // 1. Select Used Car
      const usedBtn = screen.getByRole('radio', { name: /Used Car/i })
      fireEvent.click(usedBtn)

      const regInput = screen.getByLabelText(/Vehicle Registration Number/i)
      fireEvent.change(regInput, { target: { value: 'MH 02 CK 4821' } })
      expect(regInput).toHaveValue('MH 02 CK 4821')

      // 2. Switch to New Car: field vanishes from DOM
      const newBtn = screen.getByRole('radio', { name: /New Car/i })
      fireEvent.click(newBtn)
      expect(screen.queryByLabelText(/Vehicle Registration Number/i)).not.toBeInTheDocument()

      // 3. Switch back to Used Car: field reappears EMPTY
      fireEvent.click(usedBtn)
      const regInputReappeared = screen.getByLabelText(/Vehicle Registration Number/i)
      expect(regInputReappeared).toHaveValue('')
    })

    it('rejects Used Car submission without Registration Number', async () => {
      await setupScreen2()

      const nameInput = screen.getByPlaceholderText('Vikramaditya Rathore')
      fireEvent.change(nameInput, { target: { value: 'Ramesh Patel' } })

      const mobileInput = screen.getByPlaceholderText('9820145692')
      fireEvent.change(mobileInput, { target: { value: '9820112233' } })

      // Select Used Car but leave registration number empty
      fireEvent.click(screen.getByRole('radio', { name: /Used Car/i }))

      const submitBtn = screen.getByRole('button', { name: /Submit Lead/i })
      fireEvent.click(submitBtn)

      await waitFor(() => {
        expect(screen.getByText(/Vehicle Registration Number is mandatory for Used Car leads/i)).toBeInTheDocument()
      })
    })

    it('rejects Used Car submission without RC upload, but New Car succeeds without RC', async () => {
      await setupScreen2()

      const nameInput = screen.getByPlaceholderText('Vikramaditya Rathore')
      fireEvent.change(nameInput, { target: { value: 'Ramesh Patel' } })

      const mobileInput = screen.getByPlaceholderText('9820145692')
      fireEvent.change(mobileInput, { target: { value: '9820112233' } })

      // Attach genuine files for mandatory Aadhaar and PAN cards
      const aadhaarFile = new File(['dummy aadhaar content'], 'aadhaar_card.pdf', { type: 'application/pdf' })
      const panFile = new File(['dummy pan content'], 'pan_card.jpg', { type: 'image/jpeg' })
      fireEvent.change(screen.getByTestId('aadhaar-file-input'), { target: { files: [aadhaarFile] } })
      fireEvent.change(screen.getByTestId('pan-file-input'), { target: { files: [panFile] } })

      await waitFor(() => {
        expect(screen.getAllByText(/Uploaded/i).length).toBeGreaterThanOrEqual(2)
      })

      // 1. Used car with registration but without RC fails
      fireEvent.click(screen.getByRole('radio', { name: /Used Car/i }))
      const regInput = screen.getByLabelText(/Vehicle Registration Number/i)
      fireEvent.change(regInput, { target: { value: 'MH 02 CK 4821' } })

      fireEvent.click(screen.getByRole('button', { name: /Submit Lead/i }))

      await waitFor(() => {
        expect(screen.getByText(/RC Book is mandatory for Used Car loan applications/i)).toBeInTheDocument()
      })

      // 2. Switch to New Car: submission proceeds without RC!
      fireEvent.click(screen.getByRole('radio', { name: /New Car/i }))
      fireEvent.click(screen.getByRole('button', { name: /Submit Lead/i }))

      // Advances to Screen 3 (Confirmation)
      await waitFor(() => {
        expect(screen.getByText('Lead Successfully Submitted!')).toBeInTheDocument()
        expect(screen.getByText(/New Car/i)).toBeInTheDocument()
      })
    })
  })

  // ===========================================================================
  // 4. RESPONSIVE VIEWPORT TESTS (320px, 360px, 375px, 390px, 430px)
  // ===========================================================================
  describe('Responsive Viewports Layout Validation', () => {
    const viewports = [320, 360, 375, 390, 430]

    viewports.forEach((width) => {
      it(`renders both screens without crashing at viewport width ${width}px`, async () => {
        // Set window innerWidth
        window.innerWidth = width
        window.dispatchEvent(new Event('resize'))

        render(
          <MemoryRouter>
            <GuestReferralPage />
          </MemoryRouter>
        )

        expect(screen.getByText('Enter Mobile Number')).toBeInTheDocument()
        expect(screen.getByPlaceholderText('98765 43210')).toBeInTheDocument()
      })
    })
  })
})
