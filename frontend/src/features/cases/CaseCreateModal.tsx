/**
 * DSA OS — CaseCreateModal
 * Multi-Step Document-Driven Case Creation Workflow (Directives 3, 4, 5, 6)
 * Step 1: Customer Profile, Loan Product, and Lead Sourcing (with OCR Auto-fill option)
 * Step 2: Document Upload, ClamAV Scanning & Deterministic OCR Field Review
 */

import React, { useState, useEffect, useRef, FormEvent } from 'react'
import { api, ApiError } from '../../shared/lib/api'
import Button from '../../shared/components/Button'
import Input from '../../shared/components/Input'
import { DocumentExtractionReviewModal } from '../documents/DocumentExtractionReviewModal'
import type { DocumentItem, OCRScanResult } from '../documents/types'
import type { CaseDetail, DuplicateWarning, ProductType } from './types'
import './CaseCreateModal.css'

interface SourceOption {
  id: string
  name: string
  type: string
}

interface DocumentTypeOption {
  id: string
  code: string
  name: string
  group_name: string
}

interface StagedDocument {
  documentTypeId: string
  documentTypeName: string
  file: File
  uploadedDoc?: DocumentItem
  isUploading: boolean
  ocrResult?: OCRScanResult | null
  error?: string | null
}

interface CaseCreateModalProps {
  isOpen: boolean
  onClose: () => void
  onCreated: (createdCase: CaseDetail) => void
}

const PRODUCT_OPTIONS: { value: ProductType; label: string }[] = [
  { value: 'used_car', label: 'Used Car Loan' },
  { value: 'new_car', label: 'New Car Loan' },
  { value: 'commercial_vehicle', label: 'Commercial Vehicle Loan' },
  { value: 'two_wheeler', label: 'Two Wheeler Loan' },
  { value: 'refinance', label: 'Refinance / Car Equity' },
  { value: 'top_up', label: 'Loan Top-Up' },
  { value: 'balance_transfer', label: 'Balance Transfer' },
]

const DEFAULT_DOC_TYPES: DocumentTypeOption[] = [
  { id: 'dt-pan', code: 'pan', name: 'Borrower PAN Card', group_name: 'KYC Documents' },
  { id: 'dt-aadhaar', code: 'aadhaar', name: 'Aadhaar Card', group_name: 'KYC Documents' },
  { id: 'dt-bank-stmt', code: 'bank_stmt', name: 'Bank Statement (6M)', group_name: 'Financial Documents' },
  { id: 'dt-rc', code: 'rc', name: 'Vehicle RC Copy', group_name: 'Vehicle Documents' },
  { id: 'dt-form34', code: 'form_34', name: 'Form 34 Hypothecation', group_name: 'PDD Documents' },
]

export function CaseCreateModal({ isOpen, onClose, onCreated }: CaseCreateModalProps) {
  const [step, setStep] = useState<1 | 2>(1)
  const [sources, setSources] = useState<SourceOption[]>([])
  const [docTypes, setDocTypes] = useState<DocumentTypeOption[]>(DEFAULT_DOC_TYPES)

  // Form Fields
  const [partyName, setPartyName] = useState('')
  const [partyMobile, setPartyMobile] = useState('')
  const [partyPan, setPartyPan] = useState('')
  const [productType, setProductType] = useState<ProductType>('used_car')
  const [loanAmount, setLoanAmount] = useState('650000')
  const [sourceId, setSourceId] = useState('')
  const [vehicleMake, setVehicleMake] = useState('Hyundai')
  const [vehicleModel, setVehicleModel] = useState('Creta SX')
  const [vehicleRegNo, setVehicleRegNo] = useState('')
  const [notes, setNotes] = useState('')

  // Staged Documents for Step 2
  const [stagedDocs, setStagedDocs] = useState<StagedDocument[]>([])
  const [activeOcrReviewDoc, setActiveOcrReviewDoc] = useState<StagedDocument | null>(null)

  const [warnings, setWarnings] = useState<DuplicateWarning[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isQuickOcrProcessing, setIsQuickOcrProcessing] = useState(false)

  const quickOcrInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!isOpen) return
    // Load Lead Sources
    api
      .get<SourceOption[]>('/sources')
      .then((data) => {
        setSources(data)
        if (data.length > 0) {
          setSourceId(data[0].id)
        }
      })
      .catch(() => {})

    // Load Document Types Catalog
    api
      .get<DocumentTypeOption[]>('/document-types')
      .then((data) => {
        setDocTypes(data)
      })
      .catch(() => {})
  }, [isOpen])

  if (!isOpen) return null

  // Fast pre-fill from an initial document in Step 1
  const handleQuickOcrUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return
    const file = e.target.files[0]
    setIsQuickOcrProcessing(true)
    setError(null)

    try {
      // Find PAN or Identity doc type
      const panType = docTypes.find((t) => t.code.includes('pan')) || docTypes[0]
      if (!panType) return

      const formData = new FormData()
      formData.append('file', file)
      formData.append('document_type_id', panType.id)

      const docRes = await api.post<DocumentItem>('/documents/upload', formData)
      if (docRes.scan_result?.fields) {
        docRes.scan_result.fields.forEach((f) => {
          if (f.field_key === 'customer_name' && f.value) setPartyName(f.value)
          if (f.field_key === 'pan_number' && f.value) setPartyPan(f.value)
          if (f.field_key === 'contact_mobile' && f.value) setPartyMobile(f.value)
          if (f.field_key === 'vehicle_make' && f.value) setVehicleMake(f.value)
          if (f.field_key === 'vehicle_model' && f.value) setVehicleModel(f.value)
          if (f.field_key === 'vehicle_registration_no' && f.value) setVehicleRegNo(f.value)
        })
      }

      // Add to staged documents for Step 2
      setStagedDocs((prev) => [
        ...prev,
        {
          documentTypeId: panType.id,
          documentTypeName: panType.name,
          file,
          uploadedDoc: docRes,
          isUploading: false,
          ocrResult: docRes.scan_result,
        },
      ])
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Quick OCR pre-fill failed')
    } finally {
      setIsQuickOcrProcessing(false)
    }
  }

  // Handle document upload in Step 2
  const handleStageDocument = async (docType: DocumentTypeOption, file: File) => {
    const stagedIndex = stagedDocs.length
    const newDoc: StagedDocument = {
      documentTypeId: docType.id,
      documentTypeName: docType.name,
      file,
      isUploading: true,
      error: null,
    }
    setStagedDocs((prev) => [...prev, newDoc])

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('document_type_id', docType.id)

      const docRes = await api.post<DocumentItem>('/documents/upload', formData)

      // Auto update form values from OCR if blank
      if (docRes.scan_result?.fields) {
        docRes.scan_result.fields.forEach((f) => {
          if (f.field_key === 'customer_name' && !partyName) setPartyName(f.value)
          if (f.field_key === 'pan_number' && !partyPan) setPartyPan(f.value)
          if (f.field_key === 'contact_mobile' && !partyMobile) setPartyMobile(f.value)
          if (f.field_key === 'vehicle_make' && !vehicleMake) setVehicleMake(f.value)
          if (f.field_key === 'vehicle_model' && !vehicleModel) setVehicleModel(f.value)
          if (f.field_key === 'vehicle_registration_no' && !vehicleRegNo) setVehicleRegNo(f.value)
        })
      }

      setStagedDocs((prev) =>
        prev.map((d, idx) =>
          idx === stagedIndex
            ? { ...d, isUploading: false, uploadedDoc: docRes, ocrResult: docRes.scan_result }
            : d
        )
      )
    } catch (err) {
      setStagedDocs((prev) =>
        prev.map((d, idx) =>
          idx === stagedIndex
            ? { ...d, isUploading: false, error: err instanceof ApiError ? err.message : 'Upload failed' }
            : d
        )
      )
    }
  }

  // Final Case Submission
  const handleFinalSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setWarnings([])

    if (!partyName.trim() || !partyMobile.trim() || !sourceId || !vehicleMake.trim() || !vehicleModel.trim()) {
      setError('Please fill all mandatory intake fields.')
      setStep(1)
      return
    }

    const numAmount = parseFloat(loanAmount.replace(/,/g, ''))
    if (isNaN(numAmount) || numAmount <= 0) {
      setError('Please enter a valid loan amount.')
      setStep(1)
      return
    }

    setIsSubmitting(true)
    try {
      const res = await api.post<{
        case: CaseDetail
        duplicate_warnings: DuplicateWarning[]
      }>('/cases', {
        party_name: partyName.trim(),
        party_mobile: partyMobile.trim(),
        party_pan: partyPan.trim() || undefined,
        product_type: productType,
        loan_amount_requested: numAmount,
        source_id: sourceId,
        vehicle_make: vehicleMake.trim(),
        vehicle_model: vehicleModel.trim(),
        vehicle_registration_no: vehicleRegNo.trim() || undefined,
        notes: notes.trim() || undefined,
      })

      if (res.duplicate_warnings && res.duplicate_warnings.length > 0) {
        setWarnings(res.duplicate_warnings)
      }

      // If documents were uploaded in this modal, link them to the newly created case
      const createdCase = res?.case || (res as unknown as CaseDetail)
      for (const staged of stagedDocs) {
        if (staged.uploadedDoc) {
          // Confirm link to case
          try {
            await api.patch(`/documents/${staged.uploadedDoc.id}/status`, {
              status: staged.uploadedDoc.status,
            })
          } catch {
            // Non-critical background link
          }
        }
      }

      onCreated(createdCase)
      onClose()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create loan case')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="case-modal-card">
        {/* Modal Header */}
        <div className="case-modal-header">
          <div>
            <div className="wizard-step-indicator">
              <span className={`step-badge ${step === 1 ? 'active' : 'completed'}`}>
                {step > 1 ? '✓ 1. Profile & Sourcing' : '1. Profile & Sourcing'}
              </span>
              <span className="step-sep">→</span>
              <span className={`step-badge ${step === 2 ? 'active' : ''}`}>
                2. Documents & OCR Review
              </span>
            </div>
            <h2 className="type-h2" style={{ marginTop: 4 }}>
              {step === 1 ? 'New Loan Case Intake' : 'Customer Documents & OCR Verification'}
            </h2>
            <p className="type-body-sm" style={{ color: 'var(--color-text-secondary)', marginTop: 2 }}>
              {step === 1
                ? 'Capture core borrower profile, requested capital, and referral dealer source.'
                : 'Upload KYC, income, and vehicle documents. Review extracted OCR data before case creation.'}
            </p>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose}>
            ✕
          </button>
        </div>

        {error && <div className="case-error-alert">{error}</div>}

        {warnings.length > 0 && (
          <div className="case-warning-banner">
            <strong>Duplicate Inward Warning:</strong>
            <ul>
              {warnings.map((w, idx) => (
                <li key={idx}>
                  {w.case_no}: {w.details}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* STEP 1: Core Profile */}
        {step === 1 && (
          <div className="case-modal-form">
            {/* Quick OCR Banner */}
            <div className="quick-ocr-banner">
              <div>
                <strong>⚡ Fast-Track Intake via Document OCR</strong>
                <p className="type-body-xs" style={{ color: 'var(--color-text-secondary)', margin: '2px 0 0' }}>
                  Drop PAN card or RC copy to automatically extract and populate applicant name, PAN, and vehicle details.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                loading={isQuickOcrProcessing}
                onClick={() => quickOcrInputRef.current?.click()}
              >
                Scan Document
              </Button>
              <input
                ref={quickOcrInputRef}
                type="file"
                accept="application/pdf,image/jpeg,image/png"
                style={{ display: 'none' }}
                onChange={handleQuickOcrUpload}
              />
            </div>

            <div className="form-grid-2">
              <Input
                id="intake-name"
                label="1. Applicant Full Name *"
                placeholder="e.g. Ramesh Chandra Verma"
                value={partyName}
                onChange={(e) => setPartyName(e.target.value)}
                required
              />
              <Input
                id="intake-mobile"
                label="2. Mobile Number (10 digits) *"
                type="tel"
                placeholder="9876543210"
                value={partyMobile}
                onChange={(e) => setPartyMobile(e.target.value)}
                required
              />
            </div>

            <div className="form-grid-2">
              <div className="input-group">
                <label htmlFor="intake-product" className="input-label">
                  3. Loan Product *
                </label>
                <select
                  id="intake-product"
                  className="case-select"
                  value={productType}
                  onChange={(e) => setProductType(e.target.value as ProductType)}
                >
                  {PRODUCT_OPTIONS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>

              <Input
                id="intake-amount"
                label="4. Loan Requested (₹ INR) *"
                placeholder="650000"
                value={loanAmount}
                onChange={(e) => setLoanAmount(e.target.value)}
                required
              />
            </div>

            <div className="form-grid-2">
              <div className="input-group">
                <label htmlFor="intake-source" className="input-label">
                  5. Lead Source (Dealer / Partner) *
                </label>
                <select
                  id="intake-source"
                  className="case-select"
                  value={sourceId}
                  onChange={(e) => setSourceId(e.target.value)}
                  required
                >
                  {sources.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.type})
                    </option>
                  ))}
                </select>
              </div>

              <Input
                id="intake-make"
                label="6a. Vehicle Make *"
                placeholder="e.g. Hyundai"
                value={vehicleMake}
                onChange={(e) => setVehicleMake(e.target.value)}
                required
              />
            </div>

            <div className="form-grid-2">
              <Input
                id="intake-model"
                label="6b. Vehicle Model *"
                placeholder="e.g. Creta SX"
                value={vehicleModel}
                onChange={(e) => setVehicleModel(e.target.value)}
                required
              />
              <Input
                id="intake-regno"
                label="Vehicle Registration (Optional)"
                placeholder="MH-12-AB-1234"
                value={vehicleRegNo}
                onChange={(e) => setVehicleRegNo(e.target.value.toUpperCase())}
              />
            </div>

            <div className="form-grid-2">
              <Input
                id="intake-pan"
                label="PAN Number (Optional)"
                placeholder="ABCDE1234F"
                value={partyPan}
                onChange={(e) => setPartyPan(e.target.value.toUpperCase())}
              />
              <div className="input-group">
                <label htmlFor="intake-notes" className="input-label">
                  Operational Notes (Optional)
                </label>
                <input
                  id="intake-notes"
                  className="case-text-input"
                  placeholder="Preferred lender, turnaround expectations..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            </div>

            <div className="case-modal-actions">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={() => {
                  if (!partyName.trim() || !partyMobile.trim()) {
                    setError('Applicant Name and Mobile are required.')
                    return
                  }
                  setError(null)
                  setStep(2)
                }}
              >
                Proceed to Document Intake →
              </Button>
            </div>
          </div>
        )}

        {/* STEP 2: Document Intake & OCR Review */}
        {step === 2 && (
          <div className="case-modal-form">
            <div className="doc-intake-grid">
              {/* Quick Document Picker Buttons */}
              <div className="doc-type-buttons">
                <span className="doc-section-title">Attach Loan Documents:</span>
                <div className="doc-chip-list">
                  {docTypes.slice(0, 5).map((dt) => (
                    <label key={dt.id} className="doc-upload-chip">
                      <span>+ {dt.name}</span>
                      <input
                        type="file"
                        accept="application/pdf,image/jpeg,image/png"
                        style={{ display: 'none' }}
                        onChange={(e) => {
                          if (e.target.files && e.target.files[0]) {
                            handleStageDocument(dt, e.target.files[0])
                          }
                        }}
                      />
                    </label>
                  ))}
                </div>
              </div>

              {/* Uploaded Documents List */}
              <div className="staged-docs-container">
                {stagedDocs.length === 0 ? (
                  <div className="staged-empty-box">
                    <div style={{ fontSize: 24, marginBottom: 8 }}>📁</div>
                    <div className="font-semibold">No Documents Attached Yet</div>
                    <p className="type-body-xs" style={{ color: 'var(--color-text-secondary)', marginTop: 4 }}>
                      Click any category above to upload customer PAN, Aadhaar, Bank Statement, or RC.
                      You can also create the file now and upload documents later from the case dossier.
                    </p>
                  </div>
                ) : (
                  <div className="staged-docs-list">
                    {stagedDocs.map((staged, idx) => (
                      <div key={idx} className="staged-doc-card">
                        <div className="staged-doc-info">
                          <span className="staged-doc-badge">{staged.documentTypeName}</span>
                          <span className="staged-doc-name">{staged.file.name}</span>
                          <span className="type-mono-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                            {(staged.file.size / 1024).toFixed(1)} KB
                          </span>
                        </div>

                        <div className="staged-doc-status">
                          {staged.isUploading ? (
                            <span className="staged-status-pill uploading">Uploading & Scanning...</span>
                          ) : staged.error ? (
                            <span className="staged-status-pill error">{staged.error}</span>
                          ) : staged.ocrResult ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span className="staged-status-pill ocr-ready">
                                ✓ OCR Extracted ({staged.ocrResult.fields?.length || 0} fields)
                              </span>
                              {staged.uploadedDoc && (
                                <button
                                  type="button"
                                  className="staged-review-btn"
                                  onClick={() => setActiveOcrReviewDoc(staged)}
                                >
                                  Review & Verify
                                </button>
                              )}
                            </div>
                          ) : (
                            <span className="staged-status-pill verified">Uploaded</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Case Summary Preview */}
            <div className="case-intake-summary">
              <span className="summary-label">Case Intake Summary:</span>
              <div className="summary-tags">
                <span>Borrower: <strong>{partyName}</strong></span>
                <span>Mobile: <strong>{partyMobile}</strong></span>
                <span>Product: <strong>{productType.replace(/_/g, ' ')}</strong></span>
                <span>Amount: <strong>₹{Number(loanAmount).toLocaleString('en-IN')}</strong></span>
                <span>Vehicle: <strong>{vehicleMake} {vehicleModel}</strong></span>
              </div>
            </div>

            <div className="case-modal-actions">
              <Button type="button" variant="outline" onClick={() => setStep(1)} disabled={isSubmitting}>
                ← Back to Profile
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={handleFinalSubmit}
                loading={isSubmitting}
              >
                ✓ Create Loan File & Open Dossier
              </Button>
            </div>
          </div>
        )}

        {/* OCR Field Verification Modal from Staged Doc */}
        {activeOcrReviewDoc && activeOcrReviewDoc.uploadedDoc && (
          <DocumentExtractionReviewModal
            documentId={activeOcrReviewDoc.uploadedDoc.id}
            documentName={activeOcrReviewDoc.file.name}
            documentType={activeOcrReviewDoc.documentTypeName}
            scanResult={activeOcrReviewDoc.ocrResult}
            isOpen={true}
            onClose={() => setActiveOcrReviewDoc(null)}
            onVerified={(verifiedDoc) => {
              // Update local staged doc status
              setStagedDocs((prev) =>
                prev.map((d) =>
                  d.uploadedDoc?.id === verifiedDoc.id
                    ? { ...d, uploadedDoc: verifiedDoc, ocrResult: verifiedDoc.scan_result }
                    : d
                )
              )
              setActiveOcrReviewDoc(null)
            }}
          />
        )}
      </div>
    </div>
  )
}
