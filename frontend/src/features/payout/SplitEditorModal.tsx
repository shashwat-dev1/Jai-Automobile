/**
 * DSA OS — SplitEditorModal
 * Commission sub-allocation editor enforcing BR-09 (<= 100% total splits).
 */

import { useState, useEffect } from 'react'
import { api, ApiError } from '../../shared/lib/api'
import { formatINR } from '../../shared/lib/formatters'
import Button from '../../shared/components/Button'
import type {
  PayoutExpectation,
  PayoutSplit,
  PayoutSplitItem,
  BeneficiaryType,
} from './types'

interface SplitEditorModalProps {
  expectation: PayoutExpectation
  onClose: () => void
  onSaved: (splits: PayoutSplit[]) => void
}

interface SourceOption {
  id: string
  name: string
}

interface UserOption {
  id: string
  name: string
  role: string
}

export function SplitEditorModal({ expectation, onClose, onSaved }: SplitEditorModalProps) {
  const [splits, setSplits] = useState<PayoutSplitItem[]>([])
  const [sources, setSources] = useState<SourceOption[]>([])
  const [users, setUsers] = useState<UserOption[]>([])
  const [isLoadingMeta, setIsLoadingMeta] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Populate existing splits
    if (expectation.splits && expectation.splits.length > 0) {
      setSplits(
        expectation.splits.map((s) => ({
          beneficiary_type: s.beneficiary_type,
          source_id: s.source_id,
          user_id: s.user_id,
          share_type: s.share_type,
          share_value: Number(s.share_value),
        }))
      )
    } else {
      // Default: 100% company retainage
      setSplits([
        {
          beneficiary_type: 'company',
          share_type: 'percent',
          share_value: 100,
        },
      ])
    }

    // Load available sources and users
    async function loadMeta() {
      setIsLoadingMeta(true)
      try {
        const [sourcesRes, usersRes] = await Promise.all([
          api.get<{ items: SourceOption[] }>('/sources').catch(() => ({ items: [] })),
          api.get<UserOption[]>('/admin/users').catch(() => []),
        ])
        setSources(sourcesRes.items || [])
        setUsers(usersRes || [])
      } catch {
        // Fallback silently if meta endpoint fails
      } finally {
        setIsLoadingMeta(false)
      }
    }
    loadMeta()
  }, [expectation])

  const totalPercent = splits
    .filter((s) => s.share_type === 'percent')
    .reduce((sum, s) => sum + (Number(s.share_value) || 0), 0)

  const isPercentExceeded = totalPercent > 100

  const handleAddSplit = () => {
    const remaining = Math.max(0, 100 - totalPercent)
    setSplits([
      ...splits,
      {
        beneficiary_type: 'source',
        share_type: 'percent',
        share_value: remaining,
      },
    ])
  }

  const handleRemoveSplit = (idx: number) => {
    setSplits(splits.filter((_, i) => i !== idx))
  }

  const handleUpdateSplit = (idx: number, patch: Partial<PayoutSplitItem>) => {
    setSplits(
      splits.map((s, i) => {
        if (i !== idx) return s
        const updated = { ...s, ...patch }
        // Clean foreign keys when type changes
        if (patch.beneficiary_type && patch.beneficiary_type !== s.beneficiary_type) {
          if (patch.beneficiary_type === 'source') {
            updated.user_id = null
          } else if (patch.beneficiary_type === 'sales_agent' || patch.beneficiary_type === 'processor') {
            updated.source_id = null
          } else {
            updated.source_id = null
            updated.user_id = null
          }
        }
        return updated
      })
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isPercentExceeded) {
      setError('Total percentage splits cannot exceed 100.00%.')
      return
    }

    setError(null)
    setIsSubmitting(true)

    try {
      const savedSplits = await api.put<PayoutSplit[]>(
        `/payout/expectations/${expectation.id}/splits`,
        { splits }
      )
      onSaved(savedSplits)
      onClose()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save splits.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="modal-card" style={{ maxWidth: 680 }}>
        <div className="modal-header">
          <div>
            <h2 className="type-h2">Commission Allocation & Splits (BR-09)</h2>
            <p className="type-body-xs" style={{ color: 'var(--color-text-secondary)', marginTop: 2 }}>
              Case: <strong>{expectation.case_no || expectation.case_id.slice(0, 8)}</strong> — Gross:{' '}
              <span className="type-mono-sm font-semibold">{formatINR(expectation.gross_amount)}</span>
            </p>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {error && <div className="case-error-alert">{error}</div>}

        <form onSubmit={handleSubmit} className="modal-form">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span className="type-label-sm" style={{ textTransform: 'uppercase', color: 'var(--color-text-tertiary)' }}>
              Allocations Breakdown
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="type-body-xs">Total Share:</span>
              <span
                className="type-mono-sm font-semibold"
                style={{ color: isPercentExceeded ? 'var(--color-danger)' : 'var(--color-primary)' }}
              >
                {totalPercent.toFixed(1)}% / 100%
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 320, overflowY: 'auto' }}>
            {splits.map((s, idx) => {
              const estimatedAmount =
                s.share_type === 'percent'
                  ? (expectation.gross_amount * (s.share_value || 0)) / 100
                  : s.share_value || 0

              return (
                <div
                  key={idx}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '130px 1fr 90px 100px 32px',
                    gap: 8,
                    alignItems: 'center',
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    padding: 8,
                  }}
                >
                  <select
                    className="case-select"
                    value={s.beneficiary_type}
                    onChange={(e) =>
                      handleUpdateSplit(idx, { beneficiary_type: e.target.value as BeneficiaryType })
                    }
                  >
                    <option value="source">Dealer/Source</option>
                    <option value="sales_agent">Sales Agent</option>
                    <option value="processor">Loan Processor</option>
                    <option value="company">DSA Company</option>
                  </select>

                  {/* Beneficiary Reference Selector */}
                  {s.beneficiary_type === 'source' ? (
                    <select
                      className="case-select"
                      value={s.source_id || ''}
                      onChange={(e) => handleUpdateSplit(idx, { source_id: e.target.value || null })}
                      disabled={isLoadingMeta}
                    >
                      <option value="">Select Lead Source...</option>
                      {sources.map((src) => (
                        <option key={src.id} value={src.id}>
                          {src.name}
                        </option>
                      ))}
                    </select>
                  ) : s.beneficiary_type === 'sales_agent' || s.beneficiary_type === 'processor' ? (
                    <select
                      className="case-select"
                      value={s.user_id || ''}
                      onChange={(e) => handleUpdateSplit(idx, { user_id: e.target.value || null })}
                      disabled={isLoadingMeta}
                    >
                      <option value="">Select Executive...</option>
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name} ({u.role.replace('_', ' ')})
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="type-body-xs" style={{ color: 'var(--color-text-secondary)', padding: '0 8px' }}>
                      Main DSA Revenue Retainage
                    </div>
                  )}

                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max={s.share_type === 'percent' ? 100 : Number(expectation.gross_amount)}
                      className="case-input type-mono-sm"
                      value={s.share_value}
                      onChange={(e) => handleUpdateSplit(idx, { share_value: parseFloat(e.target.value) || 0 })}
                      required
                    />
                    <span className="type-body-xs font-semibold">%</span>
                  </div>

                  <div className="type-mono-sm font-semibold" style={{ textAlign: 'right' }}>
                    {formatINR(estimatedAmount)}
                  </div>

                  <button
                    type="button"
                    className="modal-close-btn"
                    onClick={() => handleRemoveSplit(idx)}
                    title="Remove split"
                    style={{ color: 'var(--color-danger)' }}
                  >
                    ✕
                  </button>
                </div>
              )
            })}
          </div>

          <div style={{ marginTop: 8 }}>
            <button
              type="button"
              className="action-link-btn"
              onClick={handleAddSplit}
              style={{ fontSize: 13, textDecoration: 'underline' }}
            >
              + Add Beneficiary Split
            </button>
          </div>

          {isPercentExceeded && (
            <div className="case-error-alert" style={{ marginTop: 12 }}>
              BR-09 Violation: Total allocated share ({totalPercent.toFixed(1)}%) cannot exceed 100%.
            </div>
          )}

          <div className="modal-actions" style={{ marginTop: 16 }}>
            <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={isSubmitting} disabled={isPercentExceeded}>
              Save Splits
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
