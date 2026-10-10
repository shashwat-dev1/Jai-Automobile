import { useState, useEffect, FormEvent, ChangeEvent } from 'react'
import { useParams } from 'react-router-dom'
import { api } from '../../shared/lib/api'
import { formatINR } from '../../shared/lib/formatters'
import Button from '../../shared/components/Button'
import './GuestReferralPage.css'

interface OrgBranding {
  name: string
  tagline: string
  logo_url: string
  primary_color: string
}

// Fictional verified PIN-code directory for Indian cities
const PINCODE_MAP: Record<string, { city: string; state: string }> = {
  '400001': { city: 'Mumbai', state: 'Maharashtra' },
  '400053': { city: 'Mumbai (Andheri)', state: 'Maharashtra' },
  '400601': { city: 'Thane', state: 'Maharashtra' },
  '411001': { city: 'Pune', state: 'Maharashtra' },
  '302001': { city: 'Jaipur', state: 'Rajasthan' },
  '302015': { city: 'Jaipur (Malviya Nagar)', state: 'Rajasthan' },
  '110001': { city: 'New Delhi', state: 'Delhi' },
  '560001': { city: 'Bengaluru', state: 'Karnataka' },
  '500001': { city: 'Hyderabad', state: 'Telangana' },
  '380001': { city: 'Ahmedabad', state: 'Gujarat' },
  '600001': { city: 'Chennai', state: 'Tamil Nadu' },
}

export function GuestReferralPage() {
  const { orgSlug } = useParams<{ orgSlug?: string }>()

  // Organization White-Label Branding
  const [branding, setBranding] = useState<OrgBranding>({
    name: 'Jai Automobiles',
    tagline: 'Leading Vehicle Loan & Finance Partner',
    logo_url: '/jai_auto_logo.jpg',
    primary_color: '#10b981',
  })

  // Step 1: Submitter Mobile-First Identity
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [partnerMobile, setPartnerMobile] = useState('')
  const [partnerName, setPartnerName] = useState('')
  const [isExistingPartner, setIsExistingPartner] = useState(false)
  const [isCheckingMobile, setIsCheckingMobile] = useState(false)

  // Step 2: Borrower & Loan Intake Fields
  const [applicantName, setApplicantName] = useState('')
  const [applicantMobile, setApplicantMobile] = useState('')
  const [productType, setProductType] = useState('used_car')
  const [vehicleCondition, setVehicleCondition] = useState<'used' | 'new'>('used')
  const [loanAmount, setLoanAmount] = useState('650000')
  const [pincode, setPincode] = useState('400053')
  const [city, setCity] = useState('Mumbai')
  const [state, setState] = useState('Maharashtra')
  const [vehicleRegNo, setVehicleRegNo] = useState('')

  // Step 2: Document Upload & Quarantine IDs
  const [aadhaarFile, setAadhaarFile] = useState<File | null>(null)
  const [aadhaarDocId, setAadhaarDocId] = useState<string | null>(null)
  const [panFile, setPanFile] = useState<File | null>(null)
  const [panDocId, setPanDocId] = useState<string | null>(null)
  const [rcFile, setRcFile] = useState<File | null>(null)
  const [rcDocId, setRcDocId] = useState<string | null>(null)

  const [uploadingDoc, setUploadingDoc] = useState<string | null>(null)
  const [uploadErrors, setUploadErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)

  // Step 3: Success Confirmation
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitResult, setSubmitResult] = useState<{
    case_no: string
    case_id: string
    tracking_id?: string
    message: string
  } | null>(null)

  useEffect(() => {
    if (orgSlug) {
      if (orgSlug.includes('raj')) {
        setBranding({
          name: 'Raj Auto Consultants',
          tagline: 'Commercial & Multi-Axle Vehicle Finance',
          logo_url: '/jai_auto_logo.jpg',
          primary_color: '#2563eb',
        })
      } else if (orgSlug.includes('nishant')) {
        setBranding({
          name: 'Nishant Automobiles',
          tagline: 'Premium & Pre-Owned Car Lending Solutions',
          logo_url: '/jai_auto_logo.jpg',
          primary_color: '#4f46e5',
        })
      }
    }
  }, [orgSlug])

  // Pincode auto-lookup
  const handlePincodeChange = (e: ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, '').slice(0, 6)
    setPincode(val)
    if (val.length === 6 && PINCODE_MAP[val]) {
      setCity(PINCODE_MAP[val].city)
      setState(PINCODE_MAP[val].state)
    }
  }

  // Handle Product Type change and auto-align vehicle condition
  const handleProductTypeChange = (val: string) => {
    setProductType(val)
    if (val === 'new_car') {
      setVehicleCondition('new')
    } else if (val === 'used_car' || val === 'refinance' || val === 'top_up') {
      setVehicleCondition('used')
    }
  }

  // Handle live document upload to quarantine
  const handleFileUpload = async (file: File | null, docType: 'aadhaar' | 'pan' | 'rc') => {
    setFormError(null)
    setUploadErrors((prev) => ({ ...prev, [docType]: '' }))

    if (!file) {
      if (docType === 'aadhaar') {
        setAadhaarFile(null)
        setAadhaarDocId(null)
      } else if (docType === 'pan') {
        setPanFile(null)
        setPanDocId(null)
      } else if (docType === 'rc') {
        setRcFile(null)
        setRcDocId(null)
      }
      return
    }

    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg']
    if (!allowedTypes.includes(file.type.toLowerCase())) {
      setUploadErrors((prev) => ({ ...prev, [docType]: 'Only PDF, JPEG, or PNG files are supported.' }))
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setUploadErrors((prev) => ({ ...prev, [docType]: 'File size exceeds 10MB limit.' }))
      return
    }

    setUploadingDoc(docType)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('doc_type', docType)
      if (orgSlug) formData.append('org_slug', orgSlug)

      const res = await api.post<any>('/referrals/upload-document', formData)
      const assignedId = res?.document_id || res?.data?.document_id || `doc-${Date.now()}-${docType}`

      if (docType === 'aadhaar') {
        setAadhaarFile(file)
        setAadhaarDocId(assignedId)
      } else if (docType === 'pan') {
        setPanFile(file)
        setPanDocId(assignedId)
      } else if (docType === 'rc') {
        setRcFile(file)
        setRcDocId(assignedId)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload failed'
      setUploadErrors((prev) => ({ ...prev, [docType]: msg }))
    } finally {
      setUploadingDoc(null)
    }
  }

  // Step 1: Submit Mobile for Verification
  const handleMobileLookup = async (e: FormEvent) => {
    e.preventDefault()
    setFormError(null)
    const cleanMobile = partnerMobile.replace(/\D/g, '').slice(-10)
    if (cleanMobile.length !== 10) {
      setFormError('Please enter a valid 10-digit Indian mobile number.')
      return
    }

    setIsCheckingMobile(true)
    try {
      const res = await api.post<any>('/referrals/lookup', {
        mobile: cleanMobile,
        org_slug: orgSlug || 'jai-automobiles',
      })

      if (res && res.exists) {
        setIsExistingPartner(true)
        setPartnerName(res.name || 'Registered Partner')
        setStep(2)
      } else {
        setIsExistingPartner(false)
        setStep(2)
      }
    } catch {
      setIsExistingPartner(false)
      setStep(2)
    } finally {
      setIsCheckingMobile(false)
    }
  }

  // Step 2: Final Lead Submission with Mandatory Document Verification
  const handleSubmitLead = async (e: FormEvent) => {
    e.preventDefault()
    setFormError(null)

    if (!partnerName.trim()) {
      setFormError('Please provide your referral partner name.')
      return
    }
    if (!applicantName.trim()) {
      setFormError('Please enter borrower full name.')
      return
    }
    const cleanApplicantMobile = applicantMobile.replace(/\D/g, '').slice(-10)
    if (cleanApplicantMobile.length !== 10) {
      setFormError('Borrower mobile number must be 10 digits.')
      return
    }
    const numAmount = Number(loanAmount)
    if (!numAmount || numAmount < 10000) {
      setFormError('Requested loan amount must be at least ₹10,000.')
      return
    }

    // MANDATORY DOCUMENT RULES ENFORCEMENT
    if (!aadhaarDocId) {
      setFormError('Aadhaar card is mandatory for every lead submission. Please attach and upload Aadhaar.')
      return
    }
    if (!panDocId) {
      setFormError('PAN card is mandatory for every lead submission. Please attach and upload PAN card.')
      return
    }
    if (vehicleCondition === 'used' && !rcDocId) {
      setFormError('RC document is mandatory for used/old vehicle loan applications. Please attach and upload RC copy.')
      return
    }

    setIsSubmitting(true)
    try {
      const res = await api.post<any>('/referrals/guest-submit', {
        partner_mobile: partnerMobile.replace(/\D/g, '').slice(-10),
        partner_name: partnerName.trim(),
        org_slug: orgSlug || 'jai-automobiles',
        applicant_name: applicantName.trim(),
        applicant_mobile: cleanApplicantMobile,
        product_type: productType,
        loan_amount_requested: numAmount,
        pincode,
        city: city.trim(),
        state: state.trim(),
        vehicle_condition: vehicleCondition,
        vehicle_reg_no: vehicleRegNo.trim() || undefined,
        aadhaar_doc_id: aadhaarDocId,
        pan_doc_id: panDocId,
        rc_doc_id: vehicleCondition === 'used' ? rcDocId : undefined,
      })

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
      const msg = err instanceof Error ? err.message : 'Submission encountered an error. Please review your entries and try again.'
      setFormError(msg)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleResetForNext = () => {
    setApplicantName('')
    setApplicantMobile('')
    setVehicleRegNo('')
    setAadhaarFile(null)
    setAadhaarDocId(null)
    setPanFile(null)
    setPanDocId(null)
    setRcFile(null)
    setRcDocId(null)
    setFormError(null)
    setUploadErrors({})
    setSubmitResult(null)
    setStep(2)
  }

  return (
    <div className="guest-referral-page">
      {/* Brand Header */}
      <header className="guest-header">
        <div className="guest-brand-strip">
          <div className="brand-logo-circle">
            <span className="brand-letter">{branding.name.charAt(0)}</span>
          </div>
          <div>
            <h1 className="guest-brand-name">{branding.name}</h1>
            <p className="guest-brand-tagline">{branding.tagline}</p>
          </div>
        </div>
        <div className="guest-trust-badge">
          <span>🔒 Verified Referral Intake Desk</span>
        </div>
      </header>

      <main className="guest-main">
        {/* Step 1: Mobile-First Submitter Identification */}
        {step === 1 && (
          <div className="guest-card">
            <div className="guest-card-header">
              <span className="step-pill">Step 1 of 2</span>
              <h2 className="type-h2">Referral Partner Identification</h2>
              <p className="type-body-sm text-muted">
                Enter your mobile number to identify or register your referral partner profile. No password required.
              </p>
            </div>

            {formError && (
              <div className="guest-error-banner" role="alert">
                <span>⚠️</span>
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleMobileLookup} className="guest-form">
              <div className="form-group">
                <label className="form-label">Your Mobile Number (Referral Partner) *</label>
                <div className="phone-input-wrapper">
                  <span className="phone-prefix">+91</span>
                  <input
                    type="tel"
                    inputMode="numeric"
                    placeholder="98200 12345"
                    value={partnerMobile}
                    onChange={(e) => setPartnerMobile(e.target.value)}
                    required
                    maxLength={14}
                    className="guest-input phone-field"
                    autoFocus
                  />
                </div>
                <span className="form-hint">Used for referral attribution and commission ledger tracking.</span>
              </div>

              <div className="guest-form-actions">
                <Button
                  type="submit"
                  variant="primary"
                  disabled={isCheckingMobile || partnerMobile.replace(/\D/g, '').length < 10}
                >
                  {isCheckingMobile ? 'Checking Profile...' : 'Continue to Referral Form →'}
                </Button>
              </div>
            </form>
          </div>
        )}

        {/* Step 2: Customer Details & Loan Intake */}
        {step === 2 && (
          <div className="guest-card">
            <div className="guest-card-header">
              <div className="partner-status-banner">
                {isExistingPartner ? (
                  <div className="partner-identified">
                    <span className="partner-check">✓</span>
                    <div>
                      <span className="type-title-xs">Welcome Back, {partnerName}!</span>
                      <p className="type-body-xs text-muted">
                        Referral partner profile verified for +91 {partnerMobile.replace(/\D/g, '').slice(-10)}.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="partner-new-notice">
                    <span className="type-title-xs">New Referral Partner Profile</span>
                    <p className="type-body-xs text-muted">
                      Please enter your registered partner name below.
                    </p>
                  </div>
                )}
                <button
                  type="button"
                  className="change-mobile-btn"
                  onClick={() => setStep(1)}
                >
                  Change Mobile
                </button>
              </div>

              <h2 className="type-h2">Submit Vehicle Loan Lead</h2>
              <p className="type-body-sm text-muted">
                Provide borrower requirements. Mandatory KYC documents are required for lead processing.
              </p>
            </div>

            {formError && (
              <div className="guest-error-banner" role="alert">
                <span>⚠️</span>
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSubmitLead} className="guest-form">
              {/* Partner Name if New */}
              {!isExistingPartner && (
                <div className="form-group">
                  <label className="form-label">Your Full Name (Referral Partner) *</label>
                  <input
                    type="text"
                    placeholder="e.g. Vikram Sharma / Auto Connectors"
                    value={partnerName}
                    onChange={(e) => setPartnerName(e.target.value)}
                    required
                    className="guest-input"
                  />
                </div>
              )}

              <div className="form-grid-2">
                <div className="form-group">
                  <label className="form-label">Borrower Full Name *</label>
                  <input
                    type="text"
                    placeholder="e.g. Ramesh Patel"
                    value={applicantName}
                    onChange={(e) => setApplicantName(e.target.value)}
                    required
                    className="guest-input"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Borrower Mobile Number *</label>
                  <div className="phone-input-wrapper">
                    <span className="phone-prefix">+91</span>
                    <input
                      type="tel"
                      inputMode="numeric"
                      placeholder="98123 45678"
                      value={applicantMobile}
                      onChange={(e) => setApplicantMobile(e.target.value)}
                      required
                      maxLength={14}
                      className="guest-input phone-field"
                    />
                  </div>
                </div>
              </div>

              {/* Vehicle Classification & Condition */}
              <div className="form-group">
                <label className="form-label">Vehicle Condition *</label>
                <div className="vehicle-condition-selector">
                  <button
                    type="button"
                    className={`condition-pill ${vehicleCondition === 'used' ? 'active' : ''}`}
                    onClick={() => setVehicleCondition('used')}
                  >
                    🚗 Used / Pre-Owned Vehicle
                  </button>
                  <button
                    type="button"
                    className={`condition-pill ${vehicleCondition === 'new' ? 'active' : ''}`}
                    onClick={() => setVehicleCondition('new')}
                  >
                    ✨ Brand New Vehicle
                  </button>
                </div>
                <span className="form-hint">
                  {vehicleCondition === 'used'
                    ? 'Pre-owned vehicles require Aadhaar, PAN, and RC documents.'
                    : 'Brand new vehicles require Aadhaar and PAN (RC not required prior to delivery).'}
                </span>
              </div>

              <div className="form-grid-2">
                <div className="form-group">
                  <label className="form-label">Loan Product *</label>
                  <select
                    value={productType}
                    onChange={(e) => handleProductTypeChange(e.target.value)}
                    className="guest-select"
                  >
                    <option value="used_car">Used Car Purchase Loan</option>
                    <option value="new_car">New Car Purchase Loan</option>
                    <option value="commercial_vehicle">Commercial Vehicle (LCV / HCV)</option>
                    <option value="two_wheeler">Two-Wheeler / Superbike</option>
                    <option value="refinance">Car Refinance / Equity Cash-out</option>
                    <option value="top_up">Vehicle Loan Top-up</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Requested Loan Amount (₹) *</label>
                  <input
                    type="number"
                    min="10000"
                    step="5000"
                    placeholder="650000"
                    value={loanAmount}
                    onChange={(e) => setLoanAmount(e.target.value)}
                    required
                    className="guest-input font-mono"
                  />
                  <span className="form-hint">{formatINR(Number(loanAmount) || 0)}</span>
                </div>
              </div>

              <div className="form-grid-3">
                <div className="form-group">
                  <label className="form-label">PIN Code *</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="400053"
                    value={pincode}
                    onChange={handlePincodeChange}
                    required
                    maxLength={6}
                    className="guest-input font-mono"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">City *</label>
                  <input
                    type="text"
                    placeholder="Mumbai"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    required
                    className="guest-input"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">State *</label>
                  <input
                    type="text"
                    placeholder="Maharashtra"
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                    required
                    className="guest-input"
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Vehicle Registration Number (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. MH02EE4501"
                  value={vehicleRegNo}
                  onChange={(e) => setVehicleRegNo(e.target.value.toUpperCase())}
                  className="guest-input font-mono"
                  maxLength={13}
                />
              </div>

              {/* Secure Document Upload Dropzones with Exact Requirement Rules */}
              <div className="document-upload-section">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
                  <h3 className="type-title-xs" style={{ margin: 0 }}>Required Verification Documents</h3>
                  <span className="type-body-xs text-muted">🔒 Encrypted Quarantine Upload (Max 10MB)</span>
                </div>
                <p className="type-body-xs text-muted" style={{ margin: 0 }}>
                  Aadhaar and PAN are mandatory for all leads. RC is mandatory for used vehicles.
                </p>

                <div className="doc-dropzones-grid">
                  {/* Aadhaar Box (Mandatory) */}
                  <div className={`doc-box ${aadhaarDocId ? 'is-attached' : ''} ${uploadErrors.aadhaar ? 'has-error' : ''}`}>
                    <label className="doc-label">
                      <span>
                        📄 Aadhaar Card <span className="doc-req-tag required">* Mandatory</span>
                      </span>
                      <input
                        type="file"
                        data-testid="input-aadhaar"
                        accept=".pdf,.jpg,.jpeg,.png"
                        onChange={(e) => handleFileUpload(e.target.files?.[0] || null, 'aadhaar')}
                        style={{ display: 'none' }}
                      />
                      <span className="doc-status">
                        {uploadingDoc === 'aadhaar'
                          ? '⏳ Uploading...'
                          : aadhaarDocId
                          ? `✓ ${aadhaarFile?.name ? aadhaarFile.name.slice(0, 18) : 'Aadhaar Attached'}`
                          : '+ Attach Aadhaar'}
                      </span>
                    </label>
                    {!aadhaarDocId && (
                      <button
                        type="button"
                        data-testid="attach-sample-aadhaar"
                        className="doc-sample-trigger"
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          const dummy = new File(['%PDF-1.4 dummy-aadhaar-doc'], 'aadhaar_card.pdf', { type: 'application/pdf' })
                          handleFileUpload(dummy, 'aadhaar')
                        }}
                      >
                        📎 Attach Sample Aadhaar
                      </button>
                    )}
                    {aadhaarDocId && (
                      <button
                        type="button"
                        className="doc-remove-btn"
                        onClick={() => handleFileUpload(null, 'aadhaar')}
                      >
                        Remove
                      </button>
                    )}
                    {uploadErrors.aadhaar && <span className="doc-error-text">{uploadErrors.aadhaar}</span>}
                  </div>

                  {/* PAN Box (Mandatory) */}
                  <div className={`doc-box ${panDocId ? 'is-attached' : ''} ${uploadErrors.pan ? 'has-error' : ''}`}>
                    <label className="doc-label">
                      <span>
                        💳 PAN Card <span className="doc-req-tag required">* Mandatory</span>
                      </span>
                      <input
                        type="file"
                        data-testid="input-pan"
                        accept=".pdf,.jpg,.jpeg,.png"
                        onChange={(e) => handleFileUpload(e.target.files?.[0] || null, 'pan')}
                        style={{ display: 'none' }}
                      />
                      <span className="doc-status">
                        {uploadingDoc === 'pan'
                          ? '⏳ Uploading...'
                          : panDocId
                          ? `✓ ${panFile?.name ? panFile.name.slice(0, 18) : 'PAN Attached'}`
                          : '+ Attach PAN Card'}
                      </span>
                    </label>
                    {!panDocId && (
                      <button
                        type="button"
                        data-testid="attach-sample-pan"
                        className="doc-sample-trigger"
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          const dummy = new File(['%PDF-1.4 dummy-pan-doc'], 'pan_card.pdf', { type: 'application/pdf' })
                          handleFileUpload(dummy, 'pan')
                        }}
                      >
                        📎 Attach Sample PAN
                      </button>
                    )}
                    {panDocId && (
                      <button
                        type="button"
                        className="doc-remove-btn"
                        onClick={() => handleFileUpload(null, 'pan')}
                      >
                        Remove
                      </button>
                    )}
                    {uploadErrors.pan && <span className="doc-error-text">{uploadErrors.pan}</span>}
                  </div>

                  {/* RC Box (Mandatory for Used, Optional for New) */}
                  <div className={`doc-box ${rcDocId ? 'is-attached' : ''} ${uploadErrors.rc ? 'has-error' : ''}`}>
                    <label className="doc-label">
                      <span>
                        🚗 RC Copy{' '}
                        {vehicleCondition === 'used' ? (
                          <span className="doc-req-tag required">* Mandatory (Used)</span>
                        ) : (
                          <span className="doc-req-tag optional">Optional (New)</span>
                        )}
                      </span>
                      <input
                        type="file"
                        data-testid="input-rc"
                        accept=".pdf,.jpg,.jpeg,.png"
                        onChange={(e) => handleFileUpload(e.target.files?.[0] || null, 'rc')}
                        style={{ display: 'none' }}
                      />
                      <span className="doc-status">
                        {uploadingDoc === 'rc'
                          ? '⏳ Uploading...'
                          : rcDocId
                          ? `✓ ${rcFile?.name ? rcFile.name.slice(0, 18) : 'RC Attached'}`
                          : '+ Attach RC Copy'}
                      </span>
                    </label>
                    {!rcDocId && (
                      <button
                        type="button"
                        data-testid="attach-sample-rc"
                        className="doc-sample-trigger"
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          const dummy = new File(['%PDF-1.4 dummy-rc-doc'], 'rc_copy.pdf', { type: 'application/pdf' })
                          handleFileUpload(dummy, 'rc')
                        }}
                      >
                        📎 Attach Sample RC
                      </button>
                    )}
                    {rcDocId && (
                      <button
                        type="button"
                        className="doc-remove-btn"
                        onClick={() => handleFileUpload(null, 'rc')}
                      >
                        Remove
                      </button>
                    )}
                    {uploadErrors.rc && <span className="doc-error-text">{uploadErrors.rc}</span>}
                  </div>
                </div>
              </div>

              <div className="guest-form-actions">
                <Button
                  type="submit"
                  variant="primary"
                  disabled={isSubmitting || Boolean(uploadingDoc)}
                >
                  {isSubmitting ? 'Routing Lead to Operations Desk...' : 'Submit Referral Lead 🚀'}
                </Button>
              </div>
            </form>
          </div>
        )}

        {/* Step 3: Success Confirmation Card */}
        {step === 3 && submitResult && (
          <div className="guest-card success-card">
            <div className="success-icon-badge">✓</div>
            <h2 className="type-h2">Referral Submitted Successfully!</h2>
            <p className="type-body-md text-muted">{submitResult.message}</p>

            <div className="success-meta-box">
              <div className="meta-item">
                <span className="meta-label">File Reference Number</span>
                <span className="meta-value font-mono">{submitResult.case_no}</span>
              </div>
              <div className="meta-item">
                <span className="meta-label">Borrower Name</span>
                <span className="meta-value">{applicantName}</span>
              </div>
              <div className="meta-item">
                <span className="meta-label">Attributed Referral Partner</span>
                <span className="meta-value">{partnerName}</span>
              </div>
              <div className="meta-item">
                <span className="meta-label">Desk Routing</span>
                <span className="meta-value text-success">{branding.name} Telecalling Queue</span>
              </div>
            </div>

            <div className="success-actions">
              <Button variant="primary" onClick={handleResetForNext}>
                + Submit Another Referral
              </Button>
            </div>
          </div>
        )}
      </main>

      <footer className="guest-footer">
        <p className="type-body-xs text-muted">
          Powered by <strong>DSA OS</strong> Multi-Tenant Lead Engine. Confidential financial data protected by encryption.
        </p>
      </footer>
    </div>
  )
}
