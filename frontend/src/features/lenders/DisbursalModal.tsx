import React, { useState } from 'react'
import { api, ApiError } from '../../shared/lib/api'
import Button from '../../shared/components/Button'
import { formatINR } from '../../shared/lib/formatters'
import type { LenderApplication } from './types'

interface DisbursalModalProps {
  application: LenderApplication | null
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

export const DisbursalModal: React.FC<DisbursalModalProps> = ({
  application,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [disbursalAmount, setDisbursalAmount] = useState<string>(
    application?.sanction_amount ? String(application.sanction_amount) : ''
  )
  const [disbursalDate, setDisbursalDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  )
  const [disbursalRef, setDisbursalRef] = useState<string>('')
  const [overrideReason, setOverrideReason] = useState<string>('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!isOpen || !application) return null

  const amountNum = parseFloat(disbursalAmount) || 0
  const sanctionNum = application.sanction_amount || 0
  const isExceedingSanction = sanctionNum > 0 && amountNum > sanctionNum

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (amountNum <= 0) {
      setError('Please enter a valid disbursal amount')
      return
    }
    if (!disbursalRef.trim()) {
      setError('Bank UTR / Disbursal reference number is mandatory')
      return
    }
    if (isExceedingSanction && !overrideReason.trim()) {
      setError('Underwriter / Manager override reason is required when disbursal exceeds sanction (BR-08)')
      return
    }

    setError(null)
    setIsLoading(true)

    try {
      await api.patch(`/cases/${application.case_id}/applications/${application.id}`, {
        status: 'disbursed',
        disbursal: {
          disbursal_amount: amountNum,
          disbursal_date: disbursalDate,
          disbursal_ref: disbursalRef.trim(),
          disbursal_override_reason: isExceedingSanction ? overrideReason.trim() : undefined,
        },
        version: application.version,
      })
      onSuccess()
      onClose()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to record disbursal')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: 520 }}>
        <div className="modal-header">
          <h2 className="type-h2">Record Loan Disbursal</h2>
          <button type="button" className="close-btn" onClick={onClose}>×</button>
        </div>

        <div style={{ marginBottom: 16, fontSize: 13, color: 'var(--color-text-secondary)' }}>
          Lender: <strong style={{ color: 'var(--color-text-primary)' }}>{application.lender_name || 'Bank'}</strong> | Sanctioned: <strong>{formatINR(sanctionNum)}</strong>
        </div>

        {error && <div className="alert-error" style={{ marginBottom: 16 }}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group" style={{ marginBottom: 16 }}>
            <label htmlFor="disbursed-amount-input" className="field-label">
              Disbursed Amount (₹) *
            </label>
            <input
              id="disbursed-amount-input"
              type="number"
              step="1000"
              className="form-control"
              placeholder="e.g. 450000"
              value={disbursalAmount}
              onChange={(e) => setDisbursalAmount(e.target.value)}
              required
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div className="form-group">
              <label className="field-label">Disbursal Date *</label>
              <input
                type="date"
                className="form-control"
                value={disbursalDate}
                onChange={(e) => setDisbursalDate(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="field-label">Bank UTR / Disbursal Ref *</label>
              <input
                type="text"
                className="form-control"
                placeholder="e.g. UTR-HDFC982312"
                value={disbursalRef}
                onChange={(e) => setDisbursalRef(e.target.value)}
                required
              />
            </div>
          </div>

          {isExceedingSanction && (
            <div
              style={{
                background: 'rgba(234, 179, 8, 0.1)',
                border: '1px solid rgba(234, 179, 8, 0.4)',
                padding: 12,
                borderRadius: 4,
                marginBottom: 16,
              }}
            >
              <div style={{ color: '#facc15', fontWeight: 600, fontSize: 12, marginBottom: 6 }}>
                ⚠ Disbursal amount ({formatINR(amountNum)}) exceeds sanction ({formatINR(sanctionNum)})
              </div>
              <label className="field-label" style={{ color: '#facc15' }}>
                Manager / Underwriter Override Reason (BR-08) *
              </label>
              <textarea
                className="form-control"
                rows={2}
                placeholder="State valid reason (e.g., Insurance/Warranty bundled in disbursal by lender)..."
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                required
              />
            </div>
          )}

          <div className="modal-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
            <Button variant="secondary" onClick={onClose} disabled={isLoading}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={isLoading}>
              {isLoading ? 'Processing...' : 'Confirm Disbursal'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
