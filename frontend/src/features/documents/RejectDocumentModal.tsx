/**
 * DSA OS — RejectDocumentModal
 * Mandatory rejection reason prompt for staff reviewers.
 */

import { useState, FormEvent } from 'react'
import Button from '../../shared/components/Button'
import './RejectDocumentModal.css'

interface Props {
  documentName: string
  isOpen: boolean
  onClose: () => void
  onConfirm: (reason: string) => Promise<void>
}

export function RejectDocumentModal({ documentName, isOpen, onClose, onConfirm }: Props) {
  const [reason, setReason] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!isOpen) return null

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!reason.trim()) {
      setError('A rejection reason is mandatory.')
      return
    }

    setIsSubmitting(true)
    setError(null)
    try {
      await onConfirm(reason.trim())
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reject document.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="reject-modal-card">
        <div className="reject-modal-header">
          <h2 className="type-h2">Reject Document</h2>
          <button type="button" className="modal-close-btn" onClick={onClose} disabled={isSubmitting}>
            ✕
          </button>
        </div>

        <p className="type-body-sm" style={{ color: 'var(--color-text-secondary)' }}>
          Please state the business reason for rejecting <strong>{documentName}</strong>. The applicant
          will be prompted to provide a fresh upload.
        </p>

        {error && <div className="upload-error-alert">{error}</div>}

        <form onSubmit={handleSubmit} className="reject-form">
          <div className="input-group">
            <label htmlFor="reject-reason" className="input-label">
              Rejection Reason *
            </label>
            <textarea
              id="reject-reason"
              className="reject-textarea"
              rows={3}
              placeholder="e.g. Blur/unclear photograph, name mismatch, bank statement missing salary credits..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
            />
          </div>

          <div className="reject-actions">
            <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={isSubmitting}
              disabled={!reason.trim()}
              style={{ backgroundColor: 'var(--color-danger)', borderColor: 'var(--color-danger)' }}
            >
              Confirm Rejection
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
