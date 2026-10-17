import { useState, useEffect, useRef, FormEvent, ChangeEvent } from 'react'
import { useParams } from 'react-router-dom'
import { api, ApiError } from '../../shared/lib/api'
import {
  normalizeIndianMobile,
  isValidIndianMobile,
  formatIndianMobileDisplay,
} from '../../shared/lib/validators'
import { lookupIndianPincode, isValidIndianPincode } from '../../shared/lib/pincodeService'
import { Language, REFERRAL_TRANSLATIONS } from './translations'
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

export function GuestReferralPage() {
  const { orgSlug } = useParams<{ orgSlug?: string }>()

  // ---------------------------------------------------------------------------
  // Localization: English (default) & हिन्दी
  // ---------------------------------------------------------------------------
  const [language, setLanguage] = useState<Language>(() => {
    try {
      const saved = localStorage.getItem('dsa_referral_portal_lang')
      return saved === 'hi' ? 'hi' : 'en'
    } catch {
      return 'en'
    }
  })

  const t = REFERRAL_TRANSLATIONS[language]

  const handleLanguageChange = (lang: Language) => {
    setLanguage(lang)
    try {
      localStorage.setItem('dsa_referral_portal_lang', lang)
    } catch {
      // Ignore storage restrictions
    }
  }

  // Organization branding
  const [branding, setBranding] = useState<OrgBranding>({
    name: 'Jai Automobiles',
    tagline: 'PARTNER REFERRAL NETWORK',
    logo_url: '/jai_auto_logo.jpg',
    portal_version: 'Portal v2.5',
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
  // Screen 2: Customer Lead Intake State (Exact Section Order 1 to 6)
  // ---------------------------------------------------------------------------
  // 1. Customer Details
  const [applicantName, setApplicantName] = useState('')
  const [applicantMobile, setApplicantMobile] = useState('')

  // 2. Loan Type (Moved above Vehicle Condition)
  const [loanType, setLoanType] = useState<'car' | 'cv' | 'tractor' | 'two_wheeler'>('car')

  // 3. Vehicle & Loan Details
  const [loanAmount, setLoanAmount] = useState('850000')
  const [selectedPreset, setSelectedPreset] = useState<number | null>(850000)
  const [pincode, setPincode] = useState('400001')
  const [locality, setLocality] = useState('Fort')
  const [district, setDistrict] = useState('Mumbai')
  const [city, setCity] = useState('Mumbai')
  const [state, setState] = useState('Maharashtra')
  const [stateShort, setStateShort] = useState('MH')
  const [isLookingUpPincode, setIsLookingUpPincode] = useState(false)
  const [pincodeError, setPincodeError] = useState<string | null>(null)
  const [isEditingLocationManually, setIsEditingLocationManually] = useState(false)
  const pincodeAbortRef = useRef<AbortController | null>(null)

  // 4. Expected Loan Required Date (New subsection after Vehicle & Loan Details)
  // Default to 14 days in future for realistic workflow
  const defaultFutureDate = () => {
    const d = new Date()
    d.setDate(d.getDate() + 14)
    return d.toISOString().split('T')[0]
  }
  const [expectedLoanRequiredDate, setExpectedLoanRequiredDate] = useState<string>(defaultFutureDate)

  // 5. Vehicle Condition (Moved to immediately above Document Uploads)
  // MANDATORY REQUIREMENT: Neither Used Car nor New Car must be selected initially!
  const [vehicleCondition, setVehicleCondition] = useState<'used' | 'new' | null>(null)
  // Conditional Registration Number (Only for Used Car)
  const [vehicleRegNo, setVehicleRegNo] = useState('')

  // 6. Document Uploads (FINAL section: Aadhaar, PAN, and conditional RC)
  // MANDATORY REQUIREMENT: Zero sample documents prefilled! Starts with no files.
  const [, setAadhaarFile] = useState<File | null>(null)
  const [aadhaarDocId, setAadhaarDocId] = useState<string | null>(null)
  const [aadhaarFileName, setAadhaarFileName] = useState<string>('')

  const [, setPanFile] = useState<File | null>(null)
  const [panDocId, setPanDocId] = useState<string | null>(null)
  const [panFileName, setPanFileName] = useState<string>('')

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
          tagline: t.portalTagline,
          logo_url: '/jai_auto_logo.jpg',
          portal_version: 'Portal v2.5',
        })
      } else if (orgSlug.includes('nishant')) {
        setBranding({
          name: 'Nishant Automobiles',
          tagline: t.portalTagline,
          logo_url: '/jai_auto_logo.jpg',
          portal_version: 'Portal v2.5',
        })
      }
    }
  }, [orgSlug, t.portalTagline])

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
          : t.dbUnavailableRetry
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

    if (normalized.length === 10) {
      if (!isValidIndianMobile(normalized)) {
        setLookupError(t.mobileStartError)
        setHasLookupCompleted(false)
        return
      }
      initiateLookup(normalized)
    }
  }

  const handleContinueFromScreen1 = () => {
    if (!isValidIndianMobile(partnerMobile)) {
      setLookupError(t.enterValidMobileError)
      return
    }
    if (!hasLookupCompleted) {
      initiateLookup(partnerMobile)
      return
    }
    if (!isExistingPartner && !partnerName.trim()) {
      setLookupError(t.enterPartnerNameError)
      return
    }
    setLookupError(null)
    setStep(2)
  }

  // ===========================================================================
  // SCREEN 2: Customer Lead Intake & Conditional Handlers
  // ===========================================================================

  // Vehicle condition selector: strictly enforce switching logic
  const handleSelectVehicleCondition = (condition: 'used' | 'new') => {
    setVehicleCondition(condition)
    setFormError(null)

    if (condition === 'new') {
      // Switching to New Car hides registration & RC, and clears them
      setVehicleRegNo('')
      setRcFile(null)
      setRcDocId(null)
      setRcFileName('')
    } else if (condition === 'used') {
      // Switching to Used Car requires registration number & RC
      setVehicleRegNo('')
      setRcFile(null)
      setRcDocId(null)
      setRcFileName('')
    }
  }

  // PIN Code input with resilient API + Directory + Prefix fallback
  const handlePincodeChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, '').slice(0, 6)
    setPincode(val)
    setPincodeError(null)

    // Cancel in-flight lookup if user modifies PIN
    if (pincodeAbortRef.current) {
      pincodeAbortRef.current.abort()
      pincodeAbortRef.current = null
    }

    if (val.length < 6) {
      setIsLookingUpPincode(false)
      return
    }

    if (val.length === 6) {
      if (!isValidIndianPincode(val)) {
        setPincodeError(t.pincodeInvalidError)
        return
      }

      const controller = new AbortController()
      pincodeAbortRef.current = controller
      setIsLookingUpPincode(true)

      try {
        const result = await lookupIndianPincode(val, controller.signal)
        if (controller.signal.aborted) return

        if (result) {
          setLocality(result.locality)
          setDistrict(result.district)
          setCity(result.city)
          setState(result.state)
          setStateShort(result.stateShort)
          setPincodeError(null)
        } else {
          setPincodeError(t.pincodeLookupError)
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') return
        setPincodeError(t.pincodeLookupError)
      } finally {
        if (!controller.signal.aborted) {
          setIsLookingUpPincode(false)
        }
      }
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
        [docType]: t.uploadTypeError,
      }))
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setUploadErrors((prev) => ({
        ...prev,
        [docType]: t.uploadSizeError,
      }))
      return
    }

    setUploadingDoc(docType)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('doc_type', docType)
      formData.append('file_name', file.name)
      formData.append('file_size', String(file.size))
      if (orgSlug) formData.append('org_slug', orgSlug)

      const res = await api.post<{
        document_id: string
        file_name?: string
        file_size?: number
      }>('/referrals/upload-document', formData)

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

  // Date range constraints for Expected Loan Required Date
  const todayObj = new Date()
  const minDateStr = todayObj.toISOString().split('T')[0]
  const oneYearFutureObj = new Date()
  oneYearFutureObj.setFullYear(oneYearFutureObj.getFullYear() + 1)
  const maxDateStr = oneYearFutureObj.toISOString().split('T')[0]

  // Final Form Submission
  const handleSubmitLead = async (e: FormEvent) => {
    e.preventDefault()
    setFormError(null)

    // 1. Validate Customer Name
    if (!applicantName.trim()) {
      setFormError(t.formErrorCustomerName)
      return
    }

    // 2. Validate Customer Mobile
    if (!isValidIndianMobile(applicantMobile)) {
      setFormError(t.formErrorCustomerMobile)
      return
    }

    // 3. Validate Loan Amount
    const numAmount = Number(loanAmount)
    if (!numAmount || numAmount < 10000) {
      setFormError(t.formErrorLoanAmount)
      return
    }

    // 4. Validate Expected Loan Required Date
    if (!expectedLoanRequiredDate) {
      setFormError(t.dateRequiredError)
      return
    }
    const chosenDate = new Date(expectedLoanRequiredDate)
    const todayMidnight = new Date()
    todayMidnight.setHours(0, 0, 0, 0)
    if (chosenDate < todayMidnight) {
      setFormError(t.datePastError)
      return
    }
    if (chosenDate > oneYearFutureObj) {
      setFormError(t.dateFutureLimitError)
      return
    }

    // 5. MANDATORY VALIDATION: Vehicle Condition must be explicitly selected
    if (vehicleCondition === null) {
      setFormError(t.formErrorVehicleCondition)
      return
    }

    // Conditional Vehicle Registration validation (for Used Car)
    if (vehicleCondition === 'used' && !vehicleRegNo.trim()) {
      setFormError(t.formErrorVehicleRegNo)
      return
    }

    // 6. Mandatory KYC Documents (Aadhaar & PAN)
    if (!aadhaarDocId) {
      setFormError(t.formErrorAadhaar)
      return
    }
    if (!panDocId) {
      setFormError(t.formErrorPan)
      return
    }

    // Conditional RC Document (Only for Used Car)
    if (vehicleCondition === 'used' && !rcDocId) {
      setFormError(t.formErrorRc)
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
        loan_type: loanType,
        product_type: vehicleCondition === 'new' ? 'new_car' : 'used_car',
        loan_amount_requested: numAmount,
        pincode,
        locality: locality.trim(),
        district: district.trim(),
        city: city.trim(),
        state: state.trim(),
        expected_loan_required_date: expectedLoanRequiredDate,
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
          : t.submissionFailedGeneric
      setFormError(msg)
    } finally {
      setIsSubmitting(false)
    }
  }

  // Reset form for submitting another lead
  const handleResetForNextLead = () => {
    setApplicantName('')
    setApplicantMobile('')
    setLoanType('car')
    setLoanAmount('850000')
    setSelectedPreset(850000)
    setPincode('400001')
    setLocality('Fort')
    setDistrict('Mumbai')
    setCity('Mumbai')
    setState('Maharashtra')
    setStateShort('MH')
    setIsEditingLocationManually(false)
    setExpectedLoanRequiredDate(defaultFutureDate())
    setVehicleCondition(null) // Unselected initial state!
    setVehicleRegNo('')
    setAadhaarFile(null)
    setAadhaarDocId(null)
    setAadhaarFileName('')
    setPanFile(null)
    setPanDocId(null)
    setPanFileName('')
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
        {/* Top Floating Language Switcher                                   */}
        {/* ================================================================= */}
        <div className="referral-lang-bar">
          <div className="lang-switcher-pill" role="group" aria-label={t.selectLanguage}>
            <button
              type="button"
              className={`lang-option-btn ${language === 'en' ? 'active' : ''}`}
              onClick={() => handleLanguageChange('en')}
            >
              English
            </button>
            <span className="lang-divider" aria-hidden="true">|</span>
            <button
              type="button"
              className={`lang-option-btn ${language === 'hi' ? 'active' : ''}`}
              onClick={() => handleLanguageChange('hi')}
            >
              हिन्दी
            </button>
          </div>
        </div>

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
                  <span className="brand-subtitle-text">{t.portalTagline}</span>
                </div>
              </div>
              <div className="portal-version-pill">
                <span className="version-dot">●</span>
                <span className="version-label">{branding.portal_version}</span>
              </div>
            </header>

            {/* Main Screen Title */}
            <h1 className="screen-1-title">{t.enterMobileNumber}</h1>

            {/* Mobile Number Entry Card */}
            <div className="mobile-entry-card">
              <div className="mobile-card-top-row">
                <span className="mobile-card-label">{t.registeredPartnerMobile}</span>
                {partnerMobile.length === 10 && isValidIndianMobile(partnerMobile) && (
                  <span className="mobile-verified-tag">{t.tenOfTenVerified}</span>
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
                  maxLength={11}
                  autoFocus
                  aria-label={t.registeredPartnerMobile}
                />

                <div className="mobile-status-icon-wrapper">
                  {isCheckingMobile && (
                    <div className="lookup-spinner" title={t.checkingDatabase} />
                  )}
                  {!isCheckingMobile && hasLookupCompleted && isValidIndianMobile(partnerMobile) && (
                    <div className="verified-check-circle" title={t.verifiedMobile}>
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
                    {t.retry}
                  </button>
                )}
              </div>
            )}

            {/* Registered Partner Card */}
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

            {/* Unregistered Partner Name Input */}
            {hasLookupCompleted && !isExistingPartner && !isCheckingMobile && (
              <div className="new-partner-name-card">
                <label className="new-partner-label" htmlFor="new-partner-input">
                  {t.yourFullNameNewPartner}
                </label>
                <input
                  id="new-partner-input"
                  type="text"
                  className="new-partner-input"
                  placeholder={t.newPartnerPlaceholder}
                  value={partnerName}
                  onChange={(e) => setPartnerName(e.target.value)}
                  autoFocus
                />
                <span className="new-partner-hint">
                  {t.newPartnerHint}
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
                <span>{isCheckingMobile ? t.verifying : t.continue}</span>
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
                <span>{t.encryptedTerminal}</span>
              </div>
              <div className="footer-company-row">
                <span>{t.financialServices}</span>
              </div>
            </footer>
          </div>
        )}

        {/* ================================================================= */}
        {/* SCREEN 2: Customer Lead Submission Form                          */}
        {/* Exact Order:                                                      */}
        {/* 1. Customer Details                                               */}
        {/* 2. Loan Type                                                      */}
        {/* 3. Vehicle & Loan Details                                         */}
        {/* 4. Expected Loan Required Date                                    */}
        {/* 5. Vehicle Condition                                              */}
        {/* 6. Document Uploads                                               */}
        {/* ================================================================= */}
        {step === 2 && (
          <div className="screen-2-container">
            {/* Top Navigation Bar */}
            <header className="screen-2-nav">
              <button
                type="button"
                className="nav-back-button"
                onClick={() => setStep(1)}
                aria-label={t.back}
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
                  <span className="nav-brand-title">{branding.name}</span>
                  <span className="nav-partner-badge">{t.partnerDesk}</span>
                </div>
                <span className="nav-sub-title">{t.submitReferral}</span>
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
                  <span className="partner-text-label">{t.partner}</span>
                  <span className="partner-text-name">{partnerName || 'Partner'}</span>
                </div>
              </div>
              <button
                type="button"
                className="partner-strip-edit"
                onClick={() => setStep(1)}
              >
                {t.edit}
              </button>
            </div>

            {/* Stepper Title */}
            <div className="lead-submission-heading">
              <span className="step-number-badge">❶</span>
              <h2 className="step-title-text">{t.newLeadSubmission}</h2>
            </div>

            {/* Form Validation Banner */}
            {formError && (
              <div className="form-error-banner" role="alert">
                <span className="error-icon">⚠️</span>
                <span>{formError}</span>
              </div>
            )}

            <form noValidate onSubmit={handleSubmitLead} className="lead-intake-form">
              {/* =========================================================== */}
              {/* SECTION 1: CUSTOMER DETAILS                                 */}
              {/* =========================================================== */}
              <div className="lead-card-section" data-section="customer-details">
                <div className="section-title-row">
                  <div className="section-heading-group">
                    <span className="section-icon">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="4" width="18" height="16" rx="3" />
                        <circle cx="9" cy="10" r="2" />
                        <path d="M15 8h2M15 12h2M7 16h10" />
                      </svg>
                    </span>
                    <span className="section-heading-text">{t.customerDetailsHeading}</span>
                  </div>
                  <span className="kyc-badge">{t.kycBase}</span>
                </div>

                {/* Customer Full Name */}
                <div className="field-group">
                  <label className="field-label" htmlFor="applicant-name">
                    {t.customerFullName} <span className="req-star">*</span>
                  </label>
                  <div className="field-input-wrapper">
                    <input
                      id="applicant-name"
                      type="text"
                      className="text-input"
                      placeholder={t.customerNamePlaceholder}
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
                    {t.customerMobileNumber} <span className="req-star">*</span>
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
                      placeholder={t.customerMobilePlaceholder}
                      value={applicantMobile}
                      onChange={(e) => setApplicantMobile(normalizeIndianMobile(e.target.value))}
                      maxLength={10}
                      required
                    />
                  </div>
                </div>
              </div>

              {/* =========================================================== */}
              {/* SECTION 2: LOAN TYPE (Moved above Vehicle Condition)         */}
              {/* =========================================================== */}
              <div className="lead-card-section" data-section="loan-type">
                <div className="section-title-row">
                  <div className="section-heading-group">
                    <span className="section-icon">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                      </svg>
                    </span>
                    <span className="section-heading-text">{t.loanTypeHeading}</span>
                  </div>
                </div>

                <div className="field-group">
                  <label className="field-label">
                    {t.loanTypeLabel} <span className="req-star">*</span>
                  </label>
                  <div className="loan-types-grid" role="radiogroup" aria-label={t.loanTypeLabel}>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={loanType === 'car'}
                      className={`loan-type-chip ${loanType === 'car' ? 'selected' : ''}`}
                      onClick={() => setLoanType('car')}
                    >
                      <span className="chip-icon">🚗</span>
                      <span>{t.car}</span>
                    </button>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={loanType === 'cv'}
                      className={`loan-type-chip ${loanType === 'cv' ? 'selected' : ''}`}
                      onClick={() => setLoanType('cv')}
                    >
                      <span className="chip-icon">🚚</span>
                      <span>{t.commercialVehicle}</span>
                    </button>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={loanType === 'tractor'}
                      className={`loan-type-chip ${loanType === 'tractor' ? 'selected' : ''}`}
                      onClick={() => setLoanType('tractor')}
                    >
                      <span className="chip-icon">🚜</span>
                      <span>{t.tractor}</span>
                    </button>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={loanType === 'two_wheeler'}
                      className={`loan-type-chip ${loanType === 'two_wheeler' ? 'selected' : ''}`}
                      onClick={() => setLoanType('two_wheeler')}
                    >
                      <span className="chip-icon">🏍️</span>
                      <span>{t.twoWheeler}</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* =========================================================== */}
              {/* SECTION 3: VEHICLE & LOAN DETAILS (Amount & Location)       */}
              {/* =========================================================== */}
              <div className="lead-card-section" data-section="vehicle-loan-details">
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
                    <span className="section-heading-text">{t.vehicleLoanDetailsHeading}</span>
                  </div>
                </div>

                {/* Requested Loan Amount */}
                <div className="field-group">
                  <label className="field-label" htmlFor="loan-amount">
                    {t.requestedLoanAmount} <span className="req-star">*</span>
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
                          {isSel ? t.presetSelected : ''}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Dealer / Customer PIN Code & Resilient Location Autofill */}
                <div className="field-group">
                  <label className="field-label" htmlFor="customer-pincode">
                    {t.dealerCustomerPincode} <span className="req-star">*</span>
                  </label>
                  <div className="pincode-city-row">
                    <div className="pincode-input-col">
                      <div className="pincode-field-wrapper">
                        <input
                          id="customer-pincode"
                          type="text"
                          inputMode="numeric"
                          className="text-input"
                          placeholder={t.pincodePlaceholder}
                          value={pincode}
                          onChange={handlePincodeChange}
                          maxLength={6}
                          required
                        />
                        {isLookingUpPincode && (
                          <div className="pincode-spinner" title={t.lookingUpLocation} />
                        )}
                      </div>
                    </div>

                    <div className="city-state-card-col">
                      <div className="city-icon">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="4" width="18" height="18" rx="2" />
                          <path d="M16 2v4M8 2v4M3 10h18" />
                        </svg>
                      </div>
                      <div className="city-text-stack">
                        <span className="city-label">{t.townDistrictStateLabel}</span>
                        <span
                          className="city-value"
                          title={`${locality ? `${locality}, ` : ''}${district ? `Dist: ${district}, ` : ''}${state}`}
                        >
                          {locality ? (
                            <>
                              <strong className="city-locality-bold">{locality}</strong>
                              {district ? `, Dist: ${district}` : ''}
                              {state ? `, ${state}` : stateShort ? `, ${stateShort}` : ''}
                            </>
                          ) : district ? (
                            <>
                              <strong>{district}</strong>
                              {state ? `, ${state}` : stateShort ? `, ${stateShort}` : ''}
                            </>
                          ) : (
                            <>
                              {city}
                              {state ? `, ${state}` : stateShort ? `, ${stateShort}` : ''}
                            </>
                          )}
                        </span>
                      </div>
                      <div className="city-actions-wrapper">
                        <span className="city-auto-badge">{t.autoBadge}</span>
                        <button
                          type="button"
                          className="city-manual-edit-btn"
                          onClick={() => setIsEditingLocationManually(!isEditingLocationManually)}
                        >
                          {isEditingLocationManually ? t.saveLocation : t.editLocation}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Manual Location Entry Override if lookup failed or user wishes to edit */}
                  {isEditingLocationManually && (
                    <div className="manual-location-inputs-row conditional-slide-down">
                      <div className="manual-col">
                        <label className="sub-field-label" htmlFor="manual-locality-input">{t.townLocalityLabel}</label>
                        <input
                          id="manual-locality-input"
                          type="text"
                          className="text-input text-input-sm"
                          value={locality}
                          onChange={(e) => {
                            setLocality(e.target.value)
                            setCity(e.target.value || district)
                          }}
                        />
                      </div>
                      <div className="manual-col">
                        <label className="sub-field-label" htmlFor="manual-district-input">{t.districtLabel}</label>
                        <input
                          id="manual-district-input"
                          aria-label={`${t.districtLabel} (${t.cityLabel})`}
                          type="text"
                          className="text-input text-input-sm"
                          value={district}
                          onChange={(e) => {
                            setDistrict(e.target.value)
                            if (!locality) setCity(e.target.value)
                          }}
                        />
                      </div>
                      <div className="manual-col">
                        <label className="sub-field-label" htmlFor="manual-state-input">{t.stateLabel}</label>
                        <input
                          id="manual-state-input"
                          type="text"
                          className="text-input text-input-sm"
                          value={state}
                          onChange={(e) => {
                            setState(e.target.value)
                            setStateShort(e.target.value.slice(0, 2).toUpperCase())
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {pincodeError && (
                    <div className="pincode-error-notice" role="alert">
                      <span>⚠️ {pincodeError}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* =========================================================== */}
              {/* SECTION 4: EXPECTED LOAN REQUIRED DATE (New Subsection)      */}
              {/* =========================================================== */}
              <div className="lead-card-section" data-section="expected-loan-date">
                <div className="section-title-row">
                  <div className="section-heading-group">
                    <span className="section-icon">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="4" width="18" height="18" rx="2" />
                        <line x1="16" y1="2" x2="16" y2="6" />
                        <line x1="8" y1="2" x2="8" y2="6" />
                        <line x1="3" y1="10" x2="21" y2="10" />
                      </svg>
                    </span>
                    <span className="section-heading-text">{t.expectedLoanRequiredDateHeading}</span>
                  </div>
                </div>

                <div className="field-group">
                  <label className="field-label" htmlFor="expected-loan-date">
                    {t.expectedLoanRequiredDateLabel} <span className="req-star">*</span>
                  </label>
                  <div className="field-input-wrapper date-picker-wrapper">
                    <input
                      id="expected-loan-date"
                      type="date"
                      className="text-input date-input"
                      min={minDateStr}
                      max={maxDateStr}
                      value={expectedLoanRequiredDate}
                      onChange={(e) => setExpectedLoanRequiredDate(e.target.value)}
                      required
                    />
                  </div>
                  <span className="field-help-hint">
                    {t.expectedDateHelpText}
                  </span>
                </div>
              </div>

              {/* =========================================================== */}
              {/* SECTION 5: VEHICLE CONDITION (Immediately above Documents)  */}
              {/* =========================================================== */}
              <div className="lead-card-section" data-section="vehicle-condition">
                <div className="section-title-row">
                  <div className="section-heading-group">
                    <span className="section-icon">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="9" />
                        <path d="M12 7v5l3 3" />
                      </svg>
                    </span>
                    <span className="section-heading-text">{t.vehicleConditionHeading}</span>
                  </div>
                </div>

                {/* Vehicle Condition: MANDATORY UNSELECTED INITIAL STATE */}
                <div className="field-group">
                  <label className="field-label">
                    {t.vehicleConditionLabel} <span className="req-star">*</span>
                  </label>
                  <div className="vehicle-condition-segmented-control" role="radiogroup" aria-label={t.vehicleConditionLabel}>
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
                      <span>{t.usedCar}</span>
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
                      <span>{t.newCar}</span>
                    </button>
                  </div>
                </div>

                {/* CONDITIONAL: Vehicle Registration Number (ONLY RENDERED FOR USED CAR) */}
                {vehicleCondition === 'used' && (
                  <div className="field-group conditional-slide-down">
                    <label className="field-label" htmlFor="vehicle-reg-no">
                      {t.vehicleRegNoLabel} <span className="req-star">*</span>
                    </label>
                    <div className="field-input-wrapper">
                      <input
                        id="vehicle-reg-no"
                        type="text"
                        className="text-input uppercase-text"
                        placeholder={t.vehicleRegNoPlaceholder}
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
              </div>

              {/* =========================================================== */}
              {/* SECTION 6: DOCUMENT UPLOADS (FINAL SECTION OF THE FORM)      */}
              {/* =========================================================== */}
              <div className="lead-card-section" data-section="document-uploads">
                <div className="section-title-row">
                  <div className="section-heading-group">
                    <span className="section-icon">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" />
                        <path d="M12 12v9" />
                        <path d="m16 16-4-4-4 4" />
                      </svg>
                    </span>
                    <span className="section-heading-text">{t.documentUploadsHeading}</span>
                  </div>
                </div>

                {/* Hidden File Inputs */}
                <input
                  ref={aadhaarInputRef}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  className="hidden-file-input"
                  data-testid="aadhaar-file-input"
                  onChange={(e) => handleFileUpload(e.target.files?.[0] || null, 'aadhaar')}
                />
                <input
                  ref={panInputRef}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  className="hidden-file-input"
                  data-testid="pan-file-input"
                  onChange={(e) => handleFileUpload(e.target.files?.[0] || null, 'pan')}
                />
                <input
                  ref={rcInputRef}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  className="hidden-file-input"
                  data-testid="rc-file-input"
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
                        <span className="doc-title">{t.aadhaarCard} <span className="req-star">*</span></span>
                        {aadhaarDocId && (
                          <span className="quarantine-status-tag" title={t.uploadedQuarantined}>
                            🛡️ {t.uploadedQuarantined}
                          </span>
                        )}
                      </div>
                      <span className="doc-filename-text">
                        {uploadingDoc === 'aadhaar'
                          ? t.uploadingToQuarantine
                          : aadhaarFileName || t.aadhaarPrompt}
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
                    {aadhaarDocId ? t.replace : t.upload}
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
                        <span className="doc-title">{t.panCard} <span className="req-star">*</span></span>
                        {panDocId && (
                          <span className="quarantine-status-tag" title={t.uploadedQuarantined}>
                            🛡️ {t.uploadedQuarantined}
                          </span>
                        )}
                      </div>
                      <span className="doc-filename-text">
                        {uploadingDoc === 'pan'
                          ? t.uploadingToQuarantine
                          : panFileName || t.panPrompt}
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
                    {panDocId ? t.replace : t.upload}
                  </button>
                </div>

                {/* CONDITIONAL: RC Book (Registration Certificate) - ONLY FOR USED CAR */}
                {vehicleCondition === 'used' && (
                  <div className="rc-doc-wrapper conditional-slide-down">
                    <div className="rc-header-row">
                      <span className="rc-title-text">{t.rcBook}</span>
                      <div className="rc-mandatory-badge">
                        <span className="rc-star">*</span>
                        <span>{t.rcMandatoryForUsed}</span>
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
                        <span className="rc-prompt-bold">{t.rcPromptBold}</span>
                        <span className="rc-prompt-sub">{t.rcPromptSub}</span>
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
                              <span className="doc-title">{t.rcBook}</span>
                              <span className="quarantine-status-tag" title={t.uploadedQuarantined}>
                                🛡️ {t.uploadedQuarantined}
                              </span>
                            </div>
                            <span className="doc-filename-text">{rcFileName}</span>
                          </div>
                        </div>
                        <button
                          type="button"
                          className="doc-action-btn"
                          onClick={() => rcInputRef.current?.click()}
                        >
                          {t.replace}
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
                  <span>{isSubmitting ? t.submittingLead : t.submitLead}</span>
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

            <h2 className="success-heading">{t.leadSuccessfullySubmitted}</h2>
            <p className="success-subtext">{t.successSubtext}</p>

            <div className="confirmation-dossier-card">
              <div className="dossier-row">
                <span className="dossier-label">{t.caseNumber}</span>
                <span className="dossier-value bold-num">{submitResult.case_no}</span>
              </div>
              {submitResult.tracking_id && (
                <div className="dossier-row">
                  <span className="dossier-label">{t.trackingId}</span>
                  <span className="dossier-value monospace">{submitResult.tracking_id}</span>
                </div>
              )}
              <div className="dossier-row">
                <span className="dossier-label">{t.referralPartner}</span>
                <span className="dossier-value">{partnerName}</span>
              </div>
              <div className="dossier-row">
                <span className="dossier-label">{t.borrower}</span>
                <span className="dossier-value">{applicantName}</span>
              </div>
              <div className="dossier-row">
                <span className="dossier-label">{t.vehicleConditionSummary}</span>
                <span className="dossier-value capitalize">
                  {vehicleCondition === 'used' ? t.usedCar : t.newCar}
                </span>
              </div>
              <div className="dossier-row">
                <span className="dossier-label">{t.loanAmountSummary}</span>
                <span className="dossier-value">{formatAmountDisplay(loanAmount)}</span>
              </div>
              <div className="dossier-row">
                <span className="dossier-label">{t.expectedDateSummary}</span>
                <span className="dossier-value">
                  {expectedLoanRequiredDate
                    ? new Date(expectedLoanRequiredDate).toLocaleDateString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })
                    : 'Immediate'}
                </span>
              </div>
            </div>

            <div className="success-action-buttons">
              <button
                type="button"
                className="submit-lead-pill-button"
                onClick={handleResetForNextLead}
              >
                <span>{t.submitAnotherLead}</span>
                <span className="btn-arrow-icon">→</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
