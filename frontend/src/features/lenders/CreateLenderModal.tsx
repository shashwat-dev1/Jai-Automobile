import React, { useState } from 'react'
import { api, ApiError } from '../../shared/lib/api'
import Button from '../../shared/components/Button'

interface CreateLenderModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

export const CreateLenderModal: React.FC<CreateLenderModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [type, setType] = useState('bank')
  const [dsaCode, setDsaCode] = useState('')
  const [contactPerson, setContactPerson] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [contactMobile, setContactMobile] = useState('')
  const [productsStr, setProductsStr] = useState('used_car, new_car')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      setError('Lender name is required')
      return
    }

    setError(null)
    setIsLoading(true)

    const products = productsStr
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean)

    try {
      await api.post('/lenders', {
        name: name.trim(),
        code: code.trim().toUpperCase() || undefined,
        type,
        dsa_code: dsaCode.trim() || undefined,
        contact_person: contactPerson.trim() || undefined,
        contact_email: contactEmail.trim() || undefined,
        contact_mobile: contactMobile.trim() || undefined,
        products,
      })
      onSuccess()
      onClose()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to register lender')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: 500 }}>
        <div className="modal-header">
          <h2 className="type-h2">Register Partner Lender (Bank / NBFC)</h2>
          <button type="button" className="close-btn" onClick={onClose}>×</button>
        </div>

        {error && <div className="alert-error" style={{ marginBottom: 16 }}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group" style={{ marginBottom: 16 }}>
            <label className="field-label">Lender Legal / Trade Name *</label>
            <input
              type="text"
              className="form-control"
              placeholder="e.g. HDFC Bank Ltd"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div className="form-group">
              <label className="field-label">Short Code</label>
              <input
                type="text"
                className="form-control"
                placeholder="e.g. HDFC"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="field-label">Institution Type</label>
              <select className="form-control" value={type} onChange={(e) => setType(e.target.value)}>
                <option value="bank">Private / PSU Bank</option>
                <option value="nbfc">NBFC</option>
                <option value="fintech">Fintech / Digital Lender</option>
              </select>
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: 16 }}>
            <label className="field-label">DSA Code / Agency Identifier</label>
            <input
              type="text"
              className="form-control"
              placeholder="e.g. DSA-DEL-4091"
              value={dsaCode}
              onChange={(e) => setDsaCode(e.target.value)}
            />
          </div>

          <div className="form-group" style={{ marginBottom: 16 }}>
            <label className="field-label">Supported Products (comma-separated)</label>
            <input
              type="text"
              className="form-control"
              value={productsStr}
              onChange={(e) => setProductsStr(e.target.value)}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div className="form-group">
              <label className="field-label">Lender Manager / RM Name</label>
              <input
                type="text"
                className="form-control"
                placeholder="e.g. Amit Verma"
                value={contactPerson}
                onChange={(e) => setContactPerson(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="field-label">RM Mobile</label>
              <input
                type="text"
                className="form-control"
                placeholder="e.g. 9876543210"
                value={contactMobile}
                onChange={(e) => setContactMobile(e.target.value)}
              />
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: 20 }}>
            <label className="field-label">RM Email Address</label>
            <input
              type="email"
              className="form-control"
              placeholder="e.g. rm@hdfcbank.com"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
            />
          </div>

          <div className="modal-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
            <Button variant="secondary" onClick={onClose} disabled={isLoading}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={isLoading}>
              {isLoading ? 'Registering...' : 'Register Lender'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
