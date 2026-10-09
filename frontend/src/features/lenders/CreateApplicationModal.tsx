import React, { useState, useEffect } from 'react'
import { api, ApiError } from '../../shared/lib/api'
import Button from '../../shared/components/Button'
import type { Lender } from './types'

interface CreateApplicationModalProps {
  caseId: string
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

export const CreateApplicationModal: React.FC<CreateApplicationModalProps> = ({
  caseId,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [lenders, setLenders] = useState<Lender[]>([])
  const [lenderId, setLenderId] = useState('')
  const [product, setProduct] = useState('used_car')
  const [loginRef, setLoginRef] = useState('')
  const [loginDate, setLoginDate] = useState(new Date().toISOString().split('T')[0])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen) {
      api.get<Lender[]>('/lenders?is_active=true')
        .then(data => {
          setLenders(data)
          if (data.length > 0) setLenderId(data[0].id)
        })
        .catch(() => setError('Failed to load active lenders list'))
    }
  }, [isOpen])

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!lenderId) {
      setError('Please select a lender')
      return
    }
    setError(null)
    setIsLoading(true)

    try {
      await api.post(`/cases/${caseId}/applications`, {
        lender_id: lenderId,
        product,
        login_ref: loginRef.trim() || undefined,
        login_date: loginDate || undefined,
      })
      onSuccess()
      onClose()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to submit application')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: 500 }}>
        <div className="modal-header">
          <h2 className="type-h2">Submit to Lender (Bank / NBFC)</h2>
          <button type="button" className="close-btn" onClick={onClose}>×</button>
        </div>

        {error && <div className="alert-error" style={{ marginBottom: 16 }}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group" style={{ marginBottom: 16 }}>
            <label className="field-label">Target Lender *</label>
            <select
              className="form-control"
              value={lenderId}
              onChange={(e) => setLenderId(e.target.value)}
              required
            >
              {lenders.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} {l.code ? `(${l.code})` : ''} - {l.type.toUpperCase()}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group" style={{ marginBottom: 16 }}>
            <label className="field-label">Loan Product *</label>
            <select
              className="form-control"
              value={product}
              onChange={(e) => setProduct(e.target.value)}
              required
            >
              <option value="used_car">Used Car Loan</option>
              <option value="new_car">New Car Loan</option>
              <option value="refinance">Car Refinance / Top-up</option>
              <option value="two_wheeler">Two Wheeler Loan</option>
              <option value="commercial_vehicle">Commercial Vehicle Loan</option>
            </select>
          </div>

          <div className="form-group" style={{ marginBottom: 16 }}>
            <label className="field-label">Bank Application / File Ref No (Optional)</label>
            <input
              type="text"
              className="form-control"
              placeholder="e.g. HDFC-APP-98214"
              value={loginRef}
              onChange={(e) => setLoginRef(e.target.value)}
            />
          </div>

          <div className="form-group" style={{ marginBottom: 20 }}>
            <label className="field-label">Login / Submission Date</label>
            <input
              type="date"
              className="form-control"
              value={loginDate}
              onChange={(e) => setLoginDate(e.target.value)}
            />
          </div>

          <div className="modal-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
            <Button variant="secondary" onClick={onClose} disabled={isLoading}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={isLoading}>
              {isLoading ? 'Submitting...' : 'Submit to Bank'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
