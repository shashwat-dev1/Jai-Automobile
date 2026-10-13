import { useState, useEffect, useRef, FormEvent, ChangeEvent } from 'react'
import { useParams } from 'react-router-dom'
import { api, ApiError } from '../../shared/lib/api'
import {
  normalizeIndianMobile,
  isValidIndianMobile,
  formatIndianMobileDisplay,
} from '../../shared/lib/validators'
import './GuestReferralPage.css'

interface OrgBranding {
  name: string
  tagline: string
  logo_url: string
  portal_version: string
}

interface LookupCacheItem {
  exists: boolean
  name?: string | null
  profile_id?: string | null
  verification_status?: string | null
}

// PIN-code directory for Indian locations
const PINCODE_MAP: Record<string, { city: string; state: string; stateShort: string }> = {
  '400001': { city: 'Mumbai', state: 'Maharashtra', stateShort: 'MH' },
  '400053': { city: 'Mumbai', state: 'Maharashtra', stateShort: 'MH' },
  '400601': { city: 'Thane', state: 'Maharashtra', stateShort: 'MH' },
  '411001': { city: 'Pune', state: 'Maharashtra', stateShort: 'MH' },
  '302001': { city: 'Jaipur', state: 'Rajasthan', stateShort: 'RJ' },
  '302015': { city: 'Jaipur', state: 'Rajasthan', stateShort: 'RJ' },
  '110001': { city: 'New Delhi', state: 'Delhi', stateShort: 'DL' },
  '560001': { city: 'Bengaluru', state: 'Karnataka', stateShort: 'KA' },
  '500001': { city: 'Hyderabad', state: 'Telangana', stateShort: 'TS' },
  '380001': { city: 'Ahmedabad', state: 'Gujarat', stateShort: 'GJ' },
  '600001': { city: 'Chennai', state: 'Tamil Nadu', stateShort: 'TN' },
}

export function GuestReferralPage() {
  const { orgSlug } = useParams<{ orgSlug?: string }>()

  // Organization branding
  const [branding, setBranding] = useState<OrgBranding>({
    name: 'Jai Automobiles',
    tagline: 'PARTNER REFERRAL NETWORK',
    logo_url: '/jai_auto_logo.jpg',
    portal_version: 'Portal v2.4',
  })

  // Navigation Steps: 1 = Mobile Identification, 2 = Customer Lead Intake, 3 = Confirmation
  const [step, setStep] = useState<1 | 2 | 3>(1)

  // ---------------------------------------------------------------------------
  // Screen 1: Mobile Partner Identification State
  // ---------------------------------------------------------------------------
  const [partnerMobile, setPartnerMobile] = useState('')
  const [partnerName, setPartnerName] = useState('')
  const [isExistingPartner, setIsExistingPartner] = useState(false)
  const [isCheckingMobile, setIsCheckingMobile] = useState(false)
  const [hasLookupCompleted, setHasLookupCompleted] = useState(false)
  const [lookupError, setLookupError] = useState<string | null>(null)

  // Lookup performance, caching, and race-condition cancellation
  const lookupCacheRef = useRef<Map<string, LookupCacheItem>>(new Map())
  const abortControllerRef = useRef<AbortController | null>(null)
  const inFlightNumberRef = useRef<string>('')

  // ---------------------------------------------------------------------------
  // Screen 2: Customer Lead Intake State
  // ---------------------------------------------------------------------------
  const [applicantName, setApplicantName] = useState('')
  const [applicantMobile, setApplicantMobile] = useState('')

  // MANDATORY REQUIREMENT: Neither Used Car nor New Car must be selected initially!
  const [vehicleCondition, setVehicleCondition] = useState<'used' | 'new' | null>(null)

  // Conditional Registration Number (Only for Used Car)
  const [vehicleRegNo, setVehicleRegNo] = useState('')

  // Loan Type
  const [loanType, setLoanType] = useState<'car' | 'cv' | 'tractor' | 'two_wheeler'>('car')

  // Requested Loan Amount
  const [loanAmount, setLoanAmount] = useState('850000')
  const [selectedPreset, setSelectedPreset] = useState<number | null>(850000)

  // PIN Code, City & State
  const [pincode, setPincode] = useState('400001')
  const [city, setCity] = useState('Mumbai')
  const [state, setState] = useState('Maharashtra')
  const [stateShort, setStateShort] = useState('MH')

  // Document Uploads
  const [, setAadhaarFile] = useState<File | null>(null)
  const [aadhaarDocId, setAadhaarDocId] = useState<string | null>('doc-init-aadhaar-01')
  const [aadhaarFileName, setAadhaarFileName] = useState<string>('aadhaar_front_back.pdf (1.2 MB)')

  const [, setPanFile] = useState<File | null>(null)
  const [panDocId, setPanDocId] = useState<string | null>('doc-init-pan-01')
  const [panFileName, setPanFileName] = useState<string>('pan_card_copy.jpg (840 KB)')

  // Conditional RC Upload (Only for Used Car)
  const [, setRcFile] = useState<File | null>(null)
  const [rcDocId, setRcDocId] = useState<string | null>(null)
  const [rcFileName, setRcFileName] = useState<string>('')

  const [uploadingDoc, setUploadingDoc] = useState<string | null>(null)
  const [uploadErrors, setUploadErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)

  // ---------------------------------------------------------------------------
  // Screen 3: Submission Confirmation State
  // ---------------------------------------------------------------------------
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitResult, setSubmitResult] = useState<{
    case_no: string
    case_id: string
    tracking_id?: string
    message: string
  } | null>(null)

  // Hidden file input refs
  const aadhaarInputRef = useRef<HTMLInputElement | null>(null)
  const panInputRef = useRef<HTMLInputElement | null>(null)
  const rcInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (orgSlug) {
      if (orgSlug.includes('raj')) {
        setBranding({
          name: 'Raj Auto Consultants',
          tagline: 'PARTNER REFERRAL NETWORK',
          logo_url: '/jai_auto_logo.jpg',
          portal_version: 'Portal v2.4',
        })
      } else if (orgSlug.includes('nishant')) {
        setBranding({
          name: 'Nishant Automobiles',
          tagline: 'PARTNER REFERRAL NETWORK',
          logo_url: '/jai_auto_logo.jpg',
          portal_version: 'Portal v2.4',
        })
      }
    }
  }, [orgSlug])

  // ===========================================================================
  // SCREEN 1: Automatic 10th Digit Database Lookup
  // ===========================================================================
  const initiateLookup = async (normalizedDigits: string) => {
    // 1. Cancel previous in-flight request if user is typing
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }

    inFlightNumberRef.current = normalizedDigits
    setLookupError(null)

    // 2. Check instant in-memory cache (<1ms response objective)
    const cached = lookupCacheRef.current.get(normalizedDigits)
    if (cached) {
      setIsCheckingMobile(false)
      setHasLookupCompleted(true)
      setIsExistingPartner(cached.exists)
      if (cached.exists && cached.name) {
        setPartnerName(cached.name)
      } else {
        setPartnerName('')
      }
      return
    }

    // 3. Initiate actual database lookup immediately
    const controller = new AbortController()
    abortControllerRef.current = controller
    setIsCheckingMobile(true)

    try {
      const res = await api.post<{
        exists: boolean
        name?: string | null
        profile_id?: string | null
        verification_status?: string | null
      }>(
        '/referrals/lookup',
        {
          mobile: normalizedDigits,
          org_slug: orgSlug || 'jai-automobiles',
        },
        { signal: controller.signal }
      )

      // Guard against race condition: check if number is still active
      if (inFlightNumberRef.current !== normalizedDigits) {
        return
      }

      const result: LookupCacheItem = {
        exists: Boolean(res?.exists),
        name: res?.name || null,
        profile_id: res?.profile_id || null,
        verification_status: res?.verification_status || null,
      }

      // Cache lookup result
      lookupCacheRef.current.set(normalizedDigits, result)

      setIsExistingPartner(result.exists)
      if (result.exists && result.name) {
        setPartnerName(result.name)
      } else {
        setPartnerName('')
      }
      setHasLookupCompleted(true)
    } catch (err: unknown) {
      // Ignore AbortError from cancellation
      if (err instanceof Error && err.name === 'AbortError') {
        return
      }
      if (inFlightNumberRef.current !== normalizedDigits) {
        return
      }
      const msg =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
          ? err.message
          : 'Database unavailable. Please check connection and retry.'
      setLookupError(msg)
      setHasLookupCompleted(false)
      setIsExistingPartner(false)
    } finally {
      if (inFlightNumberRef.current === normalizedDigits) {
        setIsCheckingMobile(false)
      }
    }
  }

  const handleMobileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const rawVal = e.target.value
    const normalized = normalizeIndianMobile(rawVal)

    setPartnerMobile(normalized)
    setLookupError(null)

    // If user edited away from 10 digits, cancel pending and reset partner state
    if (normalized.length < 10) {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
        abortControllerRef.current = null
      }
      inFlightNumberRef.current = ''
      setIsCheckingMobile(false)
      setHasLookupCompleted(false)
      setIsExistingPartner(false)
      setPartnerName('')
      return
    }

    // Exact 10 digits reached: check validity and trigger immediate auto-lookup
    if (normalized.length === 10) {
      if (!isValidIndianMobile(normalized)) {
        setLookupError('Mobile number must start with 6, 7, 8, or 9.')
        setHasLookupCompleted(false)
        return
      }
      // Valid Indian 10 digits: start lookup immediately
      initiateLookup(normalized)
    }
  }

  // Continue from Screen 1 to Screen 2
  const handleContinueFromScreen1 = () => {
    if (!isValidIndianMobile(partnerMobile)) {
      setLookupError('Please enter a valid 10-digit Indian mobile number.')
      return
    }
    if (!hasLookupCompleted) {
      initiateLookup(partnerMobile)
      return
    }
    if (!isExistingPartner && !partnerName.trim()) {
      setLookupError('Please enter your name to register as a partner.')
      return
    }
    setLookupError(null)
    setStep(2)
  }

  // ===========================================================================
  // SCREEN 2: Customer Lead Submission & Conditional Logic
  // ===========================================================================

  // Vehicle condition selector: strictly enforce switching logic
  const handleSelectVehicleCondition = (condition: 'used' | 'new') => {
    setVehicleCondition(condition)
    setFormError(null)

    if (condition === 'new') {
      // Requirement 5 & 6: Switching to New Car hides registration & RC,
      // and clears/excludes stale values from payload
      setVehicleRegNo('')
      setRcFile(null)
      setRcDocId(null)
      setRcFileName('')
    } else if (condition === 'used') {
      // Switching to Used Car requires fresh values
      setVehicleRegNo('')
      setRcFile(null)
      setRcDocId(null)
      setRcFileName('')
    }
  }

  // PIN Code input and automatic City/State lookup
  const handlePincodeChange = (e: ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, '').slice(0, 6)
    setPincode(val)
    if (val.length === 6 && PINCODE_MAP[val]) {
      setCity(PINCODE_MAP[val].city)
      setState(PINCODE_MAP[val].state)
      setStateShort(PINCODE_MAP[val].stateShort)
    }
  }

  // Loan Amount formatting and presets
  const handleLoanAmountChange = (e: ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, '')
    setLoanAmount(raw)
    const num = Number(raw)
    if ([300000, 500000, 850000, 1000000, 1500000].includes(num)) {
      setSelectedPreset(num)
    } else {
      setSelectedPreset(null)
    }
  }

  const handleSelectPreset = (amount: number) => {
    setSelectedPreset(amount)
    setLoanAmount(String(amount))
  }

  // File Upload Handler (Aadhaar, PAN, RC)
  const handleFileUpload = async (file: File | null, docType: 'aadhaar' | 'pan' | 'rc') => {
    setFormError(null)
    setUploadErrors((prev) => ({ ...prev, [docType]: '' }))

    if (!file) {
      if (docType === 'aadhaar') {
        setAadhaarFile(null)
        setAadhaarDocId(null)
        setAadhaarFileName('')
      } else if (docType === 'pan') {
        setPanFile(null)
        setPanDocId(null)
        setPanFileName('')
      } else if (docType === 'rc') {
        setRcFile(null)
        setRcDocId(null)
        setRcFileName('')
      }
      return
    }

    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg']
    if (!allowedTypes.includes(file.type.toLowerCase())) {
      setUploadErrors((prev) => ({
        ...prev,
        [docType]: 'Only PDF, JPEG, or PNG files are supported.',
      }))
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setUploadErrors((prev) => ({
        ...prev,
        [docType]: 'File size exceeds 10MB limit.',
      }))
      return
    }

    setUploadingDoc(docType)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('doc_type', docType)
      if (orgSlug) formData.append('org_slug', orgSlug)

      const res = await api.post<{ document_id: string }>(
        '/referrals/upload-document',
        formData
      )
      const assignedId = res?.document_id || `doc-${Date.now()}-${docType}`
      const sizeMb = (file.size / (1024 * 1024)).toFixed(1)
      const displayName = `${file.name} (${sizeMb} MB)`

      if (docType === 'aadhaar') {
        setAadhaarFile(file)
        setAadhaarDocId(assignedId)
        setAadhaarFileName(displayName)
      } else if (docType === 'pan') {
        setPanFile(file)
        setPanDocId(assignedId)
        setPanFileName(displayName)
      } else if (docType === 'rc') {
        setRcFile(file)
        setRcDocId(assignedId)
        setRcFileName(displayName)
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Upload failed. Please try again.'
      setUploadErrors((prev) => ({ ...prev, [docType]: msg }))
    } finally {
      setUploadingDoc(null)
    }
  }

  // Final Form Submission
  const handleSubmitLead = async (e: FormEvent) => {
    e.preventDefault()
    setFormError(null)

    // 1. Validate Customer Name
    if (!applicantName.trim()) {
      setFormError('Please enter Customer Full Name.')
      return
    }

    // 2. Validate Customer Mobile
    if (!isValidIndianMobile(applicantMobile)) {
      setFormError('Customer Mobile Number must be a valid 10-digit Indian number starting with 6, 7, 8, or 9.')
      return
    }

    // 3. MANDATORY VALIDATION: Vehicle Condition must be explicitly selected
    if (vehicleCondition === null) {
      setFormError('Please select Vehicle Condition (Used Car or New Car).')
      return
    }

    // 4. Conditional Vehicle Registration validation
    if (vehicleCondition === 'used' && !vehicleRegNo.trim()) {
      setFormError('Vehicle Registration Number is mandatory for Used Car leads.')
      return
    }

    // 5. Loan Amount validation
    const numAmount = Number(loanAmount)
    if (!numAmount || numAmount < 10000) {
      setFormError('Requested Loan Amount must be at least ₹10,000.')
      return
    }

    // 6. Mandatory KYC Documents (Aadhaar & PAN)
    if (!aadhaarDocId) {
      setFormError('Aadhaar Card is mandatory for every lead submission. Please attach Aadhaar.')
      return
    }
    if (!panDocId) {
      setFormError('PAN Card is mandatory for every lead submission. Please attach PAN Card.')
      return
    }

    // 7. Conditional RC Document (Only for Used Car)
    if (vehicleCondition === 'used' && !rcDocId) {
      setFormError('RC Book is mandatory for Used Car loan applications. Please upload RC copy.')
      return
    }

    setIsSubmitting(true)
    try {
      const payload: Record<string, any> = {
        partner_mobile: partnerMobile,
        partner_name: partnerName.trim(),
        org_slug: orgSlug || 'jai-automobiles',
        applicant_name: applicantName.trim(),
        applicant_mobile: applicantMobile,
        product_type: vehicleCondition === 'new' ? 'new_car' : 'used_car',
        loan_amount_requested: numAmount,
        pincode,
        city: city.trim(),
        state: state.trim(),
        vehicle_condition: vehicleCondition,
        aadhaar_doc_id: aadhaarDocId,
        pan_doc_id: panDocId,
      }

      // Strictly include registration and RC ONLY when vehicleCondition is 'used'
      if (vehicleCondition === 'used') {
        payload.vehicle_reg_no = vehicleRegNo.trim()
        payload.rc_doc_id = rcDocId
      }

      const res = await api.post<{
        case_no: string
        case_id: string
        tracking_id?: string
        message: string
      }>('/referrals/guest-submit', payload)

      if (res && res.case_no) {
        setSubmitResult({
          case_no: res.case_no,
          case_id: res.case_id,
          tracking_id: res.tracking_id,
          message: res.message,
        })
        setStep(3)
      }
    } catch (err: unknown) {
      const msg =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
          ? err.message
          : 'Lead submission failed. Please verify your entries and try again.'
      setFormError(msg)
    } finally {
      setIsSubmitting(false)
    }
  }

  // Reset form for submitting another lead
  const handleResetForNextLead = () => {
    setApplicantName('')
    setApplicantMobile('')
    setVehicleCondition(null) // Reset to unselected initial state!
    setVehicleRegNo('')
    setLoanType('car')
    setLoanAmount('850000')
    setSelectedPreset(850000)
    setPincode('400001')
    setCity('Mumbai')
    setState('Maharashtra')
    setStateShort('MH')
    setAadhaarFile(null)
    setAadhaarDocId('doc-init-aadhaar-01')
    setAadhaarFileName('aadhaar_front_back.pdf (1.2 MB)')
    setPanFile(null)
    setPanDocId('doc-init-pan-01')
    setPanFileName('pan_card_copy.jpg (840 KB)')
    setRcFile(null)
    setRcDocId(null)
    setRcFileName('')
    setFormError(null)
    setUploadErrors({})
    setSubmitResult(null)
    setStep(2)
  }

  // Format amount for display in input
  const formatAmountDisplay = (val: string) => {
    if (!val) return '₹ 0'
    const n = Number(val)
    if (isNaN(n)) return `₹ ${val}`
    return `₹ ${n.toLocaleString('en-IN')}`
  }

  return (
    <div className="referral-app-viewport">
      <div className="referral-phone-frame">
        {/* ================================================================= */}
        {/* SCREEN 1: Mobile Number Entry & Partner Identification            */}
        {/* ================================================================= */}
        {step === 1 && (
          <div className="screen-1-container">
            {/* Top Brand Header */}
            <header className="screen-1-header">
              <div className="header-brand-group">
                <div className="header-car-circle" aria-hidden="true">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9C2.1 11 2 11.5 2 12v4c0 .6.4 1 1 1h2" />
                    <circle cx="7" cy="17" r="2" />
                    <path d="M9 17h6" />
                    <circle cx="17" cy="17" r="2" />
                  </svg>
                </div>
                <div className="header-brand-titles">
                  <span className="brand-primary-text">{branding.name}</span>
                  <span className="brand-subtitle-text">{branding.tagline}</span>
                </div>
              </div>
              <div className="portal-version-pill">
                <span className="version-dot">●</span>
                <span className="version-label">{branding.portal_version}</span>
              </div>
            </header>

            {/* Main Screen Title */}
            <h1 className="screen-1-title">Enter Mobile Number</h1>

            {/* Mobile Number Entry Card */}
            <div className="mobile-entry-card">
              <div className="mobile-card-top-row">
                <span className="mobile-card-label">Registered Partner Mobile</span>
                {partnerMobile.length === 10 && isValidIndianMobile(partnerMobile) && (
                  <span className="mobile-verified-tag">10/10 Verified</span>
                )}
                {partnerMobile.length > 0 && partnerMobile.length < 10 && (
                  <span className="mobile-counter-tag">{partnerMobile.length}/10</span>
                )}
              </div>

              <div className="mobile-input-row">
                <div className="country-code-pill">
                  <span className="country-code-text">IN +91</span>
                </div>

                <input
                  type="tel"
                  inputMode="numeric"
                  className="mobile-digits-input"
                  placeholder="98765 43210"
                  value={formatIndianMobileDisplay(partnerMobile)}
                  onChange={handleMobileInputChange}
                  maxLength={11} // 10 digits + 1 space
                  autoFocus
                  aria-label="Partner Mobile Number"
                />

                <div className="mobile-status-icon-wrapper">
                  {isCheckingMobile && (
                    <div className="lookup-spinner" title="Checking database..." />
                  )}
                  {!isCheckingMobile && hasLookupCompleted && isValidIndianMobile(partnerMobile) && (
                    <div className="verified-check-circle" title="Verified Mobile">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
                      </svg>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Error / Alert Banner */}
            {lookupError && (
              <div className="lookup-error-banner" role="alert">
                <span className="error-icon">⚠️</span>
                <span className="error-text">{lookupError}</span>
                {lookupError.includes('Database') && (
                  <button
                    type="button"
                    className="retry-lookup-btn"
                    onClick={() => initiateLookup(partnerMobile)}
                  >
                    Retry
                  </button>
                )}
              </div>
            )}

            {/* Registered Partner Card (when registered partner identified) */}
            {hasLookupCompleted && isExistingPartner && partnerName && (
              <div className="partner-verified-card">
                <div className="partner-badge-circle">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    <path d="M9 12l2 2 4-4" />
                  </svg>
                </div>
                <span className="partner-identified-name">{partnerName}</span>
              </div>
            )}

            {/* Unregistered Partner Name Input (when 10 digits valid but not registered) */}
            {hasLookupCompleted && !isExistingPartner && !isCheckingMobile && (
              <div className="new-partner-name-card">
                <label className="new-partner-label" htmlFor="new-partner-input">
                  Your Full Name (New Partner) *
                </label>
                <input
                  id="new-partner-input"
                  type="text"
                  className="new-partner-input"
                  placeholder="e.g. Vikram Sharma"
                  value={partnerName}
                  onChange={(e) => setPartnerName(e.target.value)}
                  autoFocus
                />
                <span className="new-partner-hint">
                  Enter your name to register as a partner. Profile will be created upon Continue.
                </span>
              </div>
            )}

            {/* Continue Button */}
            <div className="screen-1-action-wrapper">
              <button
                type="button"
                className="continue-pill-button"
                disabled={
                  isCheckingMobile ||
                  !isValidIndianMobile(partnerMobile) ||
                  (!isExistingPartner && partnerName.trim().length < 2)
                }
                onClick={handleContinueFromScreen1}
              >
                <span>{isCheckingMobile ? 'Verifying...' : 'Continue'}</span>
                <span className="btn-arrow-icon">→</span>
              </button>
            </div>

            {/* Footer Trust Bar */}
            <footer className="screen-1-footer">
              <div className="footer-lock-row">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                <span>Encrypted Dealership Terminal</span>
              </div>
              <div className="footer-company-row">
                <span>Jai Automobiles Financial Services</span>
              </div>
            </footer>
          </div>
        )}

        {/* ================================================================= */}
        {/* SCREEN 2: Customer Lead Submission Form                          */}
        {/* ================================================================= */}
        {step === 2 && (
          <div className="screen-2-container">
            {/* Top Navigation Bar */}
            <header className="screen-2-nav">
              <button
                type="button"
                className="nav-back-button"
                onClick={() => setStep(1)}
                aria-label="Back to mobile number entry"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 12H5M12 19l-7-7 7-7" />
                </svg>
              </button>

              <div className="nav-brand-center">
                <div className="nav-logo-row">
                  <div className="nav-car-mini" aria-hidden="true">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z" />
                    </svg>
                  </div>
                  <span className="nav-brand-title">Jai Automobiles</span>
                  <span className="nav-partner-badge">PARTNER DESK</span>
                </div>
                <span className="nav-sub-title">Submit Referral</span>
              </div>

              <div className="nav-avatar-circle" aria-label="Partner account">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              </div>
            </header>

            {/* Partner Attribution Banner */}
            <div className="partner-status-strip">
              <div className="partner-strip-left">
                <div className="partner-strip-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" transform="rotate(45 12 12)" />
                    <path d="M9 12l2 2 4-4" />
                  </svg>
                </div>
                <div className="partner-strip-text">
                  <span className="partner-text-label">Partner: </span>
                  <span className="partner-text-name">{partnerName || 'Partner'}</span>
                </div>
              </div>
              <button
                type="button"
                className="partner-strip-edit"
                onClick={() => setStep(1)}
              >
                Edit
              </button>
            </div>

            {/* Stepper Title */}
            <div className="lead-submission-heading">
              <span className="step-number-badge">❶</span>
              <h2 className="step-title-text">New Lead Submission</h2>
            </div>

            {/* Form Validation Banner */}
            {formError && (
              <div className="form-error-banner" role="alert">
                <span className="error-icon">⚠️</span>
                <span>{formError}</span>
              </div>
            )}

            <form noValidate onSubmit={handleSubmitLead} className="lead-intake-form">
              {/* SECTION 1: CUSTOMER DETAILS */}
              <div className="lead-card-section">
                <div className="section-title-row">
                  <div className="section-heading-group">
                    <span className="section-icon">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="4" width="18" height="16" rx="3" />
                        <circle cx="9" cy="10" r="2" />
                        <path d="M15 8h2M15 12h2M7 16h10" />
                      </svg>
                    </span>
                    <span className="section-heading-text">1. CUSTOMER DETAILS</span>
                  </div>
                  <span className="kyc-badge">KYC Base</span>
                </div>

                {/* Customer Full Name */}
                <div className="field-group">
                  <label className="field-label" htmlFor="applicant-name">
                    Customer Full Name <span className="req-star">*</span>
                  </label>
                  <div className="field-input-wrapper">
                    <input
                      id="applicant-name"
                      type="text"
                      className="text-input"
                      placeholder="Vikramaditya Rathore"
                      value={applicantName}
                      onChange={(e) => setApplicantName(e.target.value)}
                      required
                    />
                    {applicantName.trim().length >= 2 && (
                      <span className="field-check-icon">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="#059669">
                          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
                        </svg>
                      </span>
                    )}
                  </div>
                </div>

                {/* Customer Mobile Number */}
                <div className="field-group">
                  <label className="field-label" htmlFor="applicant-mobile">
                    Customer Mobile Number <span className="req-star">*</span>
                  </label>
                  <div className="customer-phone-input-row">
                    <div className="country-code-pill-sm">
                      <span>IN +91</span>
                    </div>
                    <input
                      id="applicant-mobile"
                      type="tel"
                      inputMode="numeric"
                      className="text-input phone-digits"
                      placeholder="9820145692"
                      value={applicantMobile}
                      onChange={(e) => setApplicantMobile(normalizeIndianMobile(e.target.value))}
                      maxLength={10}
                      required
                    />
                  </div>
                </div>
              </div>

              {/* SECTION 2: VEHICLE & LOAN DETAILS */}
              <div className="lead-card-section">
                <div className="section-title-row">
                  <div className="section-heading-group">
                    <span className="section-icon">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9C2.1 11 2 11.5 2 12v4c0 .6.4 1 1 1h2" />
                        <circle cx="7" cy="17" r="2" />
                        <path d="M9 17h6" />
                        <circle cx="17" cy="17" r="2" />
                      </svg>
                    </span>
                    <span className="section-heading-text">2. VEHICLE & LOAN DETAILS</span>
                  </div>
                </div>

                {/* Vehicle Condition: MANDATORY UNSELECTED INITIAL STATE */}
                <div className="field-group">
                  <label className="field-label">
                    Vehicle Condition <span className="req-star">*</span>
                  </label>
                  <div className="vehicle-condition-segmented-control" role="radiogroup" aria-label="Vehicle Condition">
                    <button
                      type="button"
                      role="radio"
                      aria-checked={vehicleCondition === 'used'}
                      className={`condition-pill-button ${vehicleCondition === 'used' ? 'selected' : ''}`}
                      onClick={() => handleSelectVehicleCondition('used')}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                        <path d="M9 12l2 2 4-4" />
                      </svg>
                      <span>Used Car</span>
                    </button>

                    <button
                      type="button"
                      role="radio"
                      aria-checked={vehicleCondition === 'new'}
                      className={`condition-pill-button ${vehicleCondition === 'new' ? 'selected' : ''}`}
                      onClick={() => handleSelectVehicleCondition('new')}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="2" y="7" width="20" height="12" rx="2" />
                        <circle cx="7" cy="17" r="2" />
                        <circle cx="17" cy="17" r="2" />
                      </svg>
                      <span>New Car</span>
                    </button>
                  </div>
                </div>

                {/* CONDITIONAL: Vehicle Registration Number (ONLY RENDERED FOR USED CAR) */}
                {vehicleCondition === 'used' && (
                  <div className="field-group conditional-slide-down">
                    <label className="field-label" htmlFor="vehicle-reg-no">
                      Vehicle Registration Number <span className="req-star">*</span>
                    </label>
                    <div className="field-input-wrapper">
                      <input
                        id="vehicle-reg-no"
                        type="text"
                        className="text-input uppercase-text"
                        placeholder="MH 02 CK 4821"
                        value={vehicleRegNo}
                        onChange={(e) => setVehicleRegNo(e.target.value.toUpperCase())}
                        required={vehicleCondition === 'used'}
                      />
                      {vehicleRegNo.trim().length >= 6 && (
                        <span className="field-check-icon">
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="#059669">
                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
                          </svg>
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Loan Type */}
                <div className="field-group">
                  <label className="field-label">
                    Loan Type <span className="req-star">*</span>
                  </label>
                  <div className="loan-types-grid">
                    <button
                      type="button"
                      className={`loan-type-chip ${loanType === 'car' ? 'selected' : ''}`}
                      onClick={() => setLoanType('car')}
                    >
                      <span className="chip-icon">🚗</span>
                      <span>Car</span>
                    </button>
                    <button
                      type="button"
                      className={`loan-type-chip ${loanType === 'cv' ? 'selected' : ''}`}
                      onClick={() => setLoanType('cv')}
                    >
                      <span className="chip-icon">🚚</span>
                      <span>CV</span>
                    </button>
                    <button
                      type="button"
                      className={`loan-type-chip ${loanType === 'tractor' ? 'selected' : ''}`}
                      onClick={() => setLoanType('tractor')}
                    >
                      <span className="chip-icon">🚜</span>
                      <span>Tractor</span>
                    </button>
                    <button
                      type="button"
                      className={`loan-type-chip ${loanType === 'two_wheeler' ? 'selected' : ''}`}
                      onClick={() => setLoanType('two_wheeler')}
                    >
                      <span className="chip-icon">🏍️</span>
                      <span>Two Wheeler</span>
                    </button>
                  </div>
                </div>

                {/* Requested Loan Amount */}
                <div className="field-group">
                  <label className="field-label" htmlFor="loan-amount">
                    Requested Loan Amount <span className="req-star">*</span>
                  </label>
                  <div className="amount-input-card">
                    <input
                      id="loan-amount"
                      type="text"
                      className="amount-text-field"
                      value={formatAmountDisplay(loanAmount)}
                      onChange={handleLoanAmountChange}
                      required
                    />
                  </div>

                  {/* Preset Pills */}
                  <div className="amount-presets-scroll">
                    {[
                      { label: '₹3L', val: 300000 },
                      { label: '₹5L', val: 500000 },
                      { label: '₹8.5L', val: 850000 },
                      { label: '₹10L', val: 1000000 },
                      { label: '₹15L', val: 1500000 },
                    ].map((preset) => {
                      const isSel = selectedPreset === preset.val
                      return (
                        <button
                          key={preset.val}
                          type="button"
                          className={`amount-preset-pill ${isSel ? 'selected' : ''}`}
                          onClick={() => handleSelectPreset(preset.val)}
                        >
                          {preset.label}
                          {isSel ? ' (Selected)' : ''}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Dealer / Customer PIN Code */}
                <div className="field-group">
                  <label className="field-label" htmlFor="customer-pincode">
                    Dealer / Customer PIN Code <span className="req-star">*</span>
                  </label>
                  <div className="pincode-city-row">
                    <div className="pincode-input-col">
                      <input
                        id="customer-pincode"
                        type="text"
                        inputMode="numeric"
                        className="text-input"
                        placeholder="400001"
                        value={pincode}
                        onChange={handlePincodeChange}
                        maxLength={6}
                        required
                      />
                    </div>

                    <div className="city-state-card-col">
                      <div className="city-icon">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="4" width="18" height="18" rx="2" />
                          <path d="M16 2v4M8 2v4M3 10h18" />
                        </svg>
                      </div>
                      <div className="city-text-stack">
                        <span className="city-label">CITY & STATE</span>
                        <span className="city-value">{city}, {stateShort}</span>
                      </div>
                      <span className="city-auto-badge">Auto</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* SECTION 3: DOCUMENT UPLOADS */}
              <div className="lead-card-section">
                <div className="section-title-row">
                  <div className="section-heading-group">
                    <span className="section-icon">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" />
                        <path d="M12 12v9" />
                        <path d="m16 16-4-4-4 4" />
                      </svg>
                    </span>
                    <span className="section-heading-text">3. DOCUMENT UPLOADS</span>
                  </div>
                </div>

                {/* Hidden File Inputs */}
                <input
                  ref={aadhaarInputRef}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  className="hidden-file-input"
                  onChange={(e) => handleFileUpload(e.target.files?.[0] || null, 'aadhaar')}
                />
                <input
                  ref={panInputRef}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  className="hidden-file-input"
                  onChange={(e) => handleFileUpload(e.target.files?.[0] || null, 'pan')}
                />
                <input
                  ref={rcInputRef}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  className="hidden-file-input"
                  onChange={(e) => handleFileUpload(e.target.files?.[0] || null, 'rc')}
                />

                {/* Aadhaar Card (Mandatory for all leads) */}
                <div className="doc-item-card">
                  <div className="doc-item-left">
                    <div className="doc-icon-square">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="4" width="18" height="16" rx="3" />
                        <circle cx="9" cy="10" r="2" />
                        <path d="M15 8h2M15 12h2M7 16h10" />
                      </svg>
                    </div>
                    <div className="doc-info-stack">
                      <div className="doc-title-row">
                        <span className="doc-title">Aadhaar Card <span className="req-star">*</span></span>
                        {aadhaarDocId && (
                          <svg className="doc-verified-check" width="16" height="16" viewBox="0 0 24 24" fill="#059669">
                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
                          </svg>
                        )}
                      </div>
                      <span className="doc-filename-text">
                        {uploadingDoc === 'aadhaar'
                          ? 'Uploading to secure quarantine...'
                          : aadhaarFileName || 'Tap to scan or attach Aadhaar (PDF/JPG)'}
                      </span>
                      {uploadErrors.aadhaar && (
                        <span className="doc-upload-error">{uploadErrors.aadhaar}</span>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="doc-action-btn"
                    onClick={() => aadhaarInputRef.current?.click()}
                  >
                    {aadhaarDocId ? 'Replace' : 'Upload'}
                  </button>
                </div>

                {/* PAN Card (Mandatory for all leads) */}
                <div className="doc-item-card">
                  <div className="doc-item-left">
                    <div className="doc-icon-square">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="2" y="5" width="20" height="14" rx="2" />
                        <line x1="2" y1="10" x2="22" y2="10" />
                      </svg>
                    </div>
                    <div className="doc-info-stack">
                      <div className="doc-title-row">
                        <span className="doc-title">PAN Card <span className="req-star">*</span></span>
                        {panDocId && (
                          <svg className="doc-verified-check" width="16" height="16" viewBox="0 0 24 24" fill="#059669">
                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
                          </svg>
                        )}
                      </div>
                      <span className="doc-filename-text">
                        {uploadingDoc === 'pan'
                          ? 'Uploading to secure quarantine...'
                          : panFileName || 'Tap to scan or attach PAN card (PDF/JPG)'}
                      </span>
                      {uploadErrors.pan && (
                        <span className="doc-upload-error">{uploadErrors.pan}</span>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="doc-action-btn"
                    onClick={() => panInputRef.current?.click()}
                  >
                    {panDocId ? 'Replace' : 'Upload'}
                  </button>
                </div>

                {/* CONDITIONAL: RC Book (Registration Certificate) - ONLY FOR USED CAR */}
                {vehicleCondition === 'used' && (
                  <div className="rc-doc-wrapper conditional-slide-down">
                    <div className="rc-header-row">
                      <span className="rc-title-text">RC Book (Registration Certificate)</span>
                      <div className="rc-mandatory-badge">
                        <span className="rc-star">*</span>
                        <span>Mandatory for Used Car</span>
                      </div>
                    </div>

                    {!rcDocId ? (
                      <div
                        className="rc-upload-dropzone"
                        role="button"
                        tabIndex={0}
                        onClick={() => rcInputRef.current?.click()}
                        onKeyDown={(e) => e.key === 'Enter' && rcInputRef.current?.click()}
                      >
                        <div className="camera-icon-circle">
                          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1f2937" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                            <circle cx="12" cy="13" r="4" />
                          </svg>
                        </div>
                        <span className="rc-prompt-bold">Tap to scan RC or browse file</span>
                        <span className="rc-prompt-sub">Supports PDF, JPG, PNG up to 10MB</span>
                        {uploadingDoc === 'rc' && (
                          <div className="lookup-spinner" style={{ margin: '8px auto 0' }} />
                        )}
                        {uploadErrors.rc && (
                          <span className="doc-upload-error">{uploadErrors.rc}</span>
                        )}
                      </div>
                    ) : (
                      <div className="doc-item-card">
                        <div className="doc-item-left">
                          <div className="doc-icon-square">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="3" y="4" width="18" height="16" rx="3" />
                              <path d="M7 8h10M7 12h10M7 16h6" />
                            </svg>
                          </div>
                          <div className="doc-info-stack">
                            <div className="doc-title-row">
                              <span className="doc-title">Vehicle RC Copy</span>
                              <svg className="doc-verified-check" width="16" height="16" viewBox="0 0 24 24" fill="#059669">
                                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
                              </svg>
                            </div>
                            <span className="doc-filename-text">{rcFileName}</span>
                          </div>
                        </div>
                        <button
                          type="button"
                          className="doc-action-btn"
                          onClick={() => rcInputRef.current?.click()}
                        >
                          Replace
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Submit Lead Button */}
              <div className="submit-action-wrapper">
                <button
                  type="submit"
                  className="submit-lead-pill-button"
                  disabled={isSubmitting}
                >
                  <span>{isSubmitting ? 'Submitting Lead...' : 'Submit Lead'}</span>
                  <span className="btn-arrow-icon">→</span>
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ================================================================= */}
        {/* SCREEN 3: Submission Success Confirmation                        */}
        {/* ================================================================= */}
        {step === 3 && submitResult && (
          <div className="screen-3-container">
            <div className="success-icon-large">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="#059669">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
              </svg>
            </div>

            <h2 className="success-heading">Lead Successfully Submitted!</h2>
            <p className="success-subtext">
              The loan lead has been registered in the operations queue with verified referral attribution.
            </p>

            <div className="confirmation-dossier-card">
              <div className="dossier-row">
                <span className="dossier-label">Case Number</span>
                <span className="dossier-value bold-num">{submitResult.case_no}</span>
              </div>
              {submitResult.tracking_id && (
                <div className="dossier-row">
                  <span className="dossier-label">Tracking ID</span>
                  <span className="dossier-value monospace">{submitResult.tracking_id}</span>
                </div>
              )}
              <div className="dossier-row">
                <span className="dossier-label">Referral Partner</span>
                <span className="dossier-value">{partnerName}</span>
              </div>
              <div className="dossier-row">
                <span className="dossier-label">Borrower</span>
                <span className="dossier-value">{applicantName}</span>
              </div>
              <div className="dossier-row">
                <span className="dossier-label">Vehicle Condition</span>
                <span className="dossier-value capitalize">{vehicleCondition === 'used' ? 'Used Car' : 'New Car'}</span>
              </div>
              <div className="dossier-row">
                <span className="dossier-label">Loan Amount</span>
                <span className="dossier-value">{formatAmountDisplay(loanAmount)}</span>
              </div>
            </div>

            <div className="success-action-buttons">
              <button
                type="button"
                className="submit-lead-pill-button"
                onClick={handleResetForNextLead}
              >
                <span>Submit Another Lead</span>
                <span className="btn-arrow-icon">→</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
