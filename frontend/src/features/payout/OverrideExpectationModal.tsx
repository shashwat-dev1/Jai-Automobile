/**
 * DSA OS — OverrideExpectationModal
 * Manually adjusts payout gross receivable with mandatory justification (FR-PAY-005).
 */

import { useState } from 'react'
import { api, ApiError } from '../../shared/lib/api'
import { formatINR } from '../../shared/lib/formatters'
import Button from '../../shared/components/Button'
import type { PayoutExpectation } from './types'

interface OverrideExpectationModalProps {
  expectation: PayoutExpectation
  onClose: () => void
  onOverridden: (updated: PayoutExpectation) => void
}

export function OverrideExpectationModal({
  expectation,
  onClose,
  onOverridden,
}: OverrideExpectationModalProps) {
  const [newGross, setNewGross] = useState<string>(String(expectation.gross_amount || ''))
  const [reason, setReason] = useState<string>('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const val = parseFloat(newGross)
    if (isNaN(val) || val <= 0) {
      setError('Gross amount must be greater than ₹0.00.')
      return
    }
    if (!reason.trim() || reason.trim().length < 5) {
      setError('Mandatory override justification must be at least 5 characters long.')
      return
    }

    setError(null)
    setIsSubmitting(true)

    try {
      const updated = await api.post<PayoutExpectation>(
        `/payout/expectations/${expectation.id}/override`,
        {
          gross_amount: val,
          override_reason: reason.trim(),
          version: expectation.version,
        }
      )
      onOverridden(updated)
      onClose()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to override payout amount.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="modal-card" style={{ maxWidth: 520 }}>
        <div className="modal-header">
          <div>
            <h2 className="type-h2">Override Expected Payout (FR-PAY-005)</h2>
            <p className="type-body-xs" style={{ color: 'var(--color-text-secondary)', marginTop: 2 }}>
              Case: <strong>{expectation.case_no || expectation.case_id.slice(0, 8)}</strong> — Lender:{' '}
              {expectation.lender_name || 'Lender'}
            </p>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="case-warning-banner">
          <strong>FINANCIAL AUDIT NOTICE:</strong>
          <p style={{ margin: '4px 0 0' }}>
            Manual adjustment of expected bank commission is permanently recorded in the immutable audit
            trail with your identity, previous amount, and justification reason.
          </p>
        </div>

        {error && <div className="case-error-alert">{error}</div>}

        <form onSubmit={handleSubmit} className="modal-form">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div
              style={{
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                padding: 10,
              }}
            >
              <div className="type-label-sm" style={{ color: 'var(--color-text-tertiary)', textTransform: 'uppercase' }}>
                Original Calculated
              </div>
              <div className="type-mono-sm font-semibold" style={{ marginTop: 4 }}>
                {formatINR(expectation.original_gross_amount ?? expectation.gross_amount)}
              </div>
            </div>

            <div
              style={{
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                padding: 10,
              }}
            >
              <div className="type-label-sm" style={{ color: 'var(--color-text-tertiary)', textTransform: 'uppercase' }}>
                Disbursal Ticket
              </div>
              <div className="type-mono-sm font-semibold" style={{ marginTop: 4 }}>
                {formatINR(expectation.disbursal_amount)}
              </div>
            </div>
          </div>

          <div className="input-group">
            <label htmlFor="new-gross" className="input-label">
              Adjusted Gross Payout (₹) *
            </label>
            <input
              id="new-gross"
              type="number"
              step="0.01"
              min="0.01"
              className="case-input type-mono-sm font-semibold"
              value={newGross}
              onChange={(e) => setNewGross(e.target.value)}
              required
              autoFocus
            />
            <span className="type-body-xs" style={{ color: 'var(--color-text-secondary)', marginTop: 4 }}>
              Statutory TDS @ {expectation.tds_rate_percent}% will be automatically recomputed.
            </span>
          </div>

          <div className="input-group">
            <label htmlFor="override-reason" className="input-label">
              Mandatory Justification / Memo *
            </label>
            <textarea
              id="override-reason"
              rows={3}
              className="case-textarea"
              placeholder="e.g. Higher special festival slab confirmed by zonal credit manager in approval email..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
            />
          </div>

          <div className="modal-actions" style={{ marginTop: 16 }}>
            <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={isSubmitting}>
              Confirm Override
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
