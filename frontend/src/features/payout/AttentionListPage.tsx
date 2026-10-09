/**
 * DSA OS — AttentionListPage
 * Operational exception queue for unmapped commission rules (FR-PAY-003) and stuck PDD gating.
 */

import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { api, ApiError } from '../../shared/lib/api'
import { formatINR } from '../../shared/lib/formatters'
import Button from '../../shared/components/Button'
import { OverrideExpectationModal } from './OverrideExpectationModal'
import type { PayoutAttentionItem, PayoutExpectation } from './types'

export function AttentionListPage() {
  const [items, setItems] = useState<PayoutAttentionItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Selected item for manual override
  const [selectedExpForOverride, setSelectedExpForOverride] = useState<PayoutExpectation | null>(null)
  const [isLoadingExp, setIsLoadingExp] = useState(false)

  const loadAttentionItems = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const data = await api.get<PayoutAttentionItem[]>('/payout/expectations/attention')
      setItems(data || [])
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load attention queue.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadAttentionItems()
  }, [loadAttentionItems])

  const handleOpenOverride = async (item: PayoutAttentionItem) => {
    setIsLoadingExp(true)
    try {
      const exp = await api.get<PayoutExpectation>(`/payout/expectations/${item.id}`)
      setSelectedExpForOverride(exp)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to fetch expectation details.')
    } finally {
      setIsLoadingExp(false)
    }
  }

  const noRuleCount = items.filter((it) => it.reason === 'no_rule').length
  const pddPendingCount = items.filter((it) => it.reason === 'pdd_pending').length

  return (
    <div style={{ padding: 'var(--spacing-6)', maxWidth: 1300, margin: '0 auto' }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: 'var(--spacing-6)',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Link to="/payout" className="action-link-btn" style={{ fontSize: 13 }}>
              ← Receivables Ledger
            </Link>
          </div>
          <h1 className="type-h1" style={{ marginTop: 4 }}>Payout Attention & Exception Queue</h1>
          <p className="type-body-md" style={{ color: 'var(--color-text-secondary)', marginTop: 4 }}>
            Disbursed files requiring human action: missing commission rules (FR-PAY-003) and held PDD deliverables.
          </p>
        </div>
        <Link to="/payout/rules">
          <Button variant="secondary">Manage Commission Rules</Button>
        </Link>
      </div>

      {/* Metric Tiles */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: 'var(--spacing-4)',
          marginBottom: 'var(--spacing-6)',
        }}
      >
        <div
          className="dossier-card"
          style={{
            padding: 'var(--spacing-4)',
            borderLeft: '4px solid var(--color-danger)',
          }}
        >
          <div className="type-label-sm" style={{ color: 'var(--color-text-tertiary)', textTransform: 'uppercase' }}>
            Missing Commission Rules (FR-PAY-003)
          </div>
          <div className="type-mono-xl" style={{ fontSize: 28, fontWeight: 700, margin: '6px 0', color: 'var(--color-danger)' }}>
            {noRuleCount}
          </div>
          <div className="type-body-xs" style={{ color: 'var(--color-text-secondary)' }}>
            Disbursed loans with ₹0 commission expectation pending rule setup or manual override
          </div>
        </div>

        <div
          className="dossier-card"
          style={{
            padding: 'var(--spacing-4)',
            borderLeft: '4px solid var(--color-warning)',
          }}
        >
          <div className="type-label-sm" style={{ color: 'var(--color-text-tertiary)', textTransform: 'uppercase' }}>
            PDD Escrow Gated (BR-10)
          </div>
          <div className="type-mono-xl" style={{ fontSize: 28, fontWeight: 700, margin: '6px 0', color: 'var(--color-warning)' }}>
            {pddPendingCount}
          </div>
          <div className="type-body-xs" style={{ color: 'var(--color-text-secondary)' }}>
            Payout receivable held pending bank document acknowledgement
          </div>
        </div>
      </div>

      {error && <div className="case-error-alert">{error}</div>}

      {/* Queue List */}
      {isLoading ? (
        <div style={{ padding: 48, textAlign: 'center', color: 'var(--color-text-secondary)' }}>
          Loading exception queue...
        </div>
      ) : items.length === 0 ? (
        <div className="dossier-card" style={{ padding: 48, textAlign: 'center' }}>
          <h3 className="type-h3" style={{ color: 'var(--color-success)' }}>
            ✓ All Payouts Clear
          </h3>
          <p className="type-body-sm" style={{ color: 'var(--color-text-secondary)', marginTop: 8 }}>
            No unmapped commission rules or stuck disbursements in the exception queue.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {items.map((item) => {
            const isNoRule = item.reason === 'no_rule'

            return (
              <div
                key={item.id}
                className="dossier-card"
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: 'var(--spacing-4)',
                  borderLeft: `4px solid ${isNoRule ? 'var(--color-danger)' : 'var(--color-warning)'}`,
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: 4,
                        fontSize: 11,
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        background: isNoRule ? 'rgba(239, 68, 68, 0.15)' : 'rgba(234, 179, 8, 0.15)',
                        color: isNoRule ? 'var(--color-danger)' : 'var(--color-warning)',
                      }}
                    >
                      {isNoRule ? 'No Commission Rule' : 'PDD Incomplete'}
                    </span>

                    <Link
                      to={`/cases/${item.case_id}`}
                      style={{ fontWeight: 600, color: 'var(--color-primary)', textDecoration: 'none' }}
                    >
                      {item.case_no || item.case_id.slice(0, 8)}
                    </Link>

                    {item.applicant_name && (
                      <span style={{ color: 'var(--color-text-secondary)', fontSize: 13 }}>
                        ({item.applicant_name})
                      </span>
                    )}
                  </div>

                  <p className="type-body-sm" style={{ margin: '6px 0 2px', color: 'var(--color-text-primary)' }}>
                    {item.reason_description}
                  </p>

                  <div className="type-mono-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                    Lender: <strong>{item.lender_name || 'Bank'}</strong> — Product: {item.product} — Disbursed:{' '}
                    <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>
                      {formatINR(item.disbursal_amount)}
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {isNoRule ? (
                    <>
                      <Link to="/payout/rules">
                        <Button variant="secondary" style={{ fontSize: 12 }}>
                          Configure Grid
                        </Button>
                      </Link>
                      <Button
                        variant="primary"
                        onClick={() => handleOpenOverride(item)}
                        disabled={isLoadingExp}
                        style={{ fontSize: 12 }}
                      >
                        Manual Override
                      </Button>
                    </>
                  ) : (
                    <Link to={`/cases/${item.case_id}`}>
                      <Button variant="secondary" style={{ fontSize: 12 }}>
                        View PDD Checklist
                      </Button>
                    </Link>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Override Modal */}
      {selectedExpForOverride && (
        <OverrideExpectationModal
          expectation={selectedExpForOverride}
          onClose={() => setSelectedExpForOverride(null)}
          onOverridden={() => {
            setSelectedExpForOverride(null)
            loadAttentionItems()
          }}
        />
      )}
    </div>
  )
}
