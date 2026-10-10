import React, { useState, useEffect, useCallback } from 'react'
import { api, ApiError } from '../../shared/lib/api'
import Button from '../../shared/components/Button'
import { CreateLenderModal } from './CreateLenderModal'
import type { Lender } from './types'
import './LendersPage.css'

export const LendersPage: React.FC = () => {
  const [lenders, setLenders] = useState<Lender[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  const loadLenders = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const data = await api.get<Lender[]>('/lenders')
      setLenders(Array.isArray(data) ? data : [])
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load partner lenders')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadLenders()
  }, [loadLenders])

  const handleToggleActive = async (lender: Lender) => {
    setTogglingId(lender.id)
    try {
      await api.patch(`/lenders/${lender.id}`, {
        is_active: !lender.is_active,
      })
      await loadLenders()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to toggle lender status')
    } finally {
      setTogglingId(null)
    }
  }

  return (
    <div className="lenders-page">
      <div className="lenders-header">
        <div>
          <h1 className="type-h1">Partner Lenders & Financing Institutions</h1>
          <p className="type-body-md" style={{ color: 'var(--color-text-secondary)', marginTop: 4 }}>
            Configured banks, NBFCs, and financial partners enabled for multi-bank submissions.
          </p>
        </div>
        <Button variant="primary" onClick={() => setShowCreateModal(true)}>
          + Add Partner Bank
        </Button>
      </div>

      {error && <div className="alert-error" style={{ margin: '16px 0' }}>{error}</div>}

      {isLoading ? (
        <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
          Loading lenders...
        </div>
      ) : lenders.length === 0 ? (
        <div className="empty-state" style={{ padding: 48, textAlign: 'center', background: 'var(--color-surface)', border: '1px dashed var(--color-border)', borderRadius: 6 }}>
          <h3 className="type-h3">No Partner Lenders Configured</h3>
          <p className="type-body-sm" style={{ color: 'var(--color-text-secondary)', margin: '8px 0 16px' }}>
            Register your active DSA relationships with partner banks (HDFC, ICICI, Kotak, Axis, etc.).
          </p>
          <Button variant="primary" onClick={() => setShowCreateModal(true)}>
            Add First Partner Bank
          </Button>
        </div>
      ) : (
        <div className="lenders-table-container">
          <table className="lenders-table">
            <thead>
              <tr>
                <th>Lender Name</th>
                <th>Type</th>
                <th>DSA Code</th>
                <th>Supported Products</th>
                <th>RM / Contact</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {lenders.map((lender) => (
                <tr key={lender.id} className={!lender.is_active ? 'is-inactive-row' : ''}>
                  <td>
                    <div className="lender-name-cell">
                      <span className="font-semibold">{lender.name}</span>
                      {lender.code && <span className="type-mono-xs lender-code-badge">{lender.code}</span>}
                    </div>
                  </td>
                  <td>
                    <span className="type-mono-xs" style={{ textTransform: 'uppercase' }}>
                      {lender.type}
                    </span>
                  </td>
                  <td>
                    <span className="type-mono-sm">{lender.dsa_code || '—'}</span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {lender.products.map((p) => (
                        <span key={p} className="product-tag">
                          {p.replace(/_/g, ' ')}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td>
                    {lender.contact_person ? (
                      <div>
                        <div>{lender.contact_person}</div>
                        <div className="type-mono-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                          {lender.contact_mobile || lender.contact_email || ''}
                        </div>
                      </div>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>
                    <span className={`status-pill ${lender.is_active ? 'active' : 'inactive'}`}>
                      {lender.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <Button
                      variant="secondary"
                      onClick={() => handleToggleActive(lender)}
                      disabled={togglingId === lender.id}
                      style={{ fontSize: 12, padding: '4px 8px' }}
                    >
                      {lender.is_active ? 'Deactivate' : 'Activate'}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CreateLenderModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={loadLenders}
      />
    </div>
  )
}
