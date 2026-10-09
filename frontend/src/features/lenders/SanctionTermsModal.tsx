import React, { useState } from 'react'
import { api, ApiError } from '../../shared/lib/api'
import Button from '../../shared/components/Button'
import type { LenderApplication } from './types'

interface SanctionTermsModalProps {
  application: LenderApplication | null
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

export const SanctionTermsModal: React.FC<SanctionTermsModalProps> = ({
  application,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [sanctionAmount, setSanctionAmount] = useState<string>(
    application?.sanction_amount ? String(application.sanction_amount) : ''
  )
  const [sanctionRate, setSanctionRate] = useState<string>(
    application?.sanction_rate ? String(application.sanction_rate) : '10.50'
  )
  const [sanctionTenure, setSanctionTenure] = useState<string>(
    application?.sanction_tenure_months ? String(application.sanction_tenure_months) : '60'
  )
  const [marginMoney, setMarginMoney] = useState<string>(
    application?.sanction_margin_money ? String(application.sanction_margin_money) : ''
  )
  const [sanctionDate, setSanctionDate] = useState<string>(
    application?.sanction_date || new Date().toISOString().split('T')[0]
  )
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!isOpen || !application) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const amountNum = parseFloat(sanctionAmount)
    const rateNum = parseFloat(sanctionRate)
    const tenureNum = parseInt(sanctionTenure, 10)

    if (isNaN(amountNum) || amountNum <= 0) {
      setError('Please enter a valid sanction amount')
      return
    }
    if (isNaN(rateNum) || rateNum < 0 || rateNum > 99.99) {
      setError('Please enter a valid interest rate (0% - 99.99%)')
      return
    }
    if (isNaN(tenureNum) || tenureNum <= 0 || tenureNum > 120) {
      setError('Please enter a valid tenure in months (1 - 120)')
      return
    }

    setError(null)
    setIsLoading(true)

    try {
      await api.patch(`/cases/${application.case_id}/applications/${application.id}`, {
        status: 'sanctioned',
        sanction_terms: {
          sanction_amount: amountNum,
          sanction_rate: rateNum,
          sanction_tenure_months: tenureNum,
          sanction_margin_money: marginMoney ? parseFloat(marginMoney) : undefined,
          sanction_date: sanctionDate || undefined,
        },
        version: application.version,
      })
      onSuccess()
      onClose()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to record sanction terms')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: 500 }}>
        <div className="modal-header">
          <h2 className="type-h2">Record Sanction Terms</h2>
          <button type="button" className="close-btn" onClick={onClose}>×</button>
        </div>

        <div style={{ marginBottom: 16, fontSize: 13, color: 'var(--color-text-secondary)' }}>
          Lender: <strong style={{ color: 'var(--color-text-primary)' }}>{application.lender_name || 'Bank'}</strong> | Product: {application.product}
        </div>

        {error && <div className="alert-error" style={{ marginBottom: 16 }}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group" style={{ marginBottom: 16 }}>
            <label className="field-label">Sanction Amount (₹) *</label>
            <input
              type="number"
              step="1000"
              className="form-control"
              placeholder="e.g. 450000"
              value={sanctionAmount}
              onChange={(e) => setSanctionAmount(e.target.value)}
              required
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div className="form-group">
              <label className="field-label">Rate of Interest (% p.a.) *</label>
              <input
                type="number"
                step="0.01"
                className="form-control"
                placeholder="e.g. 9.75"
                value={sanctionRate}
                onChange={(e) => setSanctionRate(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="field-label">Tenure (Months) *</label>
              <input
                type="number"
                className="form-control"
                placeholder="e.g. 60"
                value={sanctionTenure}
                onChange={(e) => setSanctionTenure(e.target.value)}
                required
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
            <div className="form-group">
              <label className="field-label">Margin Money / Down Payment (₹)</label>
              <input
                type="number"
                step="1000"
                className="form-control"
                placeholder="e.g. 50000"
                value={marginMoney}
                onChange={(e) => setMarginMoney(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="field-label">Sanction Date</label>
              <input
                type="date"
                className="form-control"
                value={sanctionDate}
                onChange={(e) => setSanctionDate(e.target.value)}
              />
            </div>
          </div>

          <div className="modal-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
            <Button variant="secondary" onClick={onClose} disabled={isLoading}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={isLoading}>
              {isLoading ? 'Saving...' : 'Record Sanction'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
