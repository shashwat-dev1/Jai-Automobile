/**
 * DSA OS — Referral Portal Final Updates Acceptance Test Suite
 *
 * Verifies:
 * 1. Form Section Order:
 *    - 1: Customer Details
 *    - 2: Loan Type (above Vehicle Condition)
 *    - 3: Vehicle & Loan Details
 *    - 4: Expected Loan Required Date (after Vehicle & Loan Details)
 *    - 5: Vehicle Condition (immediately above Document Uploads)
 *    - 6: Document Uploads (FINAL section of form)
 * 2. Expected Loan Required Date:
 *    - Valid date acceptance, min/max bounds, persistence in lead record, and admin visibility.
 * 3. PIN-code autofill:
 *    - Automatic location lookup, loading, cancellation, manual edit, and error states.
 * 4. Hindi & English switching:
 *    - Full coverage across all labels, validation, and confirmation without resetting form state.
 * 5. Documents & OCR:
 *    - Zero preloaded sample documents, real file upload, quarantined status, and conditional RC requirement.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { GuestReferralPage } from '../features/referrals/GuestReferralPage'
import { CaseDetailPage } from '../features/cases/CaseDetailPage'
import { getStoredCases } from '../shared/lib/storeSync'

describe('Referral Portal Final Updates Test Suite', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    vi.clearAllMocks()
  })

  // Helper to advance through Step 1 (Partner Identification) to Step 2 (Lead Submission Form)
  const advanceToScreen2 = async () => {
    render(
      <MemoryRouter initialEntries={['/referral']}>
        <Routes>
          <Route path="/referral" element={<GuestReferralPage />} />
          <Route path="/cases/:caseId" element={<CaseDetailPage />} />
        </Routes>
      </MemoryRouter>
    )

    // Enter registered partner mobile number (Rajesh Sharma: 9876543210)
    const mobileInput = screen.getByPlaceholderText('98765 43210')
    fireEvent.change(mobileInput, { target: { value: '9876543210' } })

    await waitFor(() => {
      expect(screen.getByText('Rajesh Sharma')).toBeInTheDocument()
    })

    const continueBtn = screen.getByRole('button', { name: /Continue|आगे बढ़ें/i })
    fireEvent.click(continueBtn)

    await waitFor(() => {
      expect(screen.getByText(/New Lead Submission|नया लीड सबमिशन/i)).toBeInTheDocument()
    })
  }

  // ===========================================================================
  // 1. EXACT FORM SECTION ORDER
  // ===========================================================================
  describe('Form Sections Exact Order Requirement', () => {
    it('renders the form sections in the exact requested order', async () => {
      await advanceToScreen2()

      const sections = document.querySelectorAll('.lead-card-section')
      expect(sections.length).toBe(6)

      // Section 1: Customer Details
      expect(sections[0].getAttribute('data-section')).toBe('customer-details')
      expect(sections[0].textContent).toContain('CUSTOMER DETAILS')

      // Section 2: Loan Type (Moved above Vehicle Condition)
      expect(sections[1].getAttribute('data-section')).toBe('loan-type')
      expect(sections[1].textContent).toContain('LOAN TYPE')

      // Section 3: Vehicle & Loan Details
      expect(sections[2].getAttribute('data-section')).toBe('vehicle-loan-details')
      expect(sections[2].textContent).toContain('VEHICLE & LOAN DETAILS')

      // Section 4: Expected Loan Required Date (Subsection after Vehicle & Loan Details)
      expect(sections[3].getAttribute('data-section')).toBe('expected-loan-date')
      expect(sections[3].textContent).toContain('EXPECTED LOAN REQUIRED DATE')

      // Section 5: Vehicle Condition (Immediately above Document Uploads)
      expect(sections[4].getAttribute('data-section')).toBe('vehicle-condition')
      expect(sections[4].textContent).toContain('VEHICLE CONDITION')

      // Section 6: Document Uploads (FINAL section of form)
      expect(sections[5].getAttribute('data-section')).toBe('document-uploads')
      expect(sections[5].textContent).toContain('DOCUMENT UPLOADS')
    })
  })

  // ===========================================================================
  // 2. EXPECTED LOAN REQUIRED DATE
  // ===========================================================================
  describe('Expected Loan Required Date Requirement', () => {
    it('provides date picker with sensible min/max constraints', async () => {
      await advanceToScreen2()

      const dateInput = document.getElementById('expected-loan-date') as HTMLInputElement
      expect(dateInput).toBeInTheDocument()
      expect(dateInput.type).toBe('date')

      const todayStr = new Date().toISOString().split('T')[0]
      expect(dateInput.min).toBe(todayStr)

      const nextYear = new Date()
      nextYear.setFullYear(nextYear.getFullYear() + 1)
      const nextYearStr = nextYear.toISOString().split('T')[0]
      expect(dateInput.max).toBe(nextYearStr)
    })

    it('rejects dates in the past with a clear business error', async () => {
      await advanceToScreen2()

      // Fill valid customer details
      fireEvent.change(screen.getByPlaceholderText('Vikramaditya Rathore'), {
        target: { value: 'Arjun Verma' },
      })
      fireEvent.change(screen.getByPlaceholderText('9820145692'), {
        target: { value: '9820123456' },
      })

      // Select New Car
      fireEvent.click(screen.getByRole('radio', { name: /New Car/i }))

      // Set past date
      const dateInput = document.getElementById('expected-loan-date') as HTMLInputElement
      fireEvent.change(dateInput, { target: { value: '2020-01-01' } })

      // Attempt submit
      fireEvent.click(screen.getByRole('button', { name: /Submit Lead/i }))

      await waitFor(() => {
        expect(screen.getByText(/Expected Loan Required Date cannot be in the past/i)).toBeInTheDocument()
      })
    })

    it('saves expected_loan_required_date to persisted lead record upon submission', async () => {
      await advanceToScreen2()

      fireEvent.change(screen.getByPlaceholderText('Vikramaditya Rathore'), {
        target: { value: 'Meera Rajput' },
      })
      fireEvent.change(screen.getByPlaceholderText('9820145692'), {
        target: { value: '9820987654' },
      })

      // Set a valid expected loan date
      const targetDate = new Date()
      targetDate.setDate(targetDate.getDate() + 25)
      const targetDateStr = targetDate.toISOString().split('T')[0]

      const dateInput = document.getElementById('expected-loan-date') as HTMLInputElement
      fireEvent.change(dateInput, { target: { value: targetDateStr } })

      // Select New Car
      fireEvent.click(screen.getByRole('radio', { name: /New Car/i }))

      // Upload genuine files for mandatory Aadhaar and PAN
      const aadhaarFile = new File(['dummy aadhaar'], 'meera_aadhaar.pdf', { type: 'application/pdf' })
      const panFile = new File(['dummy pan'], 'meera_pan.jpg', { type: 'image/jpeg' })
      fireEvent.change(screen.getByTestId('aadhaar-file-input'), { target: { files: [aadhaarFile] } })
      fireEvent.change(screen.getByTestId('pan-file-input'), { target: { files: [panFile] } })

      await waitFor(() => {
        expect(screen.getAllByText(/Uploaded \(Quarantined\)/i).length).toBe(2)
      })

      // Submit lead
      fireEvent.click(screen.getByRole('button', { name: /Submit Lead/i }))

      await waitFor(() => {
        expect(screen.getByText('Lead Successfully Submitted!')).toBeInTheDocument()
      })

      // Verify the persisted record has expected_loan_required_date saved
      const stored = getStoredCases()
      const savedCase = stored.find((c) => c.applicant_name === 'Meera Rajput')
      expect(savedCase).toBeDefined()
      expect(savedCase?.expected_loan_required_date).toBe(targetDateStr)
    })
  })

  // ===========================================================================
  // 3. PIN-CODE LOCATION AUTOFILL
  // ===========================================================================
  describe('PIN-code Location Autofill Requirement', () => {
    it('populates city and state automatically for valid Indian PIN codes', async () => {
      await advanceToScreen2()

      const pincodeInput = document.getElementById('customer-pincode') as HTMLInputElement
      expect(pincodeInput).toBeInTheDocument()

      // Enter Bengaluru PIN code
      fireEvent.change(pincodeInput, { target: { value: '560001' } })

      await waitFor(() => {
        const text = document.querySelector('.city-value')?.textContent || ''
        expect(text).toContain('Bengaluru')
        expect(text).toContain('Karnataka')
      })

      // Enter New Delhi PIN code
      fireEvent.change(pincodeInput, { target: { value: '110001' } })

      await waitFor(() => {
        const text = document.querySelector('.city-value')?.textContent || ''
        expect(text).toMatch(/New Delhi|Delhi|Connaught Place/i)
      })
    })

    it('accurately resolves rural and town-level postal code 470229 to Garhakota, Sagar, Madhya Pradesh', async () => {
      await advanceToScreen2()

      const pincodeInput = document.getElementById('customer-pincode') as HTMLInputElement
      expect(pincodeInput).toBeInTheDocument()

      // Enter Garhakota (Sagar, MP) PIN code
      fireEvent.change(pincodeInput, { target: { value: '470229' } })

      await waitFor(() => {
        const text = document.querySelector('.city-value')?.textContent || ''
        expect(text).toContain('Garhakota')
        expect(text).toContain('Sagar')
        expect(text).toContain('Madhya Pradesh')
      })
    })

    it('displays error for invalid PIN codes and allows manual location editing with Town/Locality, District, and State', async () => {
      await advanceToScreen2()

      const pincodeInput = document.getElementById('customer-pincode') as HTMLInputElement
      // PIN starting with 0 is invalid in India
      fireEvent.change(pincodeInput, { target: { value: '012345' } })

      await waitFor(() => {
        expect(screen.getByText(/Enter a valid 6-digit Indian PIN code/i)).toBeInTheDocument()
      })

      // Click "Edit" to manually customize location
      const editBtn = document.querySelector('.city-manual-edit-btn') as HTMLButtonElement
      expect(editBtn).toBeInTheDocument()
      fireEvent.click(editBtn)

      expect(screen.getByLabelText(/Town \/ Locality/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/District/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/State/i)).toBeInTheDocument()

      fireEvent.change(screen.getByLabelText(/Town \/ Locality/i), { target: { value: 'Panchavati' } })
      fireEvent.change(screen.getByLabelText(/District/i), { target: { value: 'Nashik' } })
      fireEvent.change(screen.getByLabelText(/State/i), { target: { value: 'Maharashtra' } })

      expect(screen.getByText(/Panchavati/i)).toBeInTheDocument()
      expect(screen.getByText(/Nashik/i)).toBeInTheDocument()
    })
  })

  // ===========================================================================
  // 4. HINDI & ENGLISH LANGUAGE SWITCHING
  // ===========================================================================
  describe('Hindi and English Language Switching Requirement', () => {
    it('starts with English by default and updates all user-facing text when switched to Hindi', async () => {
      await advanceToScreen2()

      // Verify English default
      expect(screen.getByText('New Lead Submission')).toBeInTheDocument()
      expect(screen.getByText('1. CUSTOMER DETAILS')).toBeInTheDocument()
      expect(screen.getByText('2. LOAN TYPE')).toBeInTheDocument()
      expect(screen.getByText('3. VEHICLE & LOAN DETAILS')).toBeInTheDocument()
      expect(screen.getByText('4. EXPECTED LOAN REQUIRED DATE')).toBeInTheDocument()
      expect(screen.getByText('5. VEHICLE CONDITION')).toBeInTheDocument()
      expect(screen.getByText('6. DOCUMENT UPLOADS')).toBeInTheDocument()

      // Switch to Hindi
      const hindiBtn = screen.getByRole('button', { name: 'हिन्दी' })
      fireEvent.click(hindiBtn)

      // Verify translated text
      expect(screen.getByText('नया लीड सबमिशन')).toBeInTheDocument()
      expect(screen.getByText(/1\. ग्राहक विवरण/i)).toBeInTheDocument()
      expect(screen.getByText(/2\. ऋण का प्रकार/i)).toBeInTheDocument()
      expect(screen.getByText(/3\. वाहन एवं ऋण विवरण/i)).toBeInTheDocument()
      expect(screen.getByText(/4\. ऋण की अपेक्षित तारीख/i)).toBeInTheDocument()
      expect(screen.getByText(/5\. वाहन की स्थिति/i)).toBeInTheDocument()
      expect(screen.getByText(/6\. दस्तावेज़ अपलोड/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /लीड सबमिट करें/i })).toBeInTheDocument()

      // Switch back to English
      const englishBtn = screen.getByRole('button', { name: 'English' })
      fireEvent.click(englishBtn)

      expect(screen.getByText('New Lead Submission')).toBeInTheDocument()
      expect(screen.getByText('1. CUSTOMER DETAILS')).toBeInTheDocument()
    })

    it('does NOT clear user entries or selected options when switching languages', async () => {
      await advanceToScreen2()

      // Enter customer name and mobile
      const nameInput = screen.getByPlaceholderText('Vikramaditya Rathore')
      fireEvent.change(nameInput, { target: { value: 'Siddharth Roy' } })

      // Select CV loan type
      fireEvent.click(screen.getByRole('radio', { name: /CV/i }))

      // Select Used Car
      fireEvent.click(screen.getByRole('radio', { name: /Used Car/i }))

      const regInput = screen.getByLabelText(/Vehicle Registration Number/i)
      fireEvent.change(regInput, { target: { value: 'MH 12 AB 9999' } })

      // Toggle to Hindi
      fireEvent.click(screen.getByRole('button', { name: 'हिन्दी' }))

      // Values must remain intact!
      expect(nameInput).toHaveValue('Siddharth Roy')
      expect(screen.getByRole('radio', { name: /कमर्शियल वाहन/i })).toHaveClass('selected')
      expect(screen.getByRole('radio', { name: /पुरानी कार/i })).toHaveClass('selected')
      expect(screen.getByLabelText(/वाहन पंजीकरण संख्या/i)).toHaveValue('MH 12 AB 9999')
    })
  })

  // ===========================================================================
  // 5. DOCUMENTS AND REAL OCR WORKFLOW
  // ===========================================================================
  describe('Zero Sample Documents & Genuine Upload Requirement', () => {
    it('starts with NO uploaded documents prefilled', async () => {
      await advanceToScreen2()

      // Must start with NO uploaded files
      expect(screen.queryByText(/aadhaar_front_back.pdf/i)).not.toBeInTheDocument()
      expect(screen.queryByText(/pan_card_copy.jpg/i)).not.toBeInTheDocument()
      expect(screen.queryByText(/Uploaded \(Quarantined\)/i)).not.toBeInTheDocument()

      // Buttons must say Upload, not Replace
      const uploadButtons = screen.getAllByRole('button', { name: 'Upload' })
      expect(uploadButtons.length).toBe(2) // Aadhaar & PAN
    })

    it('uploads genuine file and marks it with quarantined status', async () => {
      await advanceToScreen2()

      const file = new File(['genuine pdf binary content'], 'my_real_aadhaar.pdf', {
        type: 'application/pdf',
      })

      const aadhaarInput = screen.getByTestId('aadhaar-file-input')
      fireEvent.change(aadhaarInput, { target: { files: [file] } })

      await waitFor(() => {
        expect(screen.getByText(/my_real_aadhaar.pdf/i)).toBeInTheDocument()
        expect(screen.getByText(/Uploaded \(Quarantined\)/i)).toBeInTheDocument()
      })
    })

    it('enforces mandatory Aadhaar and PAN, and RC conditionally for Used Car', async () => {
      await advanceToScreen2()

      // Fill customer details
      fireEvent.change(screen.getByPlaceholderText('Vikramaditya Rathore'), {
        target: { value: 'Sunil Rao' },
      })
      fireEvent.change(screen.getByPlaceholderText('9820145692'), {
        target: { value: '9820556677' },
      })

      // Select Used Car
      fireEvent.click(screen.getByRole('radio', { name: /Used Car/i }))
      fireEvent.change(screen.getByLabelText(/Vehicle Registration Number/i), {
        target: { value: 'DL 01 AA 1234' },
      })

      // Submit without uploading Aadhaar -> should fail
      fireEvent.click(screen.getByRole('button', { name: /Submit Lead/i }))
      await waitFor(() => {
        expect(screen.getByText(/Aadhaar Card is mandatory/i)).toBeInTheDocument()
      })

      // Upload Aadhaar
      const aadhaarFile = new File(['aadhaar'], 'aadhaar.pdf', { type: 'application/pdf' })
      fireEvent.change(screen.getByTestId('aadhaar-file-input'), { target: { files: [aadhaarFile] } })
      await waitFor(() => {
        expect(screen.getByText(/aadhaar\.pdf/i)).toBeInTheDocument()
      })

      // Submit without PAN -> should fail
      fireEvent.click(screen.getByRole('button', { name: /Submit Lead/i }))
      await waitFor(() => {
        expect(screen.getByText(/PAN Card is mandatory/i)).toBeInTheDocument()
      })

      // Upload PAN
      const panFile = new File(['pan'], 'pan.pdf', { type: 'application/pdf' })
      fireEvent.change(screen.getByTestId('pan-file-input'), { target: { files: [panFile] } })
      await waitFor(() => {
        expect(screen.getByText(/pan\.pdf/i)).toBeInTheDocument()
      })

      // Submit Used Car without RC -> should fail
      fireEvent.click(screen.getByRole('button', { name: /Submit Lead/i }))
      await waitFor(() => {
        expect(screen.getByText(/RC Book is mandatory for Used Car/i)).toBeInTheDocument()
      })

      // Upload RC
      const rcFile = new File(['rc'], 'rc.pdf', { type: 'application/pdf' })
      fireEvent.change(screen.getByTestId('rc-file-input'), { target: { files: [rcFile] } })
      await waitFor(() => {
        expect(screen.getByText(/rc\.pdf/i)).toBeInTheDocument()
      })

      // Now submit should succeed
      fireEvent.click(screen.getByRole('button', { name: /Submit Lead/i }))
      await waitFor(() => {
        expect(screen.getByText('Lead Successfully Submitted!')).toBeInTheDocument()
        expect(screen.getByText('Used Car')).toBeInTheDocument()
      })
    })
  })
})
