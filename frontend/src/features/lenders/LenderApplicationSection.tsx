import React, { useState, useEffect, useCallback } from 'react'
import { api, ApiError } from '../../shared/lib/api'
import { formatINR } from '../../shared/lib/formatters'
import Button from '../../shared/components/Button'
import StatusChip from '../../shared/components/StatusChip'
import { SLAIndicator } from '../workflow/SLAIndicator'
import { CreateApplicationModal } from './CreateApplicationModal'
import { SanctionTermsModal } from './SanctionTermsModal'
import { DisbursalModal } from './DisbursalModal'
import { RejectionModal } from './RejectionModal'
import { ApplicationComparisonModal } from './ApplicationComparisonModal'
import type { LenderApplication } from './types'
import './LenderApplicationSection.css'

interface LenderApplicationSectionProps {
  caseId: string
  onCaseUpdated?: () => void
}

export const LenderApplicationSection: React.FC<LenderApplicationSectionProps> = ({
  caseId,
  onCaseUpdated,
}) => {
  const [applications, setApplications] = useState<LenderApplication[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Modals state
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showCompareModal, setShowCompareModal] = useState(false)
  const [selectedApp, setSelectedApp] = useState<LenderApplication | null>(null)
  const [showSanctionModal, setShowSanctionModal] = useState(false)
  const [showDisbursalModal, setShowDisbursalModal] = useState(false)
  const [showRejectModal, setShowRejectModal] = useState(false)
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null)

  const loadApplications = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const data = await api.get<LenderApplication[]>(`/cases/${caseId}/applications`)
      setApplications(data)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load lender applications')
    } finally {
      setIsLoading(false)
    }
  }, [caseId])

  useEffect(() => {
    loadApplications()
  }, [loadApplications])

  const handleMarkWinning = async (app: LenderApplication) => {
    if (!window.confirm(`Mark ${app.lender_name || 'this bank'} as the winning application for this loan file?`)) {
      return
    }
    setActionLoadingId(app.id)
    setError(null)
    try {
      await api.patch(`/cases/${caseId}/applications/${app.id}`, {
        is_winning: true,
        version: app.version,
      })
      await loadApplications()
      if (onCaseUpdated) onCaseUpdated()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to mark winning application')
    } finally {
      setActionLoadingId(null)
    }
  }

  const handleStatusTransition = async (app: LenderApplication, newStatus: string) => {
    setActionLoadingId(app.id)
    setError(null)
    try {
      await api.patch(`/cases/${caseId}/applications/${app.id}`, {
        status: newStatus,
        version: app.version,
      })
      await loadApplications()
      if (onCaseUpdated) onCaseUpdated()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : `Failed to update status to ${newStatus}`)
    } finally {
      setActionLoadingId(null)
    }
  }

  return (
    <div className="lender-app-section">
      <div className="lender-app-header">
        <div>
          <h2 className="dossier-card-title">Lender Applications (Multi-Bank Pipeline)</h2>
          <p className="type-body-xs" style={{ color: 'var(--color-text-secondary)', marginTop: 2 }}>
            Simultaneous multi-lender submissions with independent approval terms.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {applications.length > 1 && (
            <Button variant="secondary" onClick={() => setShowCompareModal(true)}>
              Compare Terms 📊
            </Button>
          )}
          <Button variant="primary" onClick={() => setShowCreateModal(true)}>
            + Submit to Bank
          </Button>
        </div>
      </div>

      {error && <div className="alert-error" style={{ margin: '12px 0' }}>{error}</div>}

      {isLoading ? (
        <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
          Loading bank applications...
        </div>
      ) : applications.length === 0 ? (
        <div className="empty-app-state">
          <div className="empty-app-icon">🏦</div>
          <div className="type-body-sm font-semibold">No Lender Submissions Yet</div>
          <div className="type-body-xs" style={{ color: 'var(--color-text-secondary)', margin: '4px 0 12px' }}>
            Submit this loan file to partner banks or NBFCs to initiate credit decisioning.
          </div>
          <Button variant="secondary" onClick={() => setShowCreateModal(true)}>
            Submit First Application
          </Button>
        </div>
      ) : (
        <div className="app-cards-grid">
          {applications.map((app) => (
            <div key={app.id} className={`app-card ${app.is_winning ? 'is-winning' : ''}`}>
              <div className="app-card-top">
                <div>
                  <div className="app-lender-title">
                    <span>{app.lender_name || 'Bank Partner'}</span>
                    {app.is_winning && <span className="winning-badge">★ WINNING LENDER</span>}
                  </div>
                  <div className="type-mono-xs" style={{ color: 'var(--color-text-tertiary)', marginTop: 2 }}>
                    Ref: {app.login_ref || 'Pending Ref'} | Product: {app.product.replace(/_/g, ' ')}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                  <StatusChip status={app.status} />
                  {app.sla && <SLAIndicator sla={app.sla} compact />}
                </div>
              </div>

              {/* Financial Terms Details */}
              <div className="app-terms-grid">
                <div className="term-item">
                  <span className="term-label">Sanction Amount</span>
                  <span className="term-value font-semibold">
                    {app.sanction_amount ? formatINR(app.sanction_amount) : 'Pending'}
                  </span>
                </div>
                <div className="term-item">
                  <span className="term-label">Rate of Interest</span>
                  <span className="term-value">
                    {app.sanction_rate ? `${app.sanction_rate}% p.a.` : '—'}
                  </span>
                </div>
                <div className="term-item">
                  <span className="term-label">Tenure</span>
                  <span className="term-value">
                    {app.sanction_tenure_months ? `${app.sanction_tenure_months} mo` : '—'}
                  </span>
                </div>
                <div className="term-item">
                  <span className="term-label">Disbursed Amount</span>
                  <span className="term-value font-semibold" style={{ color: 'var(--color-primary)' }}>
                    {app.disbursal_amount ? formatINR(app.disbursal_amount) : '—'}
                  </span>
                </div>
              </div>

              {/* Rejection / Override Alerts */}
              {app.rejection_reason_code && (
                <div className="app-rejection-box">
                  <span className="rejection-code">Reason: {app.rejection_reason_code.replace(/_/g, ' ')}</span>
                  {app.rejection_notes && <p className="rejection-notes">{app.rejection_notes}</p>}
                </div>
              )}

              {app.disbursal_override_reason && (
                <div className="app-override-box">
                  <span>BR-08 Disbursal Override: {app.disbursal_override_reason}</span>
                </div>
              )}

              {/* Action Buttons */}
              <div className="app-card-actions">
                {app.status === 'draft' && (
                  <Button
                    variant="secondary"
                    onClick={() => handleStatusTransition(app, 'applied')}
                    disabled={actionLoadingId === app.id}
                  >
                    Mark Applied →
                  </Button>
                )}

                {['applied', 'queries_raised'].includes(app.status) && (
                  <>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setSelectedApp(app)
                        setShowSanctionModal(true)
                      }}
                    >
                      Record Sanction 📄
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setSelectedApp(app)
                        setShowRejectModal(true)
                      }}
                      style={{ color: '#f87171' }}
                    >
                      Reject ✕
                    </Button>
                  </>
                )}

                {app.status === 'sanctioned' && (
                  <>
                    {!app.is_winning && (
                      <Button
                        variant="secondary"
                        onClick={() => handleMarkWinning(app)}
                        disabled={actionLoadingId === app.id}
                      >
                        Set Winning ★
                      </Button>
                    )}
                    <Button
                      variant="primary"
                      onClick={() => {
                        setSelectedApp(app)
                        setShowDisbursalModal(true)
                      }}
                    >
                      Record Disbursal 💰
                    </Button>
                  </>
                )}

                {app.status === 'disbursed' && (
                  <span className="disbursed-tag">
                    ✓ Disbursed on {app.disbursal_date} ({app.disbursal_ref})
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modals */}
      <CreateApplicationModal
        caseId={caseId}
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={() => {
          loadApplications()
          if (onCaseUpdated) onCaseUpdated()
        }}
      />

      <SanctionTermsModal
        application={selectedApp}
        isOpen={showSanctionModal}
        onClose={() => {
          setShowSanctionModal(false)
          setSelectedApp(null)
        }}
        onSuccess={() => {
          loadApplications()
          if (onCaseUpdated) onCaseUpdated()
        }}
      />

      <DisbursalModal
        application={selectedApp}
        isOpen={showDisbursalModal}
        onClose={() => {
          setShowDisbursalModal(false)
          setSelectedApp(null)
        }}
        onSuccess={() => {
          loadApplications()
          if (onCaseUpdated) onCaseUpdated()
        }}
      />

      <RejectionModal
        application={selectedApp}
        isOpen={showRejectModal}
        onClose={() => {
          setShowRejectModal(false)
          setSelectedApp(null)
        }}
        onSuccess={() => {
          loadApplications()
          if (onCaseUpdated) onCaseUpdated()
        }}
      />

      <ApplicationComparisonModal
        applications={applications}
        isOpen={showCompareModal}
        onClose={() => setShowCompareModal(false)}
      />
    </div>
  )
}
