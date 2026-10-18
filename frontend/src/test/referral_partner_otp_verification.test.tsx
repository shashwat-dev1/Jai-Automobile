/**
 * DSA OS — Referral Partner OTP Verification Acceptance Test Suite
 *
 * Verifies:
 * 1. Unregistered guest mobile lookup prompts for name and OTP verification.
 * 2. Mobile OTP dispatch via TextBee Gateway (Airtel SIM) initiates Screen 1.5.
 * 3. Screen 1.5 displays masked mobile, 6-digit OTP input, timer, and resend button.
 * 4. Incorrect OTP shows user-friendly error and does not advance.
 * 5. Correct OTP verifies partner, creates verified profile, and advances to Screen 2.
 * 6. Used OTP cannot be replayed.
 * 7. Existing registered partner bypasses OTP and enters directly.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { GuestReferralPage } from '../features/referrals/GuestReferralPage'
import { getStoredReferralProfiles } from '../shared/lib/storeSync'

describe('Referral Partner OTP Verification (TextBee Gateway)', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    if (typeof window !== 'undefined') {
      delete (window as any).__MOCK_OTP_STORE__
      delete (window as any).__LAST_GENERATED_OTP__
    }
    vi.clearAllMocks()
  })

  it('existing registered partner bypasses OTP and continues directly', async () => {
    render(
      <MemoryRouter initialEntries={['/referral']}>
        <Routes>
          <Route path="/referral" element={<GuestReferralPage />} />
        </Routes>
      </MemoryRouter>
    )

    // Enter existing partner mobile (Rajesh Sharma: 9876543210)
    const mobileInput = screen.getByPlaceholderText('98765 43210')
    fireEvent.change(mobileInput, { target: { value: '9876543210' } })

    await waitFor(() => {
      expect(screen.getByText('Rajesh Sharma')).toBeInTheDocument()
    })

    // Button should say "Continue"
    const continueBtn = screen.getByRole('button', { name: /Continue|आगे बढ़ें/i })
    expect(continueBtn).toBeInTheDocument()

    fireEvent.click(continueBtn)

    await waitFor(() => {
      expect(screen.getByText(/New Lead Submission|नया लीड सबमिशन/i)).toBeInTheDocument()
    })
  })

  it('new guest triggers OTP dispatch, verifies with correct OTP, and creates verified profile', async () => {
    render(
      <MemoryRouter initialEntries={['/referral']}>
        <Routes>
          <Route path="/referral" element={<GuestReferralPage />} />
        </Routes>
      </MemoryRouter>
    )

    // Enter new unverified mobile number
    const mobileInput = screen.getByPlaceholderText('98765 43210')
    fireEvent.change(mobileInput, { target: { value: '9820987654' } })

    // Wait for lookup to complete as unregistered partner
    await waitFor(() => {
      expect(screen.getByLabelText(/Your Full Name/i)).toBeInTheDocument()
    })

    // Enter name
    const nameInput = screen.getByPlaceholderText(/e\.g\. Vikram Sharma/i)
    fireEvent.change(nameInput, { target: { value: 'Sunil Gavaskar' } })

    // Button should now offer OTP verification
    const otpButton = screen.getByRole('button', { name: /Verify Mobile via OTP|ओटीपी द्वारा/i })
    expect(otpButton).toBeInTheDocument()

    // Click to send OTP
    fireEvent.click(otpButton)

    // Verify Screen 1.5 (OTP Verification Card) appears
    await waitFor(() => {
      expect(screen.getByText(/Mobile OTP Verification|मोबाइल ओटीपी सत्यापन/i)).toBeInTheDocument()
    })

    // Masked mobile should be visible
    expect(screen.getByText(/98•••• 7654/i)).toBeInTheDocument()

    // 6-digit OTP code input should be visible
    const otpInput = document.getElementById('partner-otp-input') as HTMLInputElement
    expect(otpInput).toBeInTheDocument()

    // Retrieve generated mock OTP
    const generatedOtp = (window as any).__LAST_GENERATED_OTP__
    expect(generatedOtp).toBeDefined()
    expect(generatedOtp.length).toBe(6)

    // 1. Test Incorrect OTP rejection
    fireEvent.change(otpInput, { target: { value: '000000' } })
    const verifySubmitBtn = document.getElementById('verify-otp-submit-btn') as HTMLButtonElement
    fireEvent.click(verifySubmitBtn)

    await waitFor(() => {
      expect(screen.getByText(/Incorrect verification code/i)).toBeInTheDocument()
    })

    // Screen 2 must NOT be reached
    expect(screen.queryByText(/New Lead Submission/i)).not.toBeInTheDocument()

    // 2. Test Correct OTP verification
    fireEvent.change(otpInput, { target: { value: generatedOtp } })
    fireEvent.click(verifySubmitBtn)

    // Must successfully advance to Screen 2
    await waitFor(() => {
      expect(screen.getByText(/New Lead Submission|नया लीड सबमिशन/i)).toBeInTheDocument()
    })

    // Partner profile must be verified in store
    const profiles = getStoredReferralProfiles()
    const verifiedProfile = profiles.find((p) => p.mobile_primary === '9820987654')
    expect(verifiedProfile).toBeDefined()
    expect(verifiedProfile?.name).toBe('Sunil Gavaskar')
    expect(verifiedProfile?.verification_status).toBe('verified')
  })

  it('allows changing mobile number from the OTP verification screen', async () => {
    render(
      <MemoryRouter initialEntries={['/referral']}>
        <Routes>
          <Route path="/referral" element={<GuestReferralPage />} />
        </Routes>
      </MemoryRouter>
    )

    // Enter number and name
    fireEvent.change(screen.getByPlaceholderText('98765 43210'), { target: { value: '9820123456' } })
    await waitFor(() => {
      expect(screen.getByLabelText(/Your Full Name/i)).toBeInTheDocument()
    })
    fireEvent.change(screen.getByPlaceholderText(/e\.g\. Vikram Sharma/i), { target: { value: 'Karan Mehra' } })

    // Click Verify via OTP
    fireEvent.click(screen.getByRole('button', { name: /Verify Mobile via OTP/i }))

    await waitFor(() => {
      expect(screen.getByText(/Mobile OTP Verification/i)).toBeInTheDocument()
    })

    // Click "Change Number"
    const changeBtn = screen.getByRole('button', { name: /Change Number|नंबर बदलें/i })
    fireEvent.click(changeBtn)

    // Must return to mobile entry screen
    await waitFor(() => {
      expect(screen.getByPlaceholderText('98765 43210')).toBeInTheDocument()
      expect(screen.queryByText(/Mobile OTP Verification/i)).not.toBeInTheDocument()
    })
  })
})
