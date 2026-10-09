/**
 * DSA OS — PayoutSection
 * Embedded case dossier section showing expected commission, gating status, frozen rule snapshot, and splits.
 */

import { useState, useEffect, useCallback } from 'react'
import { api, ApiError } from '../../shared/lib/api'
import { formatINR } from '../../shared/lib/formatters'
import Button from '../../shared/components/Button'
import StatusChip from '../../shared/components/StatusChip'
import { SplitEditorModal } from './SplitEditorModal'
import { OverrideExpectationModal } from './OverrideExpectationModal'
import type { PayoutExpectation } from './types'

interface PayoutSectionProps {
  caseId: string
}

export function PayoutSection({ caseId }: PayoutSectionProps) {
  const [expectation, setExpectation] = useState<PayoutExpectation | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Modals
  const [showSplitsModal, setShowSplitsModal] = useState(false)
  const [showOverrideModal, setShowOverrideModal] = useState(false)

  const loadExpectation = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const items = await api.get<PayoutExpectation[]>(`/payout/expectations?case_id=${caseId}`)
      if (items && items.length > 0) {
        setExpectation(items[0])
      } else {
        setExpectation(null)
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load payout data.')
    } finally {
      setIsLoading(false)
    }
  }, [caseId])

  useEffect(() => {
    loadExpectation()
  }, [loadExpectation])

  if (isLoading) {
    return (
      <div style={{ padding: 'var(--spacing-4)', textAlign: 'center' }}>
        <p className="type-body-sm" style={{ color: 'var(--color-text-secondary)' }}>
          Loading payout receivable terms...
        </p>
      </div>
    )
  }

  if (error) {
    return <div className="case-error-alert">{error}</div>
  }

  if (!expectation) {
    return (
      <div>
        <div className="dossier-card-header">
          <h2 className="dossier-card-title">Payout & Commissions</h2>
        </div>
        <p className="type-body-sm" style={{ color: 'var(--color-text-secondary)', padding: '8px 0' }}>
          No payout expectation generated yet. Payout receivable terms are automatically calculated
          when the winning lender application is marked as Disbursed.
        </p>
      </div>
    )
  }

  return (
    <div>
      <div className="dossier-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 className="dossier-card-title">Expected Lender Commission</h2>
          <span className="type-body-xs" style={{ color: 'var(--color-text-secondary)' }}>
            Lender: <strong>{expectation.lender_name || 'Bank'}</strong> — {expectation.product}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <StatusChip status={expectation.status} />
          <Button variant="secondary" onClick={() => setShowOverrideModal(true)} style={{ fontSize: 12, padding: '4px 8px' }}>
            Override
          </Button>
        </div>
      </div>

      {/* PDD Gating Notice */}
      {expectation.status === 'held' && expectation.gating_status === 'pending' && (
        <div
          style={{
            background: 'rgba(234, 179, 8, 0.1)',
            border: '1px solid rgba(234, 179, 8, 0.3)',
            padding: '8px 12px',
            marginBottom: 12,
            fontSize: 13,
            color: 'var(--color-warning)',
          }}
        >
          <strong>PDD GATED (BR-10):</strong> Commission payout is held by bank pending acknowledgement of
          all post-disbursal documents.
        </div>
      )}

      {/* No Rule Alert */}
      {expectation.status === 'no_rule' && (
        <div
          style={{
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            padding: '8px 12px',
            marginBottom: 12,
            fontSize: 13,
            color: 'var(--color-danger)',
          }}
        >
          <strong>ATTENTION REQUIRED (FR-PAY-003):</strong> No commission grid matched this loan disbursal.
          Use manual override or configure rule in Commission Rules.
        </div>
      )}

      {/* Financial Numbers Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 8,
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          padding: 12,
          marginBottom: 16,
        }}
      >
        <div>
          <div className="type-label-sm" style={{ color: 'var(--color-text-tertiary)', textTransform: 'uppercase' }}>
            Disbursed
          </div>
          <div className="type-mono-sm font-semibold" style={{ marginTop: 4 }}>
            {formatINR(expectation.disbursal_amount)}
          </div>
        </div>

        <div>
          <div className="type-label-sm" style={{ color: 'var(--color-text-tertiary)', textTransform: 'uppercase' }}>
            Gross Payout
          </div>
          <div className="type-mono-sm font-semibold" style={{ marginTop: 4 }}>
            {formatINR(expectation.gross_amount)}
          </div>
        </div>

        <div>
          <div className="type-label-sm" style={{ color: 'var(--color-text-tertiary)', textTransform: 'uppercase' }}>
            TDS ({expectation.tds_rate_percent}%)
          </div>
          <div className="type-mono-sm font-semibold" style={{ marginTop: 4, color: 'var(--color-danger)' }}>
            -{formatINR(expectation.tds_amount)}
          </div>
        </div>

        <div>
          <div className="type-label-sm" style={{ color: 'var(--color-text-tertiary)', textTransform: 'uppercase' }}>
            Net Receivable
          </div>
          <div className="type-mono-sm font-semibold" style={{ marginTop: 4, color: 'var(--color-primary)' }}>
            {formatINR(expectation.net_amount)}
          </div>
        </div>
      </div>

      {/* Frozen Snapshot / Override Notes */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16, fontSize: 12 }}>
        {expectation.is_override && (
          <div style={{ color: 'var(--color-warning)' }}>
            ⚡ <strong>Manual Override Applied:</strong> {expectation.override_reason} (Original Gross:{' '}
            {formatINR(expectation.original_gross_amount || 0)})
          </div>
        )}
        {expectation.rule_snapshot && (
          <div style={{ color: 'var(--color-text-secondary)' }}>
            🔒 <strong>Contract Terms (BR-13):</strong> {String(expectation.rule_snapshot.basis || 'percent').toUpperCase()}{' '}
            basis
            {Boolean(expectation.rule_snapshot.rate_percent) && ` @ ${String(expectation.rule_snapshot.rate_percent)}%`}
            {Boolean(expectation.rule_snapshot.gating_type) && ` | Gating: ${String(expectation.rule_snapshot.gating_type)}`}
          </div>
        )}
      </div>

      {/* Commission Splits Section */}
      <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span className="type-label-sm" style={{ textTransform: 'uppercase', color: 'var(--color-text-tertiary)' }}>
            Beneficiary Splits (BR-09)
          </span>
          <Button variant="secondary" onClick={() => setShowSplitsModal(true)} style={{ fontSize: 11, padding: '2px 8px' }}>
            Edit Splits
          </Button>
        </div>

        {expectation.splits && expectation.splits.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {expectation.splits.map((s) => (
              <div
                key={s.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '4px 8px',
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  fontSize: 12,
                }}
              >
                <div>
                  <span style={{ fontWeight: 600, textTransform: 'capitalize' }}>
                    {s.beneficiary_type.replace('_', ' ')}
                  </span>
                  {(s.source_name || s.user_name) && (
                    <span style={{ color: 'var(--color-text-secondary)', marginLeft: 6 }}>
                      ({s.source_name || s.user_name})
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <span className="type-mono-xs" style={{ color: 'var(--color-text-secondary)' }}>
                    {Number(s.share_value).toFixed(1)}%
                  </span>
                  <span className="type-mono-sm font-semibold">{formatINR(s.split_amount)}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="type-body-xs" style={{ color: 'var(--color-text-secondary)' }}>
            No splits configured. 100% retained by main DSA.
          </p>
        )}
      </div>

      {/* Modals */}
      {showSplitsModal && (
        <SplitEditorModal
          expectation={expectation}
          onClose={() => setShowSplitsModal(false)}
          onSaved={(newSplits) => setExpectation({ ...expectation, splits: newSplits })}
        />
      )}

      {showOverrideModal && (
        <OverrideExpectationModal
          expectation={expectation}
          onClose={() => setShowOverrideModal(false)}
          onOverridden={(updated) => setExpectation(updated)}
        />
      )}
    </div>
  )
}
