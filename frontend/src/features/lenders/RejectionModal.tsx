import React, { useState } from 'react'
import { api, ApiError } from '../../shared/lib/api'
import Button from '../../shared/components/Button'
import { REJECTION_REASONS, type LenderApplication } from './types'

interface RejectionModalProps {
  application: LenderApplication | null
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

export const RejectionModal: React.FC<RejectionModalProps> = ({
  application,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [reasonCode, setReasonCode] = useState<string>(REJECTION_REASONS[0].code)
  const [notes, setNotes] = useState<string>('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!isOpen || !application) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!reasonCode) {
      setError('Please select a rejection reason code (BR-04)')
      return
    }

    setError(null)
    setIsLoading(true)

    try {
      await api.patch(`/cases/${application.case_id}/applications/${application.id}`, {
        status: 'rejected',
        rejection_reason_code: reasonCode,
        rejection_notes: notes.trim() || undefined,
        version: application.version,
      })
      onSuccess()
      onClose()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to record rejection')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: 480 }}>
        <div className="modal-header">
          <h2 className="type-h2">Record Application Rejection</h2>
          <button type="button" className="close-btn" onClick={onClose}>×</button>
        </div>

        <div style={{ marginBottom: 16, fontSize: 13, color: 'var(--color-text-secondary)' }}>
          Lender: <strong style={{ color: 'var(--color-text-primary)' }}>{application.lender_name || 'Bank'}</strong>
        </div>

        {error && <div className="alert-error" style={{ marginBottom: 16 }}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group" style={{ marginBottom: 16 }}>
            <label className="field-label">Primary Rejection Reason (BR-04) *</label>
            <select
              className="form-control"
              value={reasonCode}
              onChange={(e) => setReasonCode(e.target.value)}
              required
            >
              {REJECTION_REASONS.map((r) => (
                <option key={r.code} value={r.code}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group" style={{ marginBottom: 20 }}>
            <label className="field-label">Credit Underwriter Notes (Optional)</label>
            <textarea
              className="form-control"
              rows={3}
              placeholder="e.g. CIBIL score 620 below required 700 threshold for used car portfolio..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div className="modal-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
            <Button variant="secondary" onClick={onClose} disabled={isLoading}>
              Cancel
            </Button>
            <Button
              variant="primary"
              type="submit"
              disabled={isLoading}
              style={{ background: 'var(--color-error, #dc2626)', borderColor: '#dc2626' }}
            >
              {isLoading ? 'Recording...' : 'Confirm Rejection'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
