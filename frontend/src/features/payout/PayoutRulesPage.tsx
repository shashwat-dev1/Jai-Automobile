/**
 * DSA OS — PayoutRulesPage
 * Commission Grid Management.
 * Configure effective-dated commission schedules per lender and product.
 */

import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { api, ApiError } from '../../shared/lib/api'
import { formatINR } from '../../shared/lib/formatters'
import Button from '../../shared/components/Button'
import type {
  PayoutRule,
  PayoutRuleCreateRequest,
  PayoutBasis,
  PayoutGatingType,
  SlabTier,
} from './types'

interface LenderOption {
  id: string
  name: string
  products?: string[]
}

export function PayoutRulesPage() {
  const [rules, setRules] = useState<PayoutRule[]>([])
  const [lenders, setLenders] = useState<LenderOption[]>([])
  const [lenderFilter, setLenderFilter] = useState<string>('all')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Add Rule Modal
  const [showAddModal, setShowAddModal] = useState(false)
  const [formLenderId, setFormLenderId] = useState('')
  const [formProduct, setFormProduct] = useState('used_car')
  const [formEffectiveFrom, setFormEffectiveFrom] = useState(
    new Date().toISOString().slice(0, 10)
  )
  const [formEffectiveTo, setFormEffectiveTo] = useState('')
  const [formBasis, setFormBasis] = useState<PayoutBasis>('percent')
  const [formRatePercent, setFormRatePercent] = useState('1.500')
  const [formFlatAmount, setFormFlatAmount] = useState('')
  const [formSlabs, setFormSlabs] = useState<SlabTier[]>([
    { min_amount: 0, max_amount: 500000, rate_percent: 1.25 },
    { min_amount: 500001, max_amount: 1500000, rate_percent: 1.5 },
  ])
  const [formGatingType, setFormGatingType] = useState<PayoutGatingType>('pdd_complete')
  const [formTdsRate, setFormTdsRate] = useState('5.00')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const [rulesRes, lendersRes] = await Promise.all([
        api.get<PayoutRule[]>(
          lenderFilter === 'all'
            ? '/payout/rules'
            : `/payout/rules?lender_id=${lenderFilter}`
        ),
        api.get<LenderOption[]>('/lenders').catch(() => []),
      ])
      setRules(rulesRes || [])
      setLenders(lendersRes || [])
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load commission rules.')
    } finally {
      setIsLoading(false)
    }
  }, [lenderFilter])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleAddSlab = () => {
    const last = formSlabs[formSlabs.length - 1]
    const nextMin = last && last.max_amount ? last.max_amount + 1 : 0
    setFormSlabs([...formSlabs, { min_amount: nextMin, max_amount: null, rate_percent: 1.75 }])
  }

  const handleRemoveSlab = (idx: number) => {
    setFormSlabs(formSlabs.filter((_, i) => i !== idx))
  }

  const handleUpdateSlab = (idx: number, patch: Partial<SlabTier>) => {
    setFormSlabs(formSlabs.map((s, i) => (i === idx ? { ...s, ...patch } : s)))
  }

  const handleCreateRule = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formLenderId) {
      setFormError('Please select a partner lender.')
      return
    }

    setFormError(null)
    setIsSubmitting(true)

    const payload: PayoutRuleCreateRequest = {
      lender_id: formLenderId,
      product: formProduct,
      effective_from: formEffectiveFrom,
      effective_to: formEffectiveTo ? formEffectiveTo : null,
      basis: formBasis,
      rate_percent: formBasis === 'percent' ? parseFloat(formRatePercent) : null,
      flat_amount: formBasis === 'flat' ? parseFloat(formFlatAmount) : null,
      slabs: formBasis === 'slab' ? formSlabs : null,
      gating_type: formGatingType,
      tds_rate_percent: parseFloat(formTdsRate) || 5.0,
      gst_mode: 'forward_charge',
      is_active: true,
    }

    try {
      const created = await api.post<PayoutRule>('/payout/rules', payload)
      setRules([created, ...rules])
      setShowAddModal(false)
      // Reset form
      setFormLenderId('')
      setFormRatePercent('1.500')
      setFormFlatAmount('')
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Failed to create commission rule.')
    } finally {
      setIsSubmitting(false)
    }
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Link to="/payout" className="action-link-btn" style={{ fontSize: 13 }}>
              ← Receivables Ledger
            </Link>
          </div>
          <h1 className="type-h1" style={{ marginTop: 4 }}>Commission Grids & Payout Rules</h1>
          <p className="type-body-md" style={{ color: 'var(--color-text-secondary)', marginTop: 4 }}>
            Bank commission matrices by loan product. Effective-dated schedules preserve past disbursal terms intact (BR-13).
          </p>
        </div>
        <Button variant="primary" onClick={() => setShowAddModal(true)}>
          + Add Commission Grid
        </Button>
      </div>

      {/* Filter Bar */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 'var(--spacing-4)', alignItems: 'center' }}>
        <span className="type-label-sm" style={{ textTransform: 'uppercase', color: 'var(--color-text-tertiary)' }}>
          Filter Lender:
        </span>
        <select
          className="case-select"
          style={{ maxWidth: 260 }}
          value={lenderFilter}
          onChange={(e) => setLenderFilter(e.target.value)}
        >
          <option value="all">All Lenders</option>
          {lenders.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </div>

      {error && <div className="case-error-alert">{error}</div>}

      {/* Rules Table */}
      {isLoading ? (
        <div style={{ padding: 48, textAlign: 'center', color: 'var(--color-text-secondary)' }}>
          Loading commission grids...
        </div>
      ) : rules.length === 0 ? (
        <div className="dossier-card" style={{ padding: 48, textAlign: 'center' }}>
          <h3 className="type-h3">No commission rules configured</h3>
          <p className="type-body-sm" style={{ color: 'var(--color-text-secondary)', marginTop: 8 }}>
            Set up commission agreements with your empanelled banks to enable automatic payout tracking.
          </p>
          <div style={{ marginTop: 16 }}>
            <Button variant="primary" onClick={() => setShowAddModal(true)}>
              Create First Rule
            </Button>
          </div>
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
                <th style={{ padding: '10px 14px' }}>Lender Partner</th>
                <th style={{ padding: '10px 14px' }}>Product</th>
                <th style={{ padding: '10px 14px' }}>Effective Dates</th>
                <th style={{ padding: '10px 14px' }}>Commission Structure</th>
                <th style={{ padding: '10px 14px' }}>PDD Gating</th>
                <th style={{ padding: '10px 14px' }}>TDS</th>
                <th style={{ padding: '10px 14px' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <td style={{ padding: '12px 14px', fontWeight: 600 }}>{r.lender_name || 'Lender'}</td>
                  <td style={{ padding: '12px 14px' }}>
                    <span className="type-mono-xs" style={{ textTransform: 'uppercase' }}>
                      {r.product}
                    </span>
                  </td>
                  <td style={{ padding: '12px 14px' }}>
                    <div className="type-mono-xs">
                      {r.effective_from} → {r.effective_to || 'Ongoing'}
                    </div>
                  </td>
                  <td style={{ padding: '12px 14px' }}>
                    {r.basis === 'percent' && (
                      <span className="type-mono-sm font-semibold" style={{ color: 'var(--color-primary)' }}>
                        {r.rate_percent}% of Disbursal
                      </span>
                    )}
                    {r.basis === 'flat' && (
                      <span className="type-mono-sm font-semibold" style={{ color: 'var(--color-primary)' }}>
                        {formatINR(r.flat_amount || 0)} Flat Fee
                      </span>
                    )}
                    {r.basis === 'slab' && (
                      <span className="type-body-xs font-semibold">
                        Tiered Slabs ({r.slabs?.length || 0} brackets)
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '12px 14px' }}>
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: 4,
                        fontSize: 11,
                        fontWeight: 600,
                        background:
                          r.gating_type === 'pdd_complete'
                            ? 'rgba(234, 179, 8, 0.15)'
                            : 'rgba(34, 197, 94, 0.15)',
                        color:
                          r.gating_type === 'pdd_complete'
                            ? 'var(--color-warning)'
                            : 'var(--color-success)',
                      }}
                    >
                      {r.gating_type === 'pdd_complete' ? 'PDD Gated (BR-10)' : 'Immediate'}
                    </span>
                  </td>
                  <td style={{ padding: '12px 14px' }} className="type-mono-xs">
                    {r.tds_rate_percent}%
                  </td>
                  <td style={{ padding: '12px 14px' }}>
                    <span
                      style={{
                        color: r.is_active ? 'var(--color-success)' : 'var(--color-text-tertiary)',
                        fontWeight: 600,
                        fontSize: 12,
                      }}
                    >
                      {r.is_active ? '● Active' : '○ Inactive'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Rule Modal */}
      {showAddModal && (
        <div className="modal-backdrop">
          <div className="modal-card" style={{ maxWidth: 640 }}>
            <div className="modal-header">
              <h2 className="type-h2">Add Commission Grid Rule</h2>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setShowAddModal(false)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            {formError && <div className="case-error-alert">{formError}</div>}

            <form onSubmit={handleCreateRule} className="modal-form">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="input-group">
                  <label htmlFor="rule-lender" className="input-label">
                    Partner Lender *
                  </label>
                  <select
                    id="rule-lender"
                    className="case-select"
                    value={formLenderId}
                    onChange={(e) => setFormLenderId(e.target.value)}
                    required
                  >
                    <option value="">Select Bank / NBFC...</option>
                    {lenders.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="input-group">
                  <label htmlFor="rule-product" className="input-label">
                    Loan Product *
                  </label>
                  <select
                    id="rule-product"
                    className="case-select"
                    value={formProduct}
                    onChange={(e) => setFormProduct(e.target.value)}
                    required
                  >
                    <option value="used_car">Used Car Loan</option>
                    <option value="new_car">New Car Loan</option>
                    <option value="loan_against_car">Loan Against Car (Refinance)</option>
                    <option value="commercial_vehicle">Commercial Vehicle</option>
                    <option value="two_wheeler">Two Wheeler</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="input-group">
                  <label htmlFor="effective-from" className="input-label">
                    Effective From *
                  </label>
                  <input
                    id="effective-from"
                    type="date"
                    className="case-input"
                    value={formEffectiveFrom}
                    onChange={(e) => setFormEffectiveFrom(e.target.value)}
                    required
                  />
                </div>

                <div className="input-group">
                  <label htmlFor="effective-to" className="input-label">
                    Effective To (Optional)
                  </label>
                  <input
                    id="effective-to"
                    type="date"
                    className="case-input"
                    value={formEffectiveTo}
                    onChange={(e) => setFormEffectiveTo(e.target.value)}
                  />
                </div>
              </div>

              <div className="input-group">
                <label htmlFor="rule-basis" className="input-label">
                  Commission Calculation Basis *
                </label>
                <select
                  id="rule-basis"
                  className="case-select"
                  value={formBasis}
                  onChange={(e) => setFormBasis(e.target.value as PayoutBasis)}
                >
                  <option value="percent">Percentage of Disbursal Amount</option>
                  <option value="flat">Flat Fixed Fee (₹)</option>
                  <option value="slab">Tiered Slabs (by Ticket Size)</option>
                </select>
              </div>

              {formBasis === 'percent' && (
                <div className="input-group">
                  <label htmlFor="rate-percent" className="input-label">
                    Payout Rate (%) *
                  </label>
                  <input
                    id="rate-percent"
                    type="number"
                    step="0.001"
                    min="0"
                    max="100"
                    className="case-input type-mono-sm font-semibold"
                    value={formRatePercent}
                    onChange={(e) => setFormRatePercent(e.target.value)}
                    required
                  />
                </div>
              )}

              {formBasis === 'flat' && (
                <div className="input-group">
                  <label htmlFor="flat-amount" className="input-label">
                    Flat Commission Amount (₹) *
                  </label>
                  <input
                    id="flat-amount"
                    type="number"
                    step="0.01"
                    min="0"
                    className="case-input type-mono-sm font-semibold"
                    value={formFlatAmount}
                    onChange={(e) => setFormFlatAmount(e.target.value)}
                    required
                  />
                </div>
              )}

              {formBasis === 'slab' && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span className="type-label-sm" style={{ textTransform: 'uppercase' }}>
                      Slab Ticket Brackets
                    </span>
                    <button
                      type="button"
                      className="action-link-btn"
                      onClick={handleAddSlab}
                      style={{ fontSize: 12 }}
                    >
                      + Add Bracket
                    </button>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {formSlabs.map((sl, idx) => (
                      <div
                        key={idx}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '1fr 1fr 1fr 32px',
                          gap: 6,
                          alignItems: 'center',
                        }}
                      >
                        <input
                          type="number"
                          className="case-input type-mono-xs"
                          placeholder="Min ₹"
                          value={sl.min_amount}
                          onChange={(e) =>
                            handleUpdateSlab(idx, { min_amount: parseFloat(e.target.value) || 0 })
                          }
                          required
                        />
                        <input
                          type="number"
                          className="case-input type-mono-xs"
                          placeholder="Max ₹ (or empty)"
                          value={sl.max_amount ?? ''}
                          onChange={(e) =>
                            handleUpdateSlab(idx, {
                              max_amount: e.target.value ? parseFloat(e.target.value) : null,
                            })
                          }
                        />
                        <input
                          type="number"
                          step="0.01"
                          className="case-input type-mono-xs font-semibold"
                          placeholder="Rate %"
                          value={sl.rate_percent ?? ''}
                          onChange={(e) =>
                            handleUpdateSlab(idx, {
                              rate_percent: parseFloat(e.target.value) || 0,
                            })
                          }
                          required
                        />
                        <button
                          type="button"
                          className="modal-close-btn"
                          onClick={() => handleRemoveSlab(idx)}
                          style={{ color: 'var(--color-danger)' }}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="input-group">
                  <label htmlFor="gating-type" className="input-label">
                    Escrow Gating Condition *
                  </label>
                  <select
                    id="gating-type"
                    className="case-select"
                    value={formGatingType}
                    onChange={(e) => setFormGatingType(e.target.value as PayoutGatingType)}
                  >
                    <option value="pdd_complete">PDD Complete (BR-10: Held until RC/Docs acknowledged)</option>
                    <option value="none">Immediate (No PDD Gating)</option>
                  </select>
                </div>

                <div className="input-group">
                  <label htmlFor="tds-rate" className="input-label">
                    Statutory TDS Deduction Rate (%)
                  </label>
                  <input
                    id="tds-rate"
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    className="case-input type-mono-sm"
                    value={formTdsRate}
                    onChange={(e) => setFormTdsRate(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="modal-actions" style={{ marginTop: 16 }}>
                <Button type="button" variant="secondary" onClick={() => setShowAddModal(false)} disabled={isSubmitting}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" loading={isSubmitting}>
                  Save Grid Rule
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
