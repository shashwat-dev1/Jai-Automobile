/**
 * DSA OS — Case Intake Workspace
 * End-to-End Structured Intake: Sourcing -> Applicant -> Loan & Asset -> Document Processing & OCR
 */

import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../shared/lib/api'
import Button from '../../shared/components/Button'
import { DocumentExtractionReviewModal } from '../documents/DocumentExtractionReviewModal'
import type { OCRScanResult } from '../documents/types'
import './CaseIntakeWorkspace.css'

interface ReferralPartnerOption {
  id: string
  name: string
  mobile_primary: string
  masked_mobile?: string
  verification_status?: string
}

interface DocumentTypeOption {
  id: string
  code: string
  name: string
  category: string
}

interface IntakeUploadedDoc {
  id: string
  documentTypeId: string
  categoryName: string
  fileName: string
  fileSize: number
  status: string
  scanResult?: OCRScanResult
  createdAt: string
}

const DEFAULT_DOC_TYPES: DocumentTypeOption[] = [
  { id: 'dt-pan', code: 'PAN', name: 'Borrower PAN Card', category: 'kyc' },
  { id: 'dt-aadhaar', code: 'AADHAAR', name: 'Borrower Aadhaar Card', category: 'kyc' },
  { id: 'dt-bank', code: 'BANK_STMT', name: 'Latest 6 Months Bank Statement', category: 'financial' },
  { id: 'dt-rc', code: 'VEHICLE_RC', name: 'Vehicle Registration Certificate (RC)', category: 'vehicle' },
  { id: 'dt-insurance', code: 'INSURANCE', name: 'Vehicle Insurance Cover Note', category: 'vehicle' },
  { id: 'dt-form34', code: 'FORM_34', name: 'Form 34 Hypothecation Application', category: 'pdd' },
  { id: 'dt-invoice', code: 'INVOICE', name: 'Showroom Invoice & Tax Copy', category: 'pdd' },
]

export function CaseIntakeWorkspace() {
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Current Step: 1 = Source, 2 = Customer, 3 = Loan & Asset, 4 = Documents
  const [currentStep, setCurrentStep] = useState<number>(1)
  const [loadingPartners, setLoadingPartners] = useState(false)
  const [referralPartners, setReferralPartners] = useState<ReferralPartnerOption[]>([])
  const [documentTypes, setDocumentTypes] = useState<DocumentTypeOption[]>(DEFAULT_DOC_TYPES)

  // Submission State
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [createdCaseId, setCreatedCaseId] = useState<string | null>(null)
  const [createdCaseNo, setCreatedCaseNo] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // Step 1: Sourcing (Simplified to Direct vs Referral)
  const [sourceType, setSourceType] = useState<'direct' | 'referral'>('direct')
  const [selectedPartnerId, setSelectedPartnerId] = useState('')
  const [partnerSearch, setPartnerSearch] = useState('')
  const [receivedDate, setReceivedDate] = useState(() => new Date().toISOString().split('T')[0])
  const [sourcingNotes, setSourcingNotes] = useState('')

  // Step 2: Customer Profile
  const [fullName, setFullName] = useState('')
  const [mobileNumber, setMobileNumber] = useState('')
  const [alternateMobile, setAlternateMobile] = useState('')
  const [dateOfBirth, setDateOfBirth] = useState('')
  const [gender, setGender] = useState('male')
  const [panNumber, setPanNumber] = useState('')
  const [aadhaarLastFour, setAadhaarLastFour] = useState('')
  const [addressLine, setAddressLine] = useState('')
  const [city, setCity] = useState('Mumbai')
  const [state, setState] = useState('Maharashtra')
  const [pincode, setPincode] = useState('400001')
  const [employmentType, setEmploymentType] = useState('salaried')
  const [monthlyIncome, setMonthlyIncome] = useState('75000')

  // Step 3: Loan & Collateral Asset
  const [productType, setProductType] = useState('used_car')
  const [loanAmount, setLoanAmount] = useState('650000')
  const [tenureMonths, setTenureMonths] = useState('48')
  const [loanPurpose, setLoanPurpose] = useState('Personal commute upgrade')
  const [preferredLender, setPreferredLender] = useState('')
  const [vehicleMake, setVehicleMake] = useState('Hyundai')
  const [vehicleModel, setVehicleModel] = useState('Creta SX')
  const [vehicleCondition, setVehicleCondition] = useState<'new' | 'used'>('used')
  const [vehicleRegNo, setVehicleRegNo] = useState('MH-02-EE-4501')
  const [manufacturingYear, setManufacturingYear] = useState('2022')
  const [valuationAmount, setValuationAmount] = useState('820000')

  // Step 4: Document Intake & OCR Pipeline
  const [uploadedDocs, setUploadedDocs] = useState<IntakeUploadedDoc[]>([])
  const [selectedDocTypeId, setSelectedDocTypeId] = useState('dt-pan')
  const [uploadingDoc, setUploadingDoc] = useState(false)
  const [activeReviewDoc, setActiveReviewDoc] = useState<{ id: string; scanResult: OCRScanResult; typeName: string } | null>(null)

  // Load Registered Referral Partners & Document Types on mount
  useEffect(() => {
    async function loadMeta() {
      setLoadingPartners(true)
      try {
        const [partnersRes, docTypesRes] = await Promise.all([
          api.get<ReferralPartnerOption[]>('/referrals/profiles').catch(() => []),
          api.get<DocumentTypeOption[]>('/document-types').catch(() => DEFAULT_DOC_TYPES),
        ])
        if (Array.isArray(partnersRes)) {
          setReferralPartners(partnersRes)
        }
        if (docTypesRes && docTypesRes.length > 0) {
          setDocumentTypes(docTypesRes)
          setSelectedDocTypeId((prev) => prev || docTypesRes[0].id)
        }
      } catch (err) {
        console.warn('Using default intake metadata', err)
        setDocumentTypes(DEFAULT_DOC_TYPES)
      } finally {
        setLoadingPartners(false)
      }
    }
    loadMeta()
  }, [])

  // Filter partners if list is searchable
  const filteredPartners = useMemo(() => {
    if (!partnerSearch.trim()) return referralPartners
    const q = partnerSearch.toLowerCase().trim()
    return referralPartners.filter(
      (p) => p.name.toLowerCase().includes(q) || (p.mobile_primary || '').includes(q)
    )
  }, [referralPartners, partnerSearch])

  // Handle switching source type
  const handleSourceTypeChange = (newType: 'direct' | 'referral') => {
    setSourceType(newType)
    setErrorMessage(null)
    if (newType === 'direct') {
      setSelectedPartnerId('')
      setPartnerSearch('')
    }
  }

  // Validate Step Transitions
  const handleNextStep = async () => {
    setErrorMessage(null)
    if (currentStep === 1) {
      if (sourceType === 'referral') {
        if (referralPartners.length === 0) {
          setErrorMessage('No registered referral partners found. Please register a partner in the Referral Partners section first.')
          return
        }
        if (!selectedPartnerId) {
          setErrorMessage('Please select a referral partner from the registered partners dropdown.')
          return
        }
      }
      setCurrentStep(2)
    } else if (currentStep === 2) {
      if (!fullName.trim() || fullName.trim().length < 2) {
        setErrorMessage('Please enter the customer full legal name (at least 2 characters).')
        return
      }
      const cleanMobile = mobileNumber.replace(/[\s\-+]/g, '').slice(-10)
      if (!/^[6-9]\d{9}$/.test(cleanMobile)) {
        setErrorMessage('Please enter a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9.')
        return
      }
      if (panNumber.trim() && !/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(panNumber.trim().toUpperCase())) {
        setErrorMessage('Invalid PAN format. Must match standard format: 5 letters, 4 numbers, 1 letter (e.g. ABCDE1234F).')
        return
      }
      setCurrentStep(3)
    } else if (currentStep === 3) {
      const amount = parseFloat(loanAmount)
      if (isNaN(amount) || amount <= 0) {
        setErrorMessage('Please enter a valid loan requested amount.')
        return
      }
      if (!vehicleMake.trim()) {
        setErrorMessage('Please provide the vehicle make / manufacturer.')
        return
      }
      if (vehicleRegNo.trim()) {
        const cleanReg = vehicleRegNo.replace(/[\s\-]/g, '').toUpperCase()
        if (!/^[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{4}$/.test(cleanReg)) {
          setErrorMessage('Invalid Vehicle Registration Number format (e.g. MH01AB1234 or DL01C1234).')
          return
        }
      }

      // Automatically create the core case file if not already created
      if (!createdCaseId) {
        setIsSubmitting(true)
        try {
          const cleanMobile = mobileNumber.replace(/[\s\-+]/g, '').slice(-10)
          const selectedPartner = sourceType === 'referral'
            ? referralPartners.find((p) => p.id === selectedPartnerId)
            : null

          const payload = {
            party_name: fullName.trim(),
            party_mobile: cleanMobile,
            party_pan: panNumber.trim() ? panNumber.trim().toUpperCase() : undefined,
            party_aadhaar_last_four: aadhaarLastFour.trim() ? aadhaarLastFour.trim() : undefined,
            product_type: productType,
            loan_amount_requested: amount,
            source_type: sourceType,
            source_name: sourceType === 'direct'
              ? 'Direct Customer Walk-in / Telephonic'
              : (selectedPartner ? `Referral: ${selectedPartner.name}` : 'Referral Partner Desk'),
            referral_profile_id: selectedPartner ? selectedPartner.id : null,
            referral_partner_id: selectedPartner ? selectedPartner.id : null,
            referral_partner_name: selectedPartner ? selectedPartner.name : null,
            referral_partner_mobile: selectedPartner ? selectedPartner.mobile_primary : null,
            referral_node: selectedPartner ? `${selectedPartner.name} Channel` : 'Direct Internal Desk',
            vehicle_make: vehicleMake.trim(),
            vehicle_model: vehicleModel.trim() || 'Standard Variant',
            vehicle_condition: vehicleCondition,
            vehicle_registration_no: vehicleRegNo.trim() ? vehicleRegNo.replace(/[\s\-]/g, '').toUpperCase() : undefined,
            notes: `Intake Notes: ${sourcingNotes.trim()} | Purpose: ${loanPurpose.trim()} | Pref Lender: ${preferredLender.trim()}`,
          }

          const res = await api.post<{ case: { id: string; case_no: string } }>('/cases', payload)
          setCreatedCaseId(res.case.id)
          setCreatedCaseNo(res.case.case_no)
          setCurrentStep(4)
        } catch (err: any) {
          const detail = err?.details?.[0]?.message || err?.message || 'Failed to initialize case record.'
          setErrorMessage(`Validation Notice: ${detail}`)
          return
        } finally {
          setIsSubmitting(false)
        }
      } else {
        setCurrentStep(4)
      }
    }
  }

  // Handle Multi-file Upload in Step 4
  const handleFileSelect = async (files: FileList | null) => {
    if (!files || files.length === 0 || !createdCaseId) return
    setUploadingDoc(true)
    setErrorMessage(null)

    const selectedType = documentTypes.find((t) => t.id === selectedDocTypeId) || documentTypes[0]

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      try {
        const formData = new FormData()
        formData.append('case_id', createdCaseId)
        formData.append('document_type_id', selectedType ? selectedType.id : selectedDocTypeId)
        formData.append('file', file)

        const res = await api.post<any>('/documents/upload', formData)
        const newDoc: IntakeUploadedDoc = {
          id: res.id,
          documentTypeId: selectedType?.id || '',
          categoryName: selectedType?.name || file.name,
          fileName: file.name,
          fileSize: file.size,
          status: res.status || 'under_review',
          scanResult: res.scan_result,
          createdAt: new Date().toISOString(),
        }
        setUploadedDocs((prev) => [newDoc, ...prev])
      } catch (err: any) {
        setErrorMessage(`Upload failed for ${file.name}: ${err?.message || 'Server error'}`)
      }
    }
    setUploadingDoc(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // Quick OCR Extraction Review Handler
  const handleOpenReview = (doc: IntakeUploadedDoc) => {
    if (doc.scanResult) {
      setActiveReviewDoc({
        id: doc.id,
        scanResult: doc.scanResult,
        typeName: doc.categoryName,
      })
    }
  }

  const handleReviewSaved = (updatedDoc: any) => {
    setUploadedDocs((prev) =>
      prev.map((d) => (d.id === updatedDoc.id ? { ...d, status: updatedDoc.status } : d))
    )
    setActiveReviewDoc(null)
  }

  return (
    <div className="intake-workspace">
      {/* Workspace Top Header */}
      <div className="intake-header">
        <div className="intake-title-group">
          <div className="intake-badge">FINANCIAL ONBOARDING WORKSPACE</div>
          <h1 className="intake-title">Case Intake & Document Processing</h1>
          <p className="intake-subtitle">
            Convert unstructured borrower leads and WhatsApp file drops into validated, multi-lender loan files.
          </p>
        </div>

        {createdCaseNo && (
          <div className="intake-case-tag">
            <span className="case-tag-label">Active Case Dossier:</span>
            <span className="case-tag-number">#{createdCaseNo}</span>
          </div>
        )}
      </div>

      {/* Stepper Progress Bar */}
      <div className="intake-stepper">
        <div className={`step-node ${currentStep >= 1 ? 'step-node--active' : ''} ${currentStep > 1 ? 'step-node--completed' : ''}`}>
          <div className="step-circle">{currentStep > 1 ? '✓' : '1'}</div>
          <div className="step-label-group">
            <div className="step-title">Source Attribution</div>
            <div className="step-desc">Dealer / Partner / Channel</div>
          </div>
        </div>
        <div className="step-connector" />

        <div className={`step-node ${currentStep >= 2 ? 'step-node--active' : ''} ${currentStep > 2 ? 'step-node--completed' : ''}`}>
          <div className="step-circle">{currentStep > 2 ? '✓' : '2'}</div>
          <div className="step-label-group">
            <div className="step-title">Customer Profile</div>
            <div className="step-desc">KYC & Demographics</div>
          </div>
        </div>
        <div className="step-connector" />

        <div className={`step-node ${currentStep >= 3 ? 'step-node--active' : ''} ${currentStep > 3 ? 'step-node--completed' : ''}`}>
          <div className="step-circle">{currentStep > 3 ? '✓' : '3'}</div>
          <div className="step-label-group">
            <div className="step-title">Loan & Asset</div>
            <div className="step-desc">Product, Vehicle, Amount</div>
          </div>
        </div>
        <div className="step-connector" />

        <div className={`step-node ${currentStep >= 4 ? 'step-node--active' : ''}`}>
          <div className="step-circle">4</div>
          <div className="step-label-group">
            <div className="step-title">Document & OCR</div>
            <div className="step-desc">Upload, Scan & Verify</div>
          </div>
        </div>
      </div>

      {/* Error Alert Box */}
      {errorMessage && (
        <div className="intake-error-banner" role="alert">
          <span className="error-icon">⚠️</span>
          <span>{errorMessage}</span>
        </div>
      )}

      {/* STEP 1: SOURCE ATTRIBUTION */}
      {currentStep === 1 && (
        <div className="intake-card">
          <div className="card-section-header">
            <h2 className="section-heading">Step 1 — Lead Sourcing & Inward Attribution</h2>
            <p className="section-subtext">Record where the loan inquiry originated for commission attribution and conversion reporting.</p>
          </div>

          <div className="form-grid-2">
            <div className="form-field">
              <label className="field-label" htmlFor="intake-source-type">Lead Source *</label>
              <select
                id="intake-source-type"
                className="field-select"
                value={sourceType}
                onChange={(e) => handleSourceTypeChange(e.target.value as 'direct' | 'referral')}
              >
                <option value="direct">Direct</option>
                <option value="referral">Referral</option>
              </select>
              <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '4px', display: 'block' }}>
                {sourceType === 'direct'
                  ? 'For walk-ins, phone enquiries, direct enquiries entered by an administrator, or direct WhatsApp enquiries.'
                  : 'For leads referred by registered partners, sub-DSAs, connectors, dealerships, or referral links.'}
              </span>
            </div>

            {sourceType === 'referral' && (
              <div className="form-field">
                <label className="field-label" htmlFor="intake-referral-partner">Select Referral Partner *</label>
                {loadingPartners ? (
                  <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>Loading registered partners...</p>
                ) : referralPartners.length === 0 ? (
                  <div style={{ padding: '10px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px' }}>
                    <p style={{ margin: '0 0 6px', fontSize: '13px', color: '#b91c1c', fontWeight: 500 }}>
                      ⚠️ No referral partners registered yet.
                    </p>
                    <button
                      type="button"
                      className="stitch-action-pill"
                      style={{ padding: '4px 10px', fontSize: '12px', cursor: 'pointer' }}
                      onClick={() => navigate('/referrals')}
                    >
                      Register a Partner in Referral Partners section →
                    </button>
                  </div>
                ) : (
                  <>
                    {referralPartners.length > 5 && (
                      <input
                        type="text"
                        className="field-input"
                        placeholder="Search partner by name or phone..."
                        value={partnerSearch}
                        onChange={(e) => setPartnerSearch(e.target.value)}
                        style={{ marginBottom: '6px', fontSize: '12px', padding: '6px 10px' }}
                      />
                    )}
                    <select
                      id="intake-referral-partner"
                      className="field-select"
                      value={selectedPartnerId}
                      onChange={(e) => setSelectedPartnerId(e.target.value)}
                      required
                    >
                      <option value="">-- Select Referral Partner --</option>
                      {filteredPartners.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.mobile_primary || 'No phone'}{p.verification_status === 'verified' ? ' • Verified' : ''})
                        </option>
                      ))}
                    </select>
                  </>
                )}
              </div>
            )}

            <div className="form-field">
              <label className="field-label">Inward File Received Date</label>
              <input
                type="date"
                className="field-input"
                value={receivedDate}
                onChange={(e) => setReceivedDate(e.target.value)}
              />
            </div>

            <div className="form-field">
              <label className="field-label">Sourcing Notes & Context</label>
              <input
                className="field-input"
                placeholder="e.g. Customer urgently looking for delivery before Diwali"
                value={sourcingNotes}
                onChange={(e) => setSourcingNotes(e.target.value)}
              />
            </div>
          </div>

          <div className="form-actions-row">
            <Button variant="ghost" onClick={() => navigate('/cases')}>Cancel Intake</Button>
            <Button variant="primary" onClick={handleNextStep}>Continue to Customer Profile →</Button>
          </div>
        </div>
      )}

      {/* STEP 2: CUSTOMER PROFILE */}
      {currentStep === 2 && (
        <div className="intake-card">
          <div className="card-section-header">
            <h2 className="section-heading">Step 2 — Borrower KYC & Financial Profile</h2>
            <p className="section-subtext">Capture primary applicant personal information, PAN, and monthly income details.</p>
          </div>

          <div className="form-grid-3">
            <div className="form-field">
              <label className="field-label">Full Legal Name *</label>
              <input
                className="field-input"
                placeholder="e.g. Vikramaditya S. Rao"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />
            </div>

            <div className="form-field">
              <label className="field-label">Primary Mobile Number *</label>
              <input
                className="field-input"
                placeholder="e.g. 9845012345"
                value={mobileNumber}
                onChange={(e) => setMobileNumber(e.target.value)}
                required
              />
            </div>

            <div className="form-field">
              <label className="field-label">Alternate Mobile</label>
              <input
                className="field-input"
                placeholder="e.g. 9820098765"
                value={alternateMobile}
                onChange={(e) => setAlternateMobile(e.target.value)}
              />
            </div>

            <div className="form-field">
              <label className="field-label">Permanent Account Number (PAN)</label>
              <input
                className="field-input text-uppercase font-mono"
                placeholder="e.g. ABCVR9921M"
                maxLength={10}
                value={panNumber}
                onChange={(e) => setPanNumber(e.target.value.toUpperCase())}
              />
            </div>

            <div className="form-field">
              <label className="field-label">Aadhaar (Last 4 Digits)</label>
              <input
                className="field-input font-mono"
                placeholder="e.g. 9876"
                maxLength={4}
                value={aadhaarLastFour}
                onChange={(e) => setAadhaarLastFour(e.target.value)}
              />
            </div>

            <div className="form-field">
              <label className="field-label">Date of Birth</label>
              <input
                type="date"
                className="field-input"
                value={dateOfBirth}
                onChange={(e) => setDateOfBirth(e.target.value)}
              />
            </div>

            <div className="form-field">
              <label className="field-label">Gender</label>
              <select className="field-select" value={gender} onChange={(e) => setGender(e.target.value)}>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div className="form-field">
              <label className="field-label">Employment Type</label>
              <select className="field-select" value={employmentType} onChange={(e) => setEmploymentType(e.target.value)}>
                <option value="salaried">Salaried (MNC / Corporate)</option>
                <option value="self_employed_professional">Self-Employed Professional (Doctor, CA)</option>
                <option value="self_employed_business">Self-Employed Businessman / Trader</option>
                <option value="commercial_fleet_owner">Commercial Fleet Operator</option>
              </select>
            </div>

            <div className="form-field">
              <label className="field-label">Net Monthly Income (₹)</label>
              <input
                type="number"
                className="field-input font-mono"
                placeholder="75000"
                value={monthlyIncome}
                onChange={(e) => setMonthlyIncome(e.target.value)}
              />
            </div>
          </div>

          <div className="form-grid-3 form-subgrid">
            <div className="form-field form-span-2">
              <label className="field-label">Residential Address</label>
              <input
                className="field-input"
                placeholder="Flat / Building, Road, Landmark"
                value={addressLine}
                onChange={(e) => setAddressLine(e.target.value)}
              />
            </div>

            <div className="form-field">
              <label className="field-label">City</label>
              <input className="field-input" value={city} onChange={(e) => setCity(e.target.value)} />
            </div>

            <div className="form-field">
              <label className="field-label">State</label>
              <input className="field-input" value={state} onChange={(e) => setState(e.target.value)} />
            </div>

            <div className="form-field">
              <label className="field-label">Postal Pincode</label>
              <input className="field-input font-mono" value={pincode} onChange={(e) => setPincode(e.target.value)} />
            </div>
          </div>

          <div className="form-actions-row">
            <Button variant="ghost" onClick={() => setCurrentStep(1)}>← Back to Sourcing</Button>
            <Button variant="primary" onClick={handleNextStep}>Continue to Loan & Asset →</Button>
          </div>
        </div>
      )}

      {/* STEP 3: LOAN & ASSET */}
      {currentStep === 3 && (
        <div className="intake-card">
          <div className="card-section-header">
            <h2 className="section-heading">Step 3 — Loan Requirement & Vehicle Asset Details</h2>
            <p className="section-subtext">Specify the loan product structure, requested funding, and collateral vehicle specifications.</p>
          </div>

          <div className="form-grid-3">
            <div className="form-field">
              <label className="field-label">Loan Product Category *</label>
              <select className="field-select" value={productType} onChange={(e) => setProductType(e.target.value)}>
                <option value="used_car">Used Car Loan (Pre-Owned)</option>
                <option value="new_car">New Car Loan (Fresh Purchase)</option>
                <option value="commercial_vehicle">Commercial Vehicle (LCV / HCV / Bus)</option>
                <option value="two_wheeler">Two-Wheeler Loan</option>
                <option value="refinance">Car Refinance / Equity Cash-Out</option>
                <option value="top_up">Top-Up Existing Vehicle Loan</option>
                <option value="balance_transfer">Balance Transfer (Lower Interest)</option>
              </select>
            </div>

            <div className="form-field">
              <label className="field-label">Requested Loan Amount (₹) *</label>
              <input
                type="number"
                className="field-input font-mono font-semibold"
                placeholder="650000"
                value={loanAmount}
                onChange={(e) => setLoanAmount(e.target.value)}
                required
              />
            </div>

            <div className="form-field">
              <label className="field-label">Tenure (Months)</label>
              <select className="field-select" value={tenureMonths} onChange={(e) => setTenureMonths(e.target.value)}>
                <option value="24">24 Months (2 Years)</option>
                <option value="36">36 Months (3 Years)</option>
                <option value="48">48 Months (4 Years)</option>
                <option value="60">60 Months (5 Years)</option>
                <option value="84">84 Months (7 Years - New Car)</option>
              </select>
            </div>

            <div className="form-field">
              <label className="field-label">Loan Purpose & Notes</label>
              <input
                className="field-input"
                placeholder="e.g. Upgrade family car / Commercial fleet addition"
                value={loanPurpose}
                onChange={(e) => setLoanPurpose(e.target.value)}
              />
            </div>

            <div className="form-field">
              <label className="field-label">Preferred Financing Partner (Optional)</label>
              <input
                className="field-input"
                placeholder="e.g. HDFC Bank / ICICI / Tata Capital"
                value={preferredLender}
                onChange={(e) => setPreferredLender(e.target.value)}
              />
            </div>

            <div className="form-field">
              <label className="field-label">Vehicle Make / Manufacturer *</label>
              <input
                className="field-input"
                placeholder="e.g. Hyundai, Tata, Mahindra, Maruti"
                value={vehicleMake}
                onChange={(e) => setVehicleMake(e.target.value)}
                required
              />
            </div>

            <div className="form-field">
              <label className="field-label">Vehicle Model & Variant</label>
              <input
                className="field-input"
                placeholder="e.g. Creta SX 1.5 Diesel"
                value={vehicleModel}
                onChange={(e) => setVehicleModel(e.target.value)}
              />
            </div>

            <div className="form-field">
              <label className="field-label">Vehicle Condition</label>
              <select
                className="field-select"
                value={vehicleCondition}
                onChange={(e) => setVehicleCondition(e.target.value as 'new' | 'used')}
              >
                <option value="used">Used / Pre-Owned</option>
                <option value="new">Brand New (Showroom)</option>
              </select>
            </div>

            <div className="form-field">
              <label className="field-label">Registration Number (RC)</label>
              <input
                className="field-input font-mono text-uppercase"
                placeholder="e.g. MH-02-EE-4501"
                value={vehicleRegNo}
                onChange={(e) => setVehicleRegNo(e.target.value.toUpperCase())}
              />
            </div>

            <div className="form-field">
              <label className="field-label">Manufacturing Year</label>
              <input
                className="field-input font-mono"
                placeholder="2022"
                value={manufacturingYear}
                onChange={(e) => setManufacturingYear(e.target.value)}
              />
            </div>

            <div className="form-field">
              <label className="field-label">Estimated Valuation (₹)</label>
              <input
                type="number"
                className="field-input font-mono"
                placeholder="820000"
                value={valuationAmount}
                onChange={(e) => setValuationAmount(e.target.value)}
              />
            </div>
          </div>

          <div className="form-actions-row">
            <Button variant="ghost" onClick={() => setCurrentStep(2)}>← Back to Customer</Button>
            <Button variant="primary" loading={isSubmitting} onClick={handleNextStep}>
              {isSubmitting ? 'Creating Case Record...' : 'Create Case & Proceed to Documents →'}
            </Button>
          </div>
        </div>
      )}

      {/* STEP 4: DOCUMENT INTAKE & OCR PIPELINE */}
      {currentStep === 4 && (
        <div className="intake-card">
          <div className="card-section-header">
            <div className="pipeline-success-tag">CASE FILE #{createdCaseNo} CREATED SUCCESSFULLY</div>
            <h2 className="section-heading">Step 4 — Document Intake, Processing & OCR Extraction</h2>
            <p className="section-subtext">
              Drop customer KYC and asset files to run automated validation, OCR field extraction, and human verification.
            </p>
          </div>

          {/* Document Processing Pipeline Indicator */}
          <div className="processing-pipeline-bar">
            <div className="pipeline-step pipeline-step--active">
              <span className="pipeline-num">1</span>
              <span>Upload</span>
            </div>
            <div className="pipeline-arrow">→</div>
            <div className="pipeline-step pipeline-step--active">
              <span className="pipeline-num">2</span>
              <span>Validate & Quarantine</span>
            </div>
            <div className="pipeline-arrow">→</div>
            <div className="pipeline-step pipeline-step--active">
              <span className="pipeline-num">3</span>
              <span>OCR Extraction</span>
            </div>
            <div className="pipeline-arrow">→</div>
            <div className="pipeline-step">
              <span className="pipeline-num">4</span>
              <span>Human Review</span>
            </div>
            <div className="pipeline-arrow">→</div>
            <div className="pipeline-step">
              <span className="pipeline-num">5</span>
              <span>Verify & Apply</span>
            </div>
          </div>

          {/* Multi-file Upload Controls */}
          <div className="upload-zone-box">
            <div className="upload-category-selector">
              <label className="selector-label">Target Document Category:</label>
              <select
                className="field-select category-select"
                value={selectedDocTypeId}
                onChange={(e) => setSelectedDocTypeId(e.target.value)}
              >
                {documentTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.category.toUpperCase()})
                  </option>
                ))}
              </select>
            </div>

            <div
              className={`dropzone-surface ${uploadingDoc ? 'dropzone-surface--uploading' : ''}`}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.jpg,.jpeg,.png"
                style={{ display: 'none' }}
                onChange={(e) => handleFileSelect(e.target.files)}
              />
              <div className="dropzone-icon">📁</div>
              <div className="dropzone-title">
                {uploadingDoc ? 'Uploading & Processing File...' : 'Drop documents here or Browse Files'}
              </div>
              <div className="dropzone-hint">
                Supports PDF, JPG, PNG up to 15MB. Automatically triggers deterministic OCR extraction pipeline.
              </div>
            </div>
          </div>

          {/* Uploaded Documents & Processing Queue */}
          <div className="uploaded-list-section">
            <div className="uploaded-list-header">
              <span className="list-heading">Intake Processing Queue ({uploadedDocs.length} Documents)</span>
              <span className="list-note">Human-in-the-loop review available for extracted files</span>
            </div>

            {uploadedDocs.length === 0 ? (
              <div className="empty-intake-docs">
                <p>No documents uploaded yet for this case file.</p>
                <p className="empty-hint">Upload applicant PAN card, Aadhaar card, or Bank Statement to test automated OCR extraction.</p>
              </div>
            ) : (
              <div className="docs-table-wrapper">
                <table className="intake-table">
                  <thead>
                    <tr>
                      <th>Document</th>
                      <th>Category</th>
                      <th>Size</th>
                      <th>Pipeline Status</th>
                      <th>OCR Confidence</th>
                      <th>Review Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {uploadedDocs.map((doc) => {
                      const fieldsCount = doc.scanResult?.fields?.length || 0
                      const avgConfidence = fieldsCount > 0
                        ? Math.round((doc.scanResult!.fields.reduce((acc, f) => acc + f.confidence, 0) / fieldsCount) * 100)
                        : null

                      return (
                        <tr key={doc.id}>
                          <td className="doc-name-cell">
                            <span className="file-icon">📄</span>
                            <span className="font-semibold">{doc.fileName}</span>
                          </td>
                          <td>
                            <span className="category-chip">{doc.categoryName}</span>
                          </td>
                          <td className="font-mono text-muted text-sm">
                            {(doc.fileSize / 1024).toFixed(1)} KB
                          </td>
                          <td>
                            <span className={`status-pill status-pill--${doc.status}`}>
                              {doc.status === 'verified' ? '✓ Verified' : 'Under Review'}
                            </span>
                          </td>
                          <td>
                            {avgConfidence !== null ? (
                              <span className="confidence-chip">
                                {avgConfidence}% Confidence ({fieldsCount} fields)
                              </span>
                            ) : (
                              <span className="text-muted text-sm">—</span>
                            )}
                          </td>
                          <td>
                            {doc.scanResult ? (
                              <button
                                type="button"
                                className="review-action-btn"
                                onClick={() => handleOpenReview(doc)}
                              >
                                Review Extracted Data →
                              </button>
                            ) : (
                              <span className="text-muted text-sm">Ready</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Final Navigation Actions */}
          <div className="intake-footer-actions">
            <Button
              variant="outline"
              onClick={() => navigate('/cases')}
            >
              Return to Pipeline List
            </Button>
            <Button
              variant="primary"
              onClick={() => navigate(`/cases/${createdCaseId}`)}
            >
              Open Complete Case Dossier #{createdCaseNo} →
            </Button>
          </div>
        </div>
      )}

      {/* Human-in-the-Loop 2-Column OCR Review Modal */}
      {activeReviewDoc && (
        <DocumentExtractionReviewModal
          isOpen={true}
          documentId={activeReviewDoc.id}
          documentName={activeReviewDoc.typeName}
          documentType={activeReviewDoc.typeName}
          scanResult={activeReviewDoc.scanResult}
          onClose={() => setActiveReviewDoc(null)}
          onVerified={handleReviewSaved}
        />
      )}
    </div>
  )
}
