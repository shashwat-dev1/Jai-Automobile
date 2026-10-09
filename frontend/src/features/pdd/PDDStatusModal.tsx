import React, { useState } from 'react'
import { api, ApiError } from '../../shared/lib/api'
import Button from '../../shared/components/Button'
import type { PDDItem, PDDStatus } from './types'

interface PDDStatusModalProps {
  item: PDDItem | null
  targetStatus: PDDStatus | null
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

export const PDDStatusModal: React.FC<PDDStatusModalProps> = ({
  item,
  targetStatus,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [refNo, setRefNo] = useState('')
  const [dateStr, setDateStr] = useState(new Date().toISOString().split('T')[0])
  const [rejectionReason, setRejectionReason] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!isOpen || !item || !targetStatus) return null

  const getTitle = () => {
    switch (targetStatus) {
      case 'collected':
        return 'Confirm Document Collection'
      case 'sent_to_lender':
        return 'Record Dispatch / Handover to Bank'
      case 'acknowledged_by_lender':
        return 'Record Bank Acknowledgement (PDD Complete)'
      case 'rejected':
        return 'Record Bank Rejection / Query'
      default:
        return 'Update PDD Status'
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (targetStatus === 'rejected' && !rejectionReason.trim()) {
      setError('Rejection / query reason is mandatory')
      return
    }

    setError(null)
    setIsLoading(true)

    const payload: Record<string, unknown> = {
      status: targetStatus,
      version: item.version,
    }

    if (targetStatus === 'collected') {
      payload.collected_at = new Date(dateStr).toISOString()
    } else if (targetStatus === 'sent_to_lender') {
      payload.submitted_to_lender_at = new Date(dateStr).toISOString()
      if (refNo.trim()) payload.lender_acknowledgement_ref = refNo.trim()
    } else if (targetStatus === 'acknowledged_by_lender') {
      payload.acknowledged_at = new Date(dateStr).toISOString()
      if (refNo.trim()) payload.lender_acknowledgement_ref = refNo.trim()
    } else if (targetStatus === 'rejected') {
      payload.rejection_reason = rejectionReason.trim()
    }

    try {
      await api.patch(`/pdd/${item.id}`, payload)
      onSuccess()
      onClose()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update PDD status')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: 480 }}>
        <div className="modal-header">
          <h2 className="type-h2">{getTitle()}</h2>
          <button type="button" className="close-btn" onClick={onClose}>×</button>
        </div>

        <div style={{ marginBottom: 16, fontSize: 13, color: 'var(--color-text-secondary)' }}>
          Document: <strong style={{ color: 'var(--color-text-primary)' }}>{item.title}</strong>
          {item.case_no && <span> | Case: {item.case_no}</span>}
        </div>

        {error && <div className="alert-error" style={{ marginBottom: 16 }}>{error}</div>}

        <form onSubmit={handleSubmit}>
          {targetStatus !== 'rejected' && (
            <div className="form-group" style={{ marginBottom: 16 }}>
              <label className="field-label">Date of Action *</label>
              <input
                type="date"
                className="form-control"
                value={dateStr}
                onChange={(e) => setDateStr(e.target.value)}
                required
              />
            </div>
          )}

          {(targetStatus === 'sent_to_lender' || targetStatus === 'acknowledged_by_lender') && (
            <div className="form-group" style={{ marginBottom: 16 }}>
              <label className="field-label">
                {targetStatus === 'sent_to_lender'
                  ? 'Courier POD / Handover Acknowledgment Ref'
                  : 'Bank PDD Acknowledgement Number / Ref'}
              </label>
              <input
                type="text"
                className="form-control"
                placeholder={targetStatus === 'sent_to_lender' ? 'e.g. BLUEDART-8829141' : 'e.g. HDFC-ACK-0021'}
                value={refNo}
                onChange={(e) => setRefNo(e.target.value)}
              />
            </div>
          )}

          {targetStatus === 'rejected' && (
            <div className="form-group" style={{ marginBottom: 16 }}>
              <label className="field-label">Bank Rejection / Deficiency Reason *</label>
              <textarea
                className="form-control"
                rows={3}
                placeholder="State exact discrepancy noted by the bank credit / ops team..."
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                required
              />
            </div>
          )}

          <div className="modal-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
            <Button variant="secondary" onClick={onClose} disabled={isLoading}>
              Cancel
            </Button>
            <Button
              variant="primary"
              type="submit"
              disabled={isLoading}
              style={targetStatus === 'rejected' ? { background: '#dc2626', borderColor: '#dc2626' } : undefined}
            >
              {isLoading ? 'Updating...' : 'Confirm Update'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
