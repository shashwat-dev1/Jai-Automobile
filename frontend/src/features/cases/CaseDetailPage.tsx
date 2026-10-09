/**
 * DSA OS — CaseDetailPage (Full Operational Dossier)
 */

import { useState, useEffect, useCallback, FormEvent } from 'react'
import { useParams, Link } from 'react-router-dom'
import { api, ApiError } from '../../shared/lib/api'
import { formatINR } from '../../shared/lib/formatters'
import Button from '../../shared/components/Button'
import StatusChip from '../../shared/components/StatusChip'
import { DocumentChecklist } from '../documents/DocumentChecklist'
import { SLAIndicator } from '../workflow/SLAIndicator'
import { LenderApplicationSection } from '../lenders/LenderApplicationSection'
import { TaskListSection } from '../workflow/TaskListSection'
import { PDDSection } from '../pdd/PDDSection'
import { PayoutSection } from '../payout/PayoutSection'
import type { CaseDetail, CaseStatus } from './types'
import './CaseDetailPage.css'

const ALLOWED_NEXT_STATES: Record<string, CaseStatus[]> = {
  lead: ['lead_qualified', 'withdrawn', 'rejected'],
  lead_qualified: ['docs_in_progress', 'withdrawn', 'rejected'],
  docs_in_progress: ['docs_collected', 'withdrawn', 'rejected'],
  docs_collected: ['file_logged_in', 'docs_in_progress', 'withdrawn', 'rejected'],
  file_logged_in: ['in_review_lender', 'queries_raised', 'sanctioned', 'rejected', 'withdrawn'],
  in_review_lender: ['queries_raised', 'sanctioned', 'rejected', 'withdrawn'],
  queries_raised: ['in_review_lender', 'sanctioned', 'rejected', 'withdrawn'],
  sanctioned: ['disbursed', 'withdrawn'],
  disbursed: ['pdd_pending', 'pdd_completed', 'closed'],
  pdd_pending: ['pdd_completed', 'closed'],
  pdd_completed: ['closed'],
  closed: [],
  rejected: ['lead'],
  withdrawn: ['lead'],
}

export function CaseDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [caseData, setCaseData] = useState<CaseDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Status Modal
  const [showStatusModal, setShowStatusModal] = useState(false)
  const [targetStatus, setTargetStatus] = useState<CaseStatus | ''>('')
  const [statusReason, setStatusReason] = useState('')
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false)
  const [statusError, setStatusError] = useState<string | null>(null)

  // Reveal Modal
  const [showRevealModal, setShowRevealModal] = useState(false)
  const [revealReason, setRevealReason] = useState('')
  const [revealedValue, setRevealedValue] = useState<string | null>(null)
  const [isRevealing, setIsRevealing] = useState(false)
  const [revealError, setRevealError] = useState<string | null>(null)

  const loadCase = useCallback(async () => {
    if (!id) return
    setIsLoading(true)
    setError(null)
    try {
      const data = await api.get<CaseDetail>(`/cases/${id}`)
      setCaseData(data)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load case dossier')
    } finally {
      setIsLoading(false)
    }
  }, [id])

  useEffect(() => {
    loadCase()
  }, [loadCase])

  const handleStatusChange = async (e: FormEvent) => {
    e.preventDefault()
    if (!caseData || !targetStatus) return
    setStatusError(null)
    setIsUpdatingStatus(true)

    try {
      const updated = await api.post<CaseDetail>(`/cases/${caseData.id}/status`, {
        status: targetStatus,
        reason: statusReason.trim() || undefined,
        version: caseData.version,
      })
      setCaseData(updated)
      setShowStatusModal(false)
      setStatusReason('')
      setTargetStatus('')
    } catch (err) {
      setStatusError(err instanceof ApiError ? err.message : 'Status update failed')
    } finally {
      setIsUpdatingStatus(false)
    }
  }

  const handleRevealPAN = async (e: FormEvent) => {
    e.preventDefault()
    if (!caseData || !caseData.primary_party) return
    setRevealError(null)
    setIsRevealing(true)

    try {
      const res = await api.post<{ field_name: string; value: string }>(
        `/parties/${caseData.primary_party.id}/reveal`,
        {
          field_name: 'pan',
          reason: revealReason.trim(),
        }
      )
      setRevealedValue(res.value)
    } catch (err) {
      setRevealError(err instanceof ApiError ? err.message : 'Failed to reveal PII')
    } finally {
      setIsRevealing(false)
    }
  }

  if (isLoading) {
    return <div className="case-detail-loading">Loading operational dossier...</div>
  }

  if (error || !caseData) {
    return (
      <div className="case-detail-error">
        <h2>Case Not Found</h2>
        <p>{error || 'Requested loan file does not exist.'}</p>
        <Link to="/cases">← Return to Case Pipeline</Link>
      </div>
    )
  }

  const allowedNext = ALLOWED_NEXT_STATES[caseData.status] || []
  const party = caseData.primary_party
  const vehicle = caseData.vehicle

  return (
    <div className="case-detail-page">
      {/* Dossier Header */}
      <div className="dossier-header">
        <div>
          <div className="dossier-breadcrumbs">
            <Link to="/cases">Cases</Link> / <span>{caseData.case_no}</span>
          </div>
          <div className="dossier-title-row">
            <h1 className="type-h1">{caseData.case_no}</h1>
            <span className="product-badge">{caseData.product_type.replace(/_/g, ' ')}</span>
            <StatusChip status={caseData.status} />
            {caseData.sla && <SLAIndicator sla={caseData.sla} />}
            <span className="version-tag type-mono-xs">v{caseData.version}</span>
          </div>
        </div>

        <div className="dossier-actions">
          {allowedNext.length > 0 && (
            <Button
              variant="primary"
              onClick={() => {
                setTargetStatus(allowedNext[0])
                setShowStatusModal(true)
              }}
            >
              Advance Lifecycle Status →
            </Button>
          )}
        </div>
      </div>

      {/* 3-Column Dossier Grid */}
      <div className="dossier-grid">
        {/* Left Col: Customer & Vehicle Asset */}
        <div className="dossier-main-col">
          {/* Section: Primary Applicant */}
          <div className="dossier-card">
            <div className="dossier-card-header">
              <h2 className="dossier-card-title">Customer Dossier</h2>
              <span className={`consent-badge ${caseData.has_consent ? 'given' : 'missing'}`}>
                {caseData.has_consent ? 'DPDP Consent: On File' : 'Consent Pending'}
              </span>
            </div>

            {party ? (
              <div className="dossier-fields-grid">
                <div className="field-group">
                  <span className="field-label">Full Name</span>
                  <span className="field-value font-semibold">{party.name}</span>
                </div>

                <div className="field-group">
                  <span className="field-label">Mobile Number</span>
                  <span className="field-value type-mono-sm">{party.mobile_primary}</span>
                </div>

                <div className="field-group">
                  <span className="field-label">Income Tax PAN</span>
                  <div className="pan-reveal-row">
                    <span className="field-value type-mono-sm">
                      {revealedValue || party.pan_masked || 'Not provided'}
                    </span>
                    {!revealedValue && party.pan_masked && (
                      <button
                        type="button"
                        className="reveal-btn"
                        onClick={() => {
                          setRevealReason('')
                          setShowRevealModal(true)
                        }}
                      >
                        Reveal (Audited)
                      </button>
                    )}
                  </div>
                </div>

                <div className="field-group">
                  <span className="field-label">Aadhaar (Last 4 digits)</span>
                  <span className="field-value type-mono-sm">
                    {party.aadhaar_masked || 'Not provided'}
                  </span>
                </div>

                <div className="field-group">
                  <span className="field-label">Employment Type</span>
                  <span className="field-value">{party.employment_type || '—'}</span>
                </div>

                <div className="field-group">
                  <span className="field-label">City / Jurisdiction</span>
                  <span className="field-value">{party.city || '—'}</span>
                </div>
              </div>
            ) : (
              <p className="type-body-sm" style={{ color: 'var(--color-text-tertiary)' }}>
                No applicant profile linked.
              </p>
            )}
          </div>

          {/* Section: Vehicle Asset */}
          <div className="dossier-card">
            <div className="dossier-card-header">
              <h2 className="dossier-card-title">Collateral Asset (Vehicle)</h2>
              {vehicle?.registration_no && (
                <a
                  href="https://parivahan.gov.in/rcdlstatus/?pur_cd=102"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="vahan-link"
                >
                  Verify on Vahan ↗
                </a>
              )}
            </div>

            {vehicle ? (
              <div className="dossier-fields-grid">
                <div className="field-group">
                  <span className="field-label">Make & Model</span>
                  <span className="field-value font-semibold">
                    {vehicle.make} {vehicle.model} {vehicle.variant || ''}
                  </span>
                </div>

                <div className="field-group">
                  <span className="field-label">Vehicle Condition</span>
                  <span className="field-value" style={{ textTransform: 'capitalize' }}>
                    {vehicle.condition} Vehicle
                  </span>
                </div>

                <div className="field-group">
                  <span className="field-label">Registration Number</span>
                  <span className="field-value type-mono-sm font-semibold">
                    {vehicle.registration_no || 'Pending Registration'}
                  </span>
                </div>

                <div className="field-group">
                  <span className="field-label">Manufacture Year</span>
                  <span className="field-value type-mono-sm">
                    {vehicle.year_of_manufacture || '—'}
                  </span>
                </div>

                <div className="field-group">
                  <span className="field-label">Existing Hypothecation</span>
                  <span className="field-value">
                    {vehicle.existing_hypothecation || 'None / Clear Title'}
                  </span>
                </div>

                <div className="field-group">
                  <span className="field-label">Valuation Amount</span>
                  <span className="field-value type-mono-sm">
                    {vehicle.valuation_amount ? formatINR(vehicle.valuation_amount) : 'Pending'}
                  </span>
                </div>
              </div>
            ) : (
              <p className="type-body-sm">No vehicle details provided.</p>
            )}
          </div>

          {/* Document Checklist & Verification Hub */}
          <div className="dossier-card">
            <DocumentChecklist
              caseId={caseData.id}
              caseNo={caseData.case_no}
              customerName={party ? party.name : 'Customer'}
            />
          </div>

          {/* Multi-Bank Lender Applications */}
          <div className="dossier-card">
            <LenderApplicationSection caseId={caseData.id} onCaseUpdated={loadCase} />
          </div>

          {/* Post-Disbursal Documents (PDD) */}
          {['disbursed', 'pdd_pending', 'pdd_completed', 'closed'].includes(caseData.status) && (
            <>
              <div className="dossier-card">
                <PDDSection caseId={caseData.id} />
              </div>
              <div className="dossier-card">
                <PayoutSection caseId={caseData.id} />
              </div>
            </>
          )}
        </div>

        {/* Right Col: Loan Financials & Timeline */}
        <div className="dossier-side-col">
          {/* Financials Card */}
          <div className="dossier-card">
            <div className="dossier-card-header">
              <h2 className="dossier-card-title">Financial Details</h2>
            </div>
            <div className="financial-rows">
              <div className="financial-row">
                <span>Requested Loan:</span>
                <span className="type-mono-sm font-semibold">
                  {formatINR(caseData.loan_amount_requested)}
                </span>
              </div>
              <div className="financial-row">
                <span>Sanctioned Amount:</span>
                <span className="type-mono-sm">
                  {caseData.loan_amount_sanctioned ? formatINR(caseData.loan_amount_sanctioned) : '—'}
                </span>
              </div>
              <div className="financial-row">
                <span>Disbursed Amount:</span>
                <span className="type-mono-sm font-semibold" style={{ color: 'var(--color-primary)' }}>
                  {caseData.loan_amount_disbursed ? formatINR(caseData.loan_amount_disbursed) : '—'}
                </span>
              </div>
            </div>
          </div>

          {/* Attribution & Team Card */}
          <div className="dossier-card">
            <div className="dossier-card-header">
              <h2 className="dossier-card-title">Attribution & Staff</h2>
            </div>
            <div className="staff-fields">
              <div className="staff-row">
                <span className="staff-label">Lead Source:</span>
                <span className="staff-val">{caseData.source_name}</span>
              </div>
              {caseData.source_executive && (
                <div className="staff-row">
                  <span className="staff-label">Dealer Executive:</span>
                  <span className="staff-val">{caseData.source_executive}</span>
                </div>
              )}
              <div className="staff-row">
                <span className="staff-label">Case Owner:</span>
                <span className="staff-val font-semibold">{caseData.owner_name}</span>
              </div>
              <div className="staff-row">
                <span className="staff-label">Loan Processor:</span>
                <span className="staff-val">{caseData.assigned_processor_name || 'Unassigned'}</span>
              </div>
            </div>
          </div>

          {/* Follow-up Tasks & Reminders */}
          <div className="dossier-card">
            <TaskListSection caseId={caseData.id} />
          </div>

          {/* Chronological Status Timeline */}
          <div className="dossier-card">
            <div className="dossier-card-header">
              <h2 className="dossier-card-title">Status Timeline</h2>
            </div>
            <div className="timeline-container">
              {caseData.status_history.map((hist) => (
                <div key={hist.id} className="timeline-item">
                  <div className="timeline-marker" />
                  <div className="timeline-content">
                    <div className="timeline-status-row">
                      <StatusChip status={hist.to_status} />
                      <span className="timeline-date type-mono-xs">
                        {new Date(hist.created_at).toLocaleDateString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    {hist.reason && <p className="timeline-reason">{hist.reason}</p>}
                    <span className="timeline-author type-body-xs">
                      by {hist.changer_name || 'System'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Advance Status Modal */}
      {showStatusModal && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-header">
              <h2 className="type-h2">Advance Case Status</h2>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setShowStatusModal(false)}
              >
                ✕
              </button>
            </div>

            {statusError && <div className="case-error-alert">{statusError}</div>}

            <form onSubmit={handleStatusChange} className="modal-form">
              <div className="input-group">
                <label className="input-label">Current Status</label>
                <StatusChip status={caseData.status} />
              </div>

              <div className="input-group">
                <label htmlFor="next-status" className="input-label">
                  Allowed Target Status *
                </label>
                <select
                  id="next-status"
                  className="case-select"
                  value={targetStatus}
                  onChange={(e) => setTargetStatus(e.target.value as CaseStatus)}
                  required
                >
                  {allowedNext.map((st) => (
                    <option key={st} value={st}>
                      {st.replace(/_/g, ' ').toUpperCase()}
                    </option>
                  ))}
                </select>
              </div>

              <div className="input-group">
                <label htmlFor="status-reason" className="input-label">
                  Reason / Operational Note
                </label>
                <textarea
                  id="status-reason"
                  className="case-textarea"
                  rows={3}
                  placeholder="e.g. Sanction letter received from HDFC Bank at 8.75% ROI..."
                  value={statusReason}
                  onChange={(e) => setStatusReason(e.target.value)}
                />
              </div>

              <div className="modal-actions">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setShowStatusModal(false)}
                  disabled={isUpdatingStatus}
                >
                  Cancel
                </Button>
                <Button type="submit" variant="primary" loading={isUpdatingStatus}>
                  Confirm Status Change
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reveal PAN Modal */}
      {showRevealModal && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-header">
              <h2 className="type-h2">Access Sensitive PII (PAN)</h2>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setShowRevealModal(false)}
              >
                ✕
              </button>
            </div>

            <div className="case-warning-banner">
              <strong>MANDATORY AUDIT WARNING:</strong>
              <p style={{ margin: '4px 0 0' }}>
                Per NFR-SEC-008 and DPDP requirements, unmasking customer PAN is permanently recorded
                in the immutable audit ledger with your identity and reason.
              </p>
            </div>

            {revealError && <div className="case-error-alert">{revealError}</div>}

            <form onSubmit={handleRevealPAN} className="modal-form">
              <div className="input-group">
                <label htmlFor="reveal-reason" className="input-label">
                  Operational Justification *
                </label>
                <textarea
                  id="reveal-reason"
                  className="case-textarea"
                  rows={3}
                  placeholder="e.g. Verifying KYC documents against bank portal sanction requirements..."
                  value={revealReason}
                  onChange={(e) => setRevealReason(e.target.value)}
                  required
                />
              </div>

              <div className="modal-actions">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setShowRevealModal(false)}
                  disabled={isRevealing}
                >
                  Cancel
                </Button>
                <Button type="submit" variant="primary" loading={isRevealing}>
                  Decrypt & Reveal
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
