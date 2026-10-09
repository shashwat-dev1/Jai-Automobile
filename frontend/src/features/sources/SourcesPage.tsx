/**
 * DSA OS — SourcesPage (Lead Sources & Dealerships)
 */

import { useState, useEffect, useCallback, FormEvent } from 'react'
import { api, ApiError } from '../../shared/lib/api'
import Button from '../../shared/components/Button'
import Input from '../../shared/components/Input'
import './SourcesPage.css'

interface SourceItem {
  id: string
  name: string
  type: string
  parent_id?: string | null
  contact_person?: string | null
  phone?: string | null
  email?: string | null
  payout_rate_default?: number | null
  is_active: boolean
  created_at: string
}

export function SourcesPage() {
  const [sources, setSources] = useState<SourceItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Create Modal
  const [showModal, setShowModal] = useState(false)
  const [name, setName] = useState('')
  const [type, setType] = useState('dealer')
  const [contactPerson, setContactPerson] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [payoutRate, setPayoutRate] = useState('1.50')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const loadSources = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const data = await api.get<SourceItem[]>('/sources?active_only=false')
      setSources(data)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to query sources')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadSources()
  }, [loadSources])

  const handleCreateSource = async (e: FormEvent) => {
    e.preventDefault()
    setCreateError(null)

    if (!name.trim()) {
      setCreateError('Source name is required.')
      return
    }

    setIsSubmitting(true)
    try {
      await api.post<SourceItem>('/sources', {
        name: name.trim(),
        type,
        contact_person: contactPerson.trim() || undefined,
        phone: phone.trim() || undefined,
        email: email.trim().toLowerCase() || undefined,
        payout_rate_default: payoutRate ? parseFloat(payoutRate) : undefined,
        is_active: true,
      })
      setShowModal(false)
      setName('')
      setContactPerson('')
      setPhone('')
      setEmail('')
      await loadSources()
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : 'Failed to create source')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="sources-page">
      <div className="sources-header">
        <div>
          <h1 className="type-h1">Lead Generation Sources</h1>
          <p className="type-body-md" style={{ color: 'var(--color-text-secondary)' }}>
            Dealerships, sub-DSAs, connectors, and direct marketing attribution.
          </p>
        </div>
        <Button variant="primary" onClick={() => setShowModal(true)}>
          + Add New Source
        </Button>
      </div>

      {error && <div className="sources-error-alert">{error}</div>}

      {isLoading ? (
        <div className="sources-loading">Loading partner sources...</div>
      ) : sources.length === 0 ? (
        <div className="sources-empty">
          <h3>No lead sources configured</h3>
          <p>Add dealerships or connectors to begin tracking case attribution.</p>
        </div>
      ) : (
        <div className="sources-table-wrap">
          <table className="sources-table">
            <thead>
              <tr>
                <th>Partner Name</th>
                <th>Channel Type</th>
                <th>Contact Person</th>
                <th>Phone / Mobile</th>
                <th style={{ textAlign: 'right' }}>Default Payout</th>
                <th>Status</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {sources.map((s) => (
                <tr key={s.id}>
                  <td>
                    <div className="font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                      {s.name}
                    </div>
                    {s.email && <div className="type-mono-xs" style={{ color: 'var(--color-text-tertiary)' }}>{s.email}</div>}
                  </td>
                  <td>
                    <span className="source-type-pill">{s.type.replace(/_/g, ' ')}</span>
                  </td>
                  <td>
                    <span>{s.contact_person || '—'}</span>
                  </td>
                  <td>
                    <span className="type-mono-sm">{s.phone || '—'}</span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <span className="type-mono-sm font-semibold">
                      {s.payout_rate_default ? `${s.payout_rate_default}%` : '—'}
                    </span>
                  </td>
                  <td>
                    <span className={`status-pill ${s.is_active ? 'active' : 'inactive'}`}>
                      {s.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>
                    <span className="type-mono-sm">
                      {new Date(s.created_at).toLocaleDateString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Modal */}
      {showModal && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-header">
              <h2 className="type-h2">Add Lead Source</h2>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setShowModal(false)}
              >
                ✕
              </button>
            </div>

            {createError && <div className="sources-error-alert">{createError}</div>}

            <form onSubmit={handleCreateSource} className="modal-form">
              <Input
                id="source-name"
                label="Partner / Dealership Name *"
                placeholder="e.g. Apex Hyundai Showroom"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />

              <div className="input-group">
                <label htmlFor="source-type" className="input-label">
                  Channel Type *
                </label>
                <select
                  id="source-type"
                  className="source-select"
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                >
                  <option value="dealer">Dealership (New/Used)</option>
                  <option value="sub_dsa">Sub-DSA Broker</option>
                  <option value="connector">Independent Connector</option>
                  <option value="direct">Direct Marketing</option>
                  <option value="walk_in">Branch Walk-In</option>
                  <option value="employee">Internal Staff</option>
                </select>
              </div>

              <Input
                id="source-contact"
                label="Primary Contact Person"
                placeholder="e.g. Vikram Sethi"
                value={contactPerson}
                onChange={(e) => setContactPerson(e.target.value)}
              />

              <Input
                id="source-phone"
                label="Contact Phone"
                placeholder="98765 00000"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />

              <Input
                id="source-email"
                label="Email Address"
                type="email"
                placeholder="dealer@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />

              <Input
                id="source-payout"
                label="Default Commission Payout Rate (%)"
                placeholder="1.25"
                value={payoutRate}
                onChange={(e) => setPayoutRate(e.target.value)}
              />

              <div className="modal-actions">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setShowModal(false)}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button type="submit" variant="primary" loading={isSubmitting}>
                  Save Source
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
