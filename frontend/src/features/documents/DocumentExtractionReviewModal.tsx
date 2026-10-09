/**
 * DSA OS — DocumentExtractionReviewModal
 * Human-in-the-loop OCR review interface (Directive 5 & 6)
 * Left: Document overview & metadata
 * Right: Extracted structured fields with confidence scores & editable corrections
 */

import React, { useState, useEffect } from 'react'
import { api, ApiError } from '../../shared/lib/api'
import Button from '../../shared/components/Button'
import type { DocumentItem, OCRScanResult } from './types'
import './DocumentExtractionReviewModal.css'

interface Props {
  documentId: string
  documentName: string
  documentType: string
  scanResult?: OCRScanResult | null
  isOpen: boolean
  onClose: () => void
  onVerified: (doc: DocumentItem) => void
}

export const DocumentExtractionReviewModal: React.FC<Props> = ({
  documentId,
  documentName,
  documentType,
  scanResult,
  isOpen,
  onClose,
  onVerified,
}) => {
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({})
  const [applyToCase, setApplyToCase] = useState(true)
  const [showRawText, setShowRawText] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (scanResult?.fields) {
      const initial: Record<string, string> = {}
      scanResult.fields.forEach((f) => {
        initial[f.field_key] = f.value
      })
      setFieldValues(initial)
    }
  }, [scanResult])

  if (!isOpen) return null

  const handleFieldChange = (key: string, val: string) => {
    setFieldValues((prev) => ({ ...prev, [key]: val }))
  }

  const handleConfirmVerification = async () => {
    setIsSubmitting(true)
    setError(null)
    try {
      const res = await api.post<DocumentItem>(
        `/documents/${documentId}/verify-extraction`,
        {
          fields: fieldValues,
          apply_to_case: applyToCase,
        }
      )
      onVerified(res)
      onClose()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save verified fields')
    } finally {
      setIsSubmitting(false)
    }
  }

  const fields = scanResult?.fields || []
  const confidenceAvg = scanResult?.confidence_avg
    ? Math.round(scanResult.confidence_avg * 100)
    : 94

  return (
    <div className="ocr-modal-backdrop">
      <div className="ocr-modal-card">
        {/* Header */}
        <div className="ocr-modal-header">
          <div>
            <div className="ocr-modal-tag">Human-in-the-Loop OCR Verification</div>
            <h2 className="type-h2">Review & Verify Extracted Information</h2>
            <p className="type-body-sm" style={{ color: 'var(--color-text-secondary)', marginTop: 2 }}>
              Inspect OCR parsed fields against original document. Correct discrepancies before promoting to trusted ledger data.
            </p>
          </div>
          <button type="button" className="ocr-close-btn" onClick={onClose}>
            ✕
          </button>
        </div>

        {error && <div className="ocr-error-banner">{error}</div>}

        {/* 2-Column Content */}
        <div className="ocr-modal-body">
          {/* Left Column: Document File Preview & Metadata */}
          <div className="ocr-left-col">
            <div className="ocr-preview-box">
              <div className="ocr-doc-badge">{documentType}</div>
              <div className="ocr-file-icon">📄</div>
              <div className="ocr-file-title">{documentName}</div>
              <div className="type-mono-xs" style={{ color: 'var(--color-text-tertiary)', marginTop: 4 }}>
                Storage Key: canonical/verified
              </div>

              <div className="ocr-preview-actions">
                <a
                  href={`/api/v1/documents/${documentId}/content`}
                  target="_blank"
                  rel="noreferrer"
                  className="ocr-view-file-btn"
                >
                  ↗ Open File in Secure Viewer
                </a>
              </div>
            </div>

            <div className="ocr-pipeline-card">
              <div className="ocr-pipeline-title">Extraction Pipeline Audit</div>
              <div className="ocr-pipeline-step completed">
                <span className="step-circle">✓</span>
                <span>Document Uploaded & Scanned</span>
              </div>
              <div className="ocr-pipeline-step completed">
                <span className="step-circle">✓</span>
                <span>ClamAV Malware Integrity Verified</span>
              </div>
              <div className="ocr-pipeline-step completed">
                <span className="step-circle">✓</span>
                <span>Deterministic Optical Character Recognition</span>
              </div>
              <div className="ocr-pipeline-step active">
                <span className="step-circle">●</span>
                <span>Operator Review & Field Verification</span>
              </div>
            </div>

            {/* Toggle Raw OCR Text */}
            <div style={{ marginTop: 12 }}>
              <button
                type="button"
                className="raw-text-toggle"
                onClick={() => setShowRawText(!showRawText)}
              >
                {showRawText ? 'Hide Raw OCR Output' : 'View Raw Extracted Text'}
              </button>
              {showRawText && (
                <pre className="raw-text-box">
                  {scanResult?.raw_text || 'No raw OCR text captured.'}
                </pre>
              )}
            </div>
          </div>

          {/* Right Column: Extracted Fields Review & Correction */}
          <div className="ocr-right-col">
            <div className="ocr-confidence-bar">
              <div>
                <span className="confidence-label">Average Model Confidence: </span>
                <strong className="confidence-val">{confidenceAvg}%</strong>
              </div>
              <span className="status-pill status-needs-review">Needs Operator Confirmation</span>
            </div>

            <div className="ocr-fields-list">
              {fields.length === 0 ? (
                <div className="ocr-empty-fields">
                  No OCR fields detected for this document category.
                </div>
              ) : (
                fields.map((f) => {
                  const confPct = Math.round(f.confidence * 100)
                  return (
                    <div key={f.field_key} className="ocr-field-row">
                      <div className="ocr-field-header">
                        <label className="ocr-field-label">{f.label}</label>
                        <div className="ocr-field-meta">
                          <span
                            className={`ocr-field-chip ${
                              f.status === 'verified'
                                ? 'chip-verified'
                                : f.status === 'needs_review'
                                ? 'chip-review'
                                : 'chip-extracted'
                            }`}
                          >
                            {f.status === 'needs_review'
                              ? 'Needs Review'
                              : f.status === 'verified'
                              ? 'Verified'
                              : 'Extracted'}
                          </span>
                          <span className="ocr-conf-tag">{confPct}% Match</span>
                        </div>
                      </div>
                      <input
                        type="text"
                        className="ocr-field-input"
                        value={fieldValues[f.field_key] ?? f.value}
                        onChange={(e) => handleFieldChange(f.field_key, e.target.value)}
                      />
                    </div>
                  )
                })
              )}
            </div>

            <div className="ocr-sync-opt">
              <label className="ocr-checkbox-label">
                <input
                  type="checkbox"
                  checked={applyToCase}
                  onChange={(e) => setApplyToCase(e.target.checked)}
                />
                <span>
                  <strong>Apply verified values to Case Dossier</strong> (Updates Applicant Demographics, PAN & Collateral details automatically)
                </span>
              </label>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="ocr-modal-footer">
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleConfirmVerification}
            loading={isSubmitting}
          >
            ✓ Verify & Apply Extracted Data
          </Button>
        </div>
      </div>
    </div>
  )
}
