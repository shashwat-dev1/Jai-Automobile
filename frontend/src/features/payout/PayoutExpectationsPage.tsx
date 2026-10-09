/**
 * DSA OS — PayoutExpectationsPage
 * Authoritative Commission Receivables Ledger.
 * Displays all calculated commissions, PDD gating status, TDS deductions, and split breakdowns.
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { api, ApiError } from '../../shared/lib/api'
import { formatINR } from '../../shared/lib/formatters'
import Button from '../../shared/components/Button'
import StatusChip from '../../shared/components/StatusChip'
import { SplitEditorModal } from './SplitEditorModal'
import { OverrideExpectationModal } from './OverrideExpectationModal'
import type { PayoutExpectation } from './types'

export function PayoutExpectationsPage() {
  const [expectations, setExpectations] = useState<PayoutExpectation[]>([])
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Active Modals
  const [selectedSplitsExp, setSelectedSplitsExp] = useState<PayoutExpectation | null>(null)
  const [selectedOverrideExp, setSelectedOverrideExp] = useState<PayoutExpectation | null>(null)

  const loadExpectations = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const url =
        statusFilter === 'all'
          ? '/payout/expectations'
          : `/payout/expectations?status=${statusFilter}`
      const items = await api.get<PayoutExpectation[]>(url)
      setExpectations(items || [])
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load payout expectations.')
    } finally {
      setIsLoading(false)
    }
  }, [statusFilter])

  useEffect(() => {
    loadExpectations()
  }, [loadExpectations])

  // Aggregate Metrics
  const metrics = useMemo(() => {
    let totalGross = 0
    let totalNet = 0
    let heldGross = 0
    let dueGross = 0
    let attentionCount = 0

    for (const exp of expectations) {
      const gross = Number(exp.gross_amount) || 0
      const net = Number(exp.net_amount) || 0
      totalGross += gross
      totalNet += net
      if (exp.status === 'held') heldGross += gross
      if (exp.status === 'due') dueGross += gross
      if (exp.status === 'no_rule' || (exp.status === 'held' && exp.gating_status === 'pending')) {
        attentionCount += 1
      }
    }

    return { totalGross, totalNet, heldGross, dueGross, attentionCount }
  }, [expectations])

  const handleExpectationUpdated = (updated: PayoutExpectation) => {
    setExpectations((prev) => prev.map((e) => (e.id === updated.id ? updated : e)))
  }

  return (
    <div style={{ padding: 'var(--spacing-6)', maxWidth: 1400, margin: '0 auto' }}>
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
          <h1 className="type-h1">Commission Receivables Ledger</h1>
          <p className="type-body-md" style={{ color: 'var(--color-text-secondary)', marginTop: 4 }}>
            Tracks expected lender payouts, PDD escrow gating (BR-10), TDS withholdings, and Sub-DSA splits.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Link to="/payout/rules">
            <Button variant="secondary">Commission Rules</Button>
          </Link>
          <Link to="/payout/attention">
            <Button variant="secondary">
              Attention Queue
              {metrics.attentionCount > 0 && (
                <span
                  style={{
                    marginLeft: 6,
                    background: 'var(--color-danger)',
                    color: '#fff',
                    borderRadius: '10px',
                    padding: '2px 7px',
                    fontSize: 11,
                  }}
                >
                  {metrics.attentionCount}
                </span>
              )}
            </Button>
          </Link>
        </div>
      </div>

      {/* KPI Tiles */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 'var(--spacing-4)',
          marginBottom: 'var(--spacing-6)',
        }}
      >
        <div className="dossier-card" style={{ padding: 'var(--spacing-4)' }}>
          <div className="type-label-sm" style={{ color: 'var(--color-text-tertiary)', textTransform: 'uppercase' }}>
            Total Expected Gross
          </div>
          <div className="type-mono-xl" style={{ fontSize: 24, fontWeight: 700, margin: '6px 0' }}>
            {formatINR(metrics.totalGross)}
          </div>
          <div className="type-body-xs" style={{ color: 'var(--color-text-secondary)' }}>
            Net: {formatINR(metrics.totalNet)} after TDS
          </div>
        </div>

        <div className="dossier-card" style={{ padding: 'var(--spacing-4)' }}>
          <div className="type-label-sm" style={{ color: 'var(--color-text-tertiary)', textTransform: 'uppercase' }}>
            Due for Receipt
          </div>
          <div
            className="type-mono-xl"
            style={{ fontSize: 24, fontWeight: 700, margin: '6px 0', color: 'var(--color-primary)' }}
          >
            {formatINR(metrics.dueGross)}
          </div>
          <div className="type-body-xs" style={{ color: 'var(--color-text-secondary)' }}>
            PDD conditions satisfied; ready for payout
          </div>
        </div>

        <div className="dossier-card" style={{ padding: 'var(--spacing-4)' }}>
          <div className="type-label-sm" style={{ color: 'var(--color-text-tertiary)', textTransform: 'uppercase' }}>
            Held for PDD (Escrow)
          </div>
          <div
            className="type-mono-xl"
            style={{ fontSize: 24, fontWeight: 700, margin: '6px 0', color: 'var(--color-warning)' }}
          >
            {formatINR(metrics.heldGross)}
          </div>
          <div className="type-body-xs" style={{ color: 'var(--color-text-secondary)' }}>
            Lender release pending document acknowledgement
          </div>
        </div>

        <div className="dossier-card" style={{ padding: 'var(--spacing-4)' }}>
          <div className="type-label-sm" style={{ color: 'var(--color-text-tertiary)', textTransform: 'uppercase' }}>
            Action Required
          </div>
          <div
            className="type-mono-xl"
            style={{ fontSize: 24, fontWeight: 700, margin: '6px 0', color: metrics.attentionCount > 0 ? 'var(--color-danger)' : 'var(--color-text-primary)' }}
          >
            {metrics.attentionCount}
          </div>
          <div className="type-body-xs" style={{ color: 'var(--color-text-secondary)' }}>
            Unmapped rules or stuck PDD items
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div
        style={{
          display: 'flex',
          gap: 8,
          marginBottom: 'var(--spacing-4)',
          borderBottom: '1px solid var(--color-border)',
          paddingBottom: 8,
        }}
      >
        {['all', 'due', 'held', 'no_rule', 'paid'].map((st) => (
          <button
            key={st}
            type="button"
            className={`action-link-btn ${statusFilter === st ? 'active' : ''}`}
            onClick={() => setStatusFilter(st)}
            style={{
              padding: '6px 12px',
              fontWeight: statusFilter === st ? 600 : 400,
              background: statusFilter === st ? 'var(--color-surface-hover)' : 'transparent',
              color: statusFilter === st ? 'var(--color-primary)' : 'var(--color-text-secondary)',
              borderRadius: 4,
            }}
          >
            {st === 'all'
              ? 'All Records'
              : st === 'no_rule'
              ? 'No Rule'
              : st.replace('_', ' ').toUpperCase()}
          </button>
        ))}
      </div>

      {error && <div className="case-error-alert">{error}</div>}

      {/* Table */}
      {isLoading ? (
        <div style={{ padding: 48, textAlign: 'center', color: 'var(--color-text-secondary)' }}>
          Loading receivables ledger...
        </div>
      ) : expectations.length === 0 ? (
        <div className="dossier-card" style={{ padding: 48, textAlign: 'center' }}>
          <h3 className="type-h3">No expectations found</h3>
          <p className="type-body-sm" style={{ color: 'var(--color-text-secondary)', marginTop: 8 }}>
            Expectations are created automatically when loan applications reach Disbursed status.
          </p>
        </div>
      ) : (
        <div className="dossier-card" style={{ padding: 0, overflowX: 'auto' }}>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              textAlign: 'left',
              fontSize: 13,
            }}
          >
            <thead>
              <tr
                style={{
                  borderBottom: '1px solid var(--color-border)',
                  background: 'var(--color-surface)',
                  color: 'var(--color-text-tertiary)',
                  textTransform: 'uppercase',
                  fontSize: 11,
                  letterSpacing: '0.05em',
                }}
              >
                <th style={{ padding: '10px 14px' }}>Case & Customer</th>
                <th style={{ padding: '10px 14px' }}>Lender & Product</th>
                <th style={{ padding: '10px 14px', textAlign: 'right' }}>Disbursal (₹)</th>
                <th style={{ padding: '10px 14px', textAlign: 'right' }}>Gross Commission</th>
                <th style={{ padding: '10px 14px', textAlign: 'right' }}>TDS (5%)</th>
                <th style={{ padding: '10px 14px', textAlign: 'right' }}>Net Receivable</th>
                <th style={{ padding: '10px 14px' }}>Status</th>
                <th style={{ padding: '10px 14px' }}>PDD Gating</th>
                <th style={{ padding: '10px 14px', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {expectations.map((exp) => (
                <tr
                  key={exp.id}
                  style={{
                    borderBottom: '1px solid var(--color-border)',
                    transition: 'background 0.15s ease',
                  }}
                >
                  <td style={{ padding: '12px 14px' }}>
                    <Link
                      to={`/cases/${exp.case_id}`}
                      style={{ fontWeight: 600, color: 'var(--color-primary)', textDecoration: 'none' }}
                    >
                      {exp.case_no || exp.case_id.slice(0, 8)}
                    </Link>
                    {exp.applicant_name && (
                      <div className="type-body-xs" style={{ color: 'var(--color-text-secondary)', marginTop: 2 }}>
                        {exp.applicant_name}
                      </div>
                    )}
                  </td>

                  <td style={{ padding: '12px 14px' }}>
                    <div style={{ fontWeight: 500 }}>{exp.lender_name || 'Lender'}</div>
                    <div className="type-mono-xs" style={{ color: 'var(--color-text-tertiary)', marginTop: 2 }}>
                      {exp.product || 'loan'}
                    </div>
                  </td>

                  <td style={{ padding: '12px 14px', textAlign: 'right' }} className="type-mono-sm font-semibold">
                    {formatINR(exp.disbursal_amount)}
                  </td>

                  <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                    <div className="type-mono-sm font-semibold">{formatINR(exp.gross_amount)}</div>
                    {exp.is_override && (
                      <span className="type-mono-xs" style={{ color: 'var(--color-warning)' }} title={exp.override_reason || ''}>
                        ⚡ Overridden
                      </span>
                    )}
                  </td>

                  <td style={{ padding: '12px 14px', textAlign: 'right', color: 'var(--color-danger)' }} className="type-mono-sm">
                    -{formatINR(exp.tds_amount)}
                  </td>

                  <td
                    style={{ padding: '12px 14px', textAlign: 'right', color: 'var(--color-primary)' }}
                    className="type-mono-sm font-semibold"
                  >
                    {formatINR(exp.net_amount)}
                  </td>

                  <td style={{ padding: '12px 14px' }}>
                    <StatusChip status={exp.status} />
                  </td>

                  <td style={{ padding: '12px 14px' }}>
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: 4,
                        fontSize: 11,
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        background:
                          exp.gating_status === 'satisfied'
                            ? 'rgba(34, 197, 94, 0.15)'
                            : 'rgba(234, 179, 8, 0.15)',
                        color:
                          exp.gating_status === 'satisfied'
                            ? 'var(--color-success)'
                            : 'var(--color-warning)',
                      }}
                    >
                      {exp.gating_status === 'satisfied' ? 'Satisfied' : 'Pending'}
                    </span>
                  </td>

                  <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      <button
                        type="button"
                        className="action-link-btn"
                        onClick={() => setSelectedSplitsExp(exp)}
                        style={{ fontSize: 12, padding: '2px 6px', border: '1px solid var(--color-border)' }}
                      >
                        Splits ({exp.splits?.length || 0})
                      </button>
                      <button
                        type="button"
                        className="action-link-btn"
                        onClick={() => setSelectedOverrideExp(exp)}
                        style={{ fontSize: 12, padding: '2px 6px', border: '1px solid var(--color-border)' }}
                      >
                        Override
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modals */}
      {selectedSplitsExp && (
        <SplitEditorModal
          expectation={selectedSplitsExp}
          onClose={() => setSelectedSplitsExp(null)}
          onSaved={(newSplits) => {
            handleExpectationUpdated({ ...selectedSplitsExp, splits: newSplits })
            setSelectedSplitsExp(null)
          }}
        />
      )}

      {selectedOverrideExp && (
        <OverrideExpectationModal
          expectation={selectedOverrideExp}
          onClose={() => setSelectedOverrideExp(null)}
          onOverridden={(updated) => {
            handleExpectationUpdated(updated)
            setSelectedOverrideExp(null)
          }}
        />
      )}
    </div>
  )
}
