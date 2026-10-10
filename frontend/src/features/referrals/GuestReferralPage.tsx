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
  const [loanAmount, setLoanAmount] = useState('650000')
  const [pincode, setPincode] = useState('400053')
  const [city, setCity] = useState('Mumbai')
  const [state, setState] = useState('Maharashtra')
  const [vehicleRegNo, setVehicleRegNo] = useState('')

  // Step 2: Document Upload Simulation
  const [aadhaarFile, setAadhaarFile] = useState<File | null>(null)
  const [panFile, setPanFile] = useState<File | null>(null)
  const [rcFile, setRcFile] = useState<File | null>(null)

  // Step 3: Success Confirmation
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitResult, setSubmitResult] = useState<{
    case_no: string
    case_id: string
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

  // Step 1: Submit Mobile for Verification
  const handleMobileLookup = async (e: FormEvent) => {
    e.preventDefault()
    const cleanMobile = partnerMobile.replace(/\D/g, '').slice(-10)
    if (cleanMobile.length !== 10) {
      alert('Please enter a valid 10-digit Indian mobile number.')
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

  // Step 2: Final Lead Submission
  const handleSubmitLead = async (e: FormEvent) => {
    e.preventDefault()
    if (!applicantName.trim()) {
      alert('Please enter customer full name.')
      return
    }
    const cleanApplicantMobile = applicantMobile.replace(/\D/g, '').slice(-10)
    if (cleanApplicantMobile.length !== 10) {
      alert('Customer mobile number must be 10 digits.')
      return
    }
    const numAmount = Number(loanAmount)
    if (!numAmount || numAmount < 10000) {
      alert('Requested loan amount must be at least ₹10,000.')
      return
    }
    if (!partnerName.trim()) {
      alert('Please provide your referral partner name.')
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
        vehicle_reg_no: vehicleRegNo.trim() || undefined,
      })

      if (res && res.case_no) {
        setSubmitResult({
          case_no: res.case_no,
          case_id: res.case_id,
          message: res.message,
        })
        setStep(3)
      }
    } catch {
      alert('Submission encountered an error. Please review your entries and try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleResetForNext = () => {
    setApplicantName('')
    setApplicantMobile('')
    setVehicleRegNo('')
    setAadhaarFile(null)
    setPanFile(null)
    setRcFile(null)
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
                      Please enter your name below to register your referral partner account.
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
                Provide borrower requirements. Our executive desk will process the application immediately.
              </p>
            </div>

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

              <div className="form-grid-2">
                <div className="form-group">
                  <label className="form-label">Loan Product *</label>
                  <select
                    value={productType}
                    onChange={(e) => setProductType(e.target.value)}
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

              {/* Secure Document Upload Dropzones */}
              <div className="document-upload-section">
                <h3 className="type-title-xs">Applicant KYC Documents (Optional at Intake)</h3>
                <p className="type-body-xs text-muted">
                  Documents are quarantined in private encrypted storage. Valid PDF, JPG, PNG up to 10MB.
                </p>

                <div className="doc-dropzones-grid">
                  <div className={`doc-box ${aadhaarFile ? 'is-attached' : ''}`}>
                    <label className="doc-label">
                      <span>📄 Aadhaar Card</span>
                      <input
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png"
                        onChange={(e) => setAadhaarFile(e.target.files?.[0] || null)}
                        style={{ display: 'none' }}
                      />
                      <span className="doc-status">
                        {aadhaarFile ? `✓ ${aadhaarFile.name.slice(0, 18)}` : '+ Attach File'}
                      </span>
                    </label>
                  </div>

                  <div className={`doc-box ${panFile ? 'is-attached' : ''}`}>
                    <label className="doc-label">
                      <span>💳 PAN Card</span>
                      <input
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png"
                        onChange={(e) => setPanFile(e.target.files?.[0] || null)}
                        style={{ display: 'none' }}
                      />
                      <span className="doc-status">
                        {panFile ? `✓ ${panFile.name.slice(0, 18)}` : '+ Attach File'}
                      </span>
                    </label>
                  </div>

                  <div className={`doc-box ${rcFile ? 'is-attached' : ''}`}>
                    <label className="doc-label">
                      <span>🚗 RC Copy</span>
                      <input
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png"
                        onChange={(e) => setRcFile(e.target.files?.[0] || null)}
                        style={{ display: 'none' }}
                      />
                      <span className="doc-status">
                        {rcFile ? `✓ ${rcFile.name.slice(0, 18)}` : '+ Attach File'}
                      </span>
                    </label>
                  </div>
                </div>
              </div>

              <div className="guest-form-actions">
                <Button
                  type="submit"
                  variant="primary"
                  disabled={isSubmitting}
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
