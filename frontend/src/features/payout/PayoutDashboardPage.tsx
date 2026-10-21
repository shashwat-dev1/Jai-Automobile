import { useState, useEffect, useCallback, useMemo } from 'react'
import { api, ApiError } from '../../shared/lib/api'
import { formatINR } from '../../shared/lib/formatters'
import Button from '../../shared/components/Button'
import { getISTDateParts } from '../../shared/lib/leadQueues'
import type { PayoutCalculationResult } from '../../shared/lib/payoutCalculator'
import './PayoutDashboardPage.css'

export function PayoutDashboardPage() {
  const currentMonth = useMemo(() => getISTDateParts().reportingMonth, [])
  const [selectedPeriod, setSelectedPeriod] = useState<string>(currentMonth)
  const [data, setData] = useState<{
    period: string
    totalVolume: number
    totalEarned: number
    totalReceived: number
    totalReceivable: number
    partners: PayoutCalculationResult[]
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Drill-down source drawer state
  const [selectedDrillDown, setSelectedDrillDown] = useState<PayoutCalculationResult | null>(null)

  // Record Receipt Modal State
  const [showReceiptModal, setShowReceiptModal] = useState(false)
  const [receiptPartnerId, setReceiptPartnerId] = useState('')
  const [receiptAmount, setReceiptAmount] = useState('')
  const [receiptReference, setReceiptReference] = useState('')
  const [receiptDate, setReceiptDate] = useState(new Date().toISOString().split('T')[0])
  const [isSubmittingReceipt, setIsSubmittingReceipt] = useState(false)

  const loadMetrics = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await api.get<any>(`/payout/dashboard-metrics?period=${selectedPeriod}`)
      setData(res)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load payout metrics.')
    } finally {
      setLoading(false)
    }
  }, [selectedPeriod])

  useEffect(() => {
    loadMetrics()

    const handleUpdate = () => {
      loadMetrics()
    }
    window.addEventListener('dsa_os_partner_allocations_updated', handleUpdate)
    window.addEventListener('dsa_os_payout_policies_updated', handleUpdate)
    window.addEventListener('dsa_os_payout_receipts_updated', handleUpdate)
    window.addEventListener('storage', handleUpdate)
    return () => {
      window.removeEventListener('dsa_os_partner_allocations_updated', handleUpdate)
      window.removeEventListener('dsa_os_payout_policies_updated', handleUpdate)
      window.removeEventListener('dsa_os_payout_receipts_updated', handleUpdate)
      window.removeEventListener('storage', handleUpdate)
    }
  }, [loadMetrics])

  const handleRecordReceipt = async () => {
    const parsedAmt = Number(receiptAmount)
    if (!receiptPartnerId || isNaN(parsedAmt) || parsedAmt <= 0) {
      alert('Please select a financing partner and enter a valid positive amount.')
      return
    }

    setIsSubmittingReceipt(true)
    try {
      await api.post('/payout/receipts', {
        financingPartnerId: receiptPartnerId,
        period: selectedPeriod,
        amount: parsedAmt,
        receivedOn: receiptDate,
        reference: receiptReference.trim() || `UTR-${Date.now()}`,
      })

      setShowReceiptModal(false)
      setReceiptAmount('')
      setReceiptReference('')
      loadMetrics()
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Failed to record receipt.')
    } finally {
      setIsSubmittingReceipt(false)
    }
  }

  return (
    <div className="payout-dashboard-container">
      <div className="payout-header">
        <div className="payout-title-group">
          <h1>Payout Dashboard</h1>
          <p>Traceable lender commission expectations, tiered milestone calculations, and actual payout receipts.</p>
        </div>

        <div style={{ display: 'flex', gap: 'var(--space-sm)', alignItems: 'center' }}>
          <div className="period-filter-group">
            <label htmlFor="payout-period-select" style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
              Month:
            </label>
            <select
              id="payout-period-select"
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(e.target.value)}
            >
              <option value="2026-10">October 2026</option>
              <option value="2026-09">September 2026</option>
              <option value="2026-08">August 2026</option>
            </select>
          </div>

          <Button variant="primary" size="sm" onClick={() => setShowReceiptModal(true)}>
            + Record Receipt
          </Button>
        </div>
      </div>

      {error && (
        <div className="alert-result-banner error" role="alert">
          {error}
        </div>
      )}

      {/* Top 4 Financial Summary Cards */}
      {data && (
        <div className="performance-summary-cards">
          <div className="perf-card">
            <div className="perf-card-label">Total Attributed Volume</div>
            <div className="perf-card-value">{formatINR(data.totalVolume)}</div>
          </div>
          <div className="perf-card">
            <div className="perf-card-label">Total Payout Earned</div>
            <div className="perf-card-value" style={{ color: '#16a34a' }}>{formatINR(data.totalEarned)}</div>
          </div>
          <div className="perf-card">
            <div className="perf-card-label">Amount Received</div>
            <div className="perf-card-value" style={{ color: '#0284c7' }}>{formatINR(data.totalReceived)}</div>
          </div>
          <div className="perf-card">
            <div className="perf-card-label">Outstanding Receivable</div>
            <div className="perf-card-value" style={{ color: data.totalReceivable > 0 ? '#b45309' : '#15803d' }}>
              {formatINR(data.totalReceivable)}
            </div>
          </div>
        </div>
      )}

      {loading && !data ? (
        <div style={{ padding: 'var(--space-2xl)', textAlign: 'center' }}>Calculating payout metrics...</div>
      ) : (
        <div className="partner-payout-cards-grid">
          {data?.partners.map((partner) => {
            const hasPolicy = partner.hasPolicy
            const volume = partner.totalAttributedVolume
            const nextMilestone = partner.nextMilestoneAmount
            const remaining = partner.amountRemainingToMilestone
            const pctToNext = nextMilestone && nextMilestone > 0 ? Math.min(100, (volume / nextMilestone) * 100) : 100

            return (
              <div key={partner.partnerId} className="payout-partner-card">
                <div className="card-top-row">
                  <div>
                    <div className="card-partner-name">{partner.partnerName}</div>
                    <span className="lead-id-sub">{partner.partnerId}</span>
                  </div>
                  <div>
                    {hasPolicy ? (
                      <span className="status-badge" style={{ background: '#f1f5f9', color: '#475569' }}>
                        Mode: {partner.tierMode?.toUpperCase()} ({partner.calculationBasis?.replace('_', ' ')})
                      </span>
                    ) : (
                      <span className="status-badge" style={{ background: '#fef3c7', color: '#b45309' }}>
                        Policy not configured
                      </span>
                    )}
                  </div>
                </div>

                {!hasPolicy ? (
                  <div className="unconfigured-notice">
                    <strong>Notice:</strong> No active payout policy configured for {partner.partnerName} for {selectedPeriod}. Business volume of {formatINR(volume)} recorded without rate calculation.
                  </div>
                ) : (
                  <>
                    <div className="payout-metrics-grid">
                      <div>
                        <div className="metric-item-label">Business Volume</div>
                        <div className="metric-item-val">{formatINR(volume)}</div>
                      </div>
                      <div>
                        <div className="metric-item-label">Payout Earned</div>
                        <div className="metric-item-val" style={{ color: '#16a34a' }}>
                          {formatINR(partner.payoutEarned)}
                        </div>
                      </div>
                      <div>
                        <div className="metric-item-label">Amount Received</div>
                        <div className="metric-item-val" style={{ color: partner.hasReceipts ? '#0284c7' : '#94a3b8', fontSize: '15px' }}>
                          {partner.hasReceipts ? formatINR(partner.amountReceived) : '₹0 (No receipts recorded)'}
                        </div>
                      </div>
                      <div>
                        <div className="metric-item-label">Outstanding Receivable</div>
                        <div className="metric-item-val" style={{ color: partner.outstandingReceivable > 0 ? '#b45309' : '#15803d' }}>
                          {partner.isOverpaid ? `Overpaid (${formatINR(partner.overpaidAmount)})` : formatINR(partner.outstandingReceivable)}
                        </div>
                      </div>
                    </div>

                    {/* Milestone Progress Section */}
                    <div className="milestone-progress-section">
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                        <span>
                          {partner.isTopTierReached
                            ? 'Top tier reached!'
                            : `Next Milestone: ${formatINR(nextMilestone)}`}
                        </span>
                        {!partner.isTopTierReached && remaining !== null && (
                          <strong style={{ color: '#0369a1' }}>Remaining: {formatINR(remaining)}</strong>
                        )}
                      </div>
                      <div className="milestone-bar-container">
                        <div
                          className="milestone-bar-fill"
                          style={{ width: `${pctToNext}%`, background: partner.isTopTierReached ? '#16a34a' : 'var(--color-primary)' }}
                        />
                      </div>
                    </div>
                  </>
                )}

                <div className="card-actions-row">
                  <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                    Contributing: <strong>{partner.contributingAllocations.length}</strong> loans
                  </span>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setSelectedDrillDown(partner)}
                  >
                    View Source Drill-Down
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Drill-down Drawer: Contributing Allocations */}
      {selectedDrillDown && (
        <div
          className="perf-detail-drawer-backdrop"
          onClick={() => setSelectedDrillDown(null)}
          role="dialog"
          aria-modal="true"
        >
          <div className="perf-detail-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <div>
                <h2>{selectedDrillDown.partnerName} — Source Allocations</h2>
                <span className="lead-id-sub">Period: {selectedPeriod}</span>
              </div>
              <button
                type="button"
                className="drawer-close-btn"
                onClick={() => setSelectedDrillDown(null)}
                aria-label="Close drawer"
              >
                ✕
              </button>
            </div>

            <div className="drawer-body">
              <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', marginBottom: '16px', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span>Total Volume:</span>
                  <strong>{formatINR(selectedDrillDown.totalAttributedVolume)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Payout Earned:</span>
                  <strong style={{ color: '#16a34a' }}>{formatINR(selectedDrillDown.payoutEarned)}</strong>
                </div>
              </div>

              <h3>Contributing Sanctioned Loans ({selectedDrillDown.contributingAllocations.length})</h3>
              {selectedDrillDown.contributingAllocations.length === 0 ? (
                <p style={{ color: 'var(--color-text-secondary)' }}>No contributing allocations for this period.</p>
              ) : (
                selectedDrillDown.contributingAllocations.map((alloc) => (
                  <div key={alloc.id} className="alloc-detail-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <a href={`/cases/${alloc.leadId}`} style={{ color: 'var(--color-primary)', fontWeight: 600 }}>
                        {alloc.leadId}
                      </a>
                      <span className="status-badge sanctioned">Sanctioned</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                      <span>Sanctioned Amount:</span>
                      <strong style={{ color: '#15803d' }}>{formatINR(alloc.sanctionAmount)}</strong>
                    </div>
                    <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                      Date: {alloc.sanctionedAt ? new Date(alloc.sanctionedAt).toLocaleDateString('en-IN') : '—'}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Record Receipt Modal */}
      {showReceiptModal && (
        <div className="alloc-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="receipt-modal-title">
          <div className="alloc-modal-card">
            <h2 id="receipt-modal-title">Record Actual Payout Receipt</h2>
            <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '16px' }}>
              Record genuine money received from a financing partner for {selectedPeriod}.
            </p>

            <div className="alloc-field-group">
              <label htmlFor="receipt-partner-select">Financing Partner *</label>
              <select
                id="receipt-partner-select"
                value={receiptPartnerId}
                onChange={(e) => setReceiptPartnerId(e.target.value)}
                required
              >
                <option value="">Select Partner</option>
                {data?.partners.map((p) => (
                  <option key={p.partnerId} value={p.partnerId}>
                    {p.partnerName}
                  </option>
                ))}
              </select>
            </div>

            <div className="alloc-field-group">
              <label htmlFor="receipt-amount-input">Amount Received (INR) *</label>
              <input
                id="receipt-amount-input"
                type="number"
                placeholder="e.g. 25000"
                value={receiptAmount}
                onChange={(e) => setReceiptAmount(e.target.value)}
                min="1"
                required
              />
            </div>

            <div className="alloc-field-group">
              <label htmlFor="receipt-ref-input">Payment Reference / UTR *</label>
              <input
                id="receipt-ref-input"
                type="text"
                placeholder="e.g. UTR18293049182"
                value={receiptReference}
                onChange={(e) => setReceiptReference(e.target.value)}
                required
              />
            </div>

            <div className="alloc-field-group">
              <label htmlFor="receipt-date-input">Received On *</label>
              <input
                id="receipt-date-input"
                type="date"
                value={receiptDate}
                onChange={(e) => setReceiptDate(e.target.value)}
                required
              />
            </div>

            <div className="alloc-modal-actions">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowReceiptModal(false)}
                disabled={isSubmittingReceipt}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleRecordReceipt}
                disabled={isSubmittingReceipt}
              >
                {isSubmittingReceipt ? 'Recording...' : 'Record Receipt'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default PayoutDashboardPage
