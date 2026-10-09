import React, { useEffect, useState } from 'react'
import { api } from '../../shared/lib/api'
import { StatementImportWizard } from './StatementImportWizard'
import { UnmatchedQueue } from './UnmatchedQueue'
import type { ClawbackEvent, ImportBatch } from './types'
import './ReconciliationPage.css'

interface MissingExpectation {
  id: string
  case_id: string
  case_no: string
  applicant_name: string | null
  lender_id: string
  lender_name: string | null
  disbursal_date: string | null
  disbursal_amount: string
  gross_amount: string
  net_amount: string
  status: string
  days_overdue: number
}

export const ReconciliationPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'batches' | 'unmatched' | 'missing' | 'clawbacks'>('batches')

  // Batches state
  const [batches, setBatches] = useState<ImportBatch[]>([])
  const [loadingBatches, setLoadingBatches] = useState(true)
  const [showImportWizard, setShowImportWizard] = useState(false)

  // Reversal modal state
  const [reversingBatchId, setReversingBatchId] = useState<string | null>(null)
  const [reversalReason, setReversalReason] = useState('')
  const [submittingReversal, setSubmittingReversal] = useState(false)

  // Missing expectations state
  const [missingExps, setMissingExps] = useState<MissingExpectation[]>([])
  const [loadingMissing, setLoadingMissing] = useState(false)

  // Clawbacks state
  const [clawbacks, setClawbacks] = useState<ClawbackEvent[]>([])
  const [loadingClawbacks, setLoadingClawbacks] = useState(false)

  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const fetchBatches = async () => {
    try {
      setLoadingBatches(true)
      const data = await api.get<ImportBatch[]>('/payout/reconciliation/batches')
      setBatches(data || [])
    } catch (err) {
      console.error('Failed to load import batches:', err)
      setError('Failed to load statement import batches.')
    } finally {
      setLoadingBatches(false)
    }
  }

  const fetchMissing = async () => {
    try {
      setLoadingMissing(true)
      const data = await api.get<MissingExpectation[]>('/payout/reconciliation/missing-expectations?days_threshold=45')
      setMissingExps(data || [])
    } catch (err) {
      console.error('Failed to load missing expectations:', err)
    } finally {
      setLoadingMissing(false)
    }
  }

  const fetchClawbacks = async () => {
    try {
      setLoadingClawbacks(true)
      const data = await api.get<ClawbackEvent[]>('/payout/reconciliation/clawbacks')
      setClawbacks(data || [])
    } catch (err) {
      console.error('Failed to load clawbacks:', err)
    } finally {
      setLoadingClawbacks(false)
    }
  }

  useEffect(() => {
    fetchBatches()
  }, [])

  useEffect(() => {
    if (activeTab === 'missing') fetchMissing()
    if (activeTab === 'clawbacks') fetchClawbacks()
  }, [activeTab])

  // Check if batch is within 24h reversal window
  const isReversible = (batch: ImportBatch) => {
    if (batch.status !== 'committed') return false
    const createdAt = new Date(batch.created_at).getTime()
    const now = Date.now()
    const diffHours = (now - createdAt) / (1000 * 60 * 60)
    return diffHours <= 24
  }

  const handleReverseBatch = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!reversingBatchId || !reversalReason.trim()) return

    try {
      setSubmittingReversal(true)
      setError(null)
      await api.post(`/payout/reconciliation/batches/${reversingBatchId}/reverse`, {
        reversal_reason: reversalReason.trim(),
      })
      setSuccess('Import batch reversed successfully within the 24-hour window.')
      setReversingBatchId(null)
      setReversalReason('')
      fetchBatches()
      setTimeout(() => setSuccess(null), 5000)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Reversal failed'
      setError(msg)
    } finally {
      setSubmittingReversal(false)
    }
  }

  return (
    <div className="recon-page-container">
      {/* Title & Actions */}
      <div className="recon-header-bar">
        <div className="recon-title-area">
          <div className="recon-pretitle">GATE MONEY-01 AUDIT & SETTLEMENT</div>
          <h1 className="recon-title">
            Payout Reconciliation
          </h1>
          <p className="recon-subtitle">
            Statement ingestion, deterministic auto-matching, signed variance tracking, and clawback enforcement.
          </p>
        </div>

        <button
          onClick={() => setShowImportWizard(true)}
          className="recon-btn-import"
        >
          <span>＋</span>
          <span>Import Statement CSV</span>
        </button>
      </div>

      {success && (
        <div className="recon-alert recon-alert--success">
          ✓ {success}
        </div>
      )}

      {error && (
        <div className="recon-alert recon-alert--error">
          {error}
        </div>
      )}

      {/* Tabs */}
      <div className="recon-tabs-strip">
        {[
          { key: 'batches', label: 'Import Batches & History' },
          { key: 'unmatched', label: 'Unmatched Receipts Queue' },
          { key: 'missing', label: 'Missing Receipts (>45 Days)' },
          { key: 'clawbacks', label: 'Clawback Events' },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as 'batches' | 'unmatched' | 'missing' | 'clawbacks')}
            className={`recon-tab-btn ${activeTab === tab.key ? 'is-active' : ''}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* TAB 1: Batches & Ingestion */}
      {activeTab === 'batches' && (
        <div className="recon-card">
          {loadingBatches ? (
            <div className="p-12 text-center text-xs text-slate-500 font-mono">
              Loading statement batches...
            </div>
          ) : batches.length === 0 ? (
            <div className="p-12 text-center text-slate-500 font-mono text-xs">
              No statement batches ingested yet. Click &quot;Import Statement CSV&quot; to begin.
            </div>
          ) : (
            <div className="recon-table-wrap">
              <table className="recon-table">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-950/70 text-[11px] text-slate-400 font-mono">
                    <th className="py-2.5 px-4">Filename</th>
                    <th className="py-2.5 px-4">Lender</th>
                    <th className="py-2.5 px-4 text-right">Total Rows</th>
                    <th className="py-2.5 px-4 text-right">Matched</th>
                    <th className="py-2.5 px-4 text-right">Unmatched</th>
                    <th className="py-2.5 px-4 text-right">Total Received</th>
                    <th className="py-2.5 px-4">Imported At</th>
                    <th className="py-2.5 px-4">Status</th>
                    <th className="py-2.5 px-4 text-right">Reversal Window</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {batches.map((b) => {
                    const reversible = isReversible(b)
                    return (
                      <tr key={b.id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="py-2.5 px-4 font-semibold text-slate-200">{b.filename}</td>
                        <td className="py-2.5 px-4 text-slate-300">{b.lender_name || 'Lender'}</td>
                        <td className="py-2.5 px-4 text-right text-slate-400">{b.total_rows}</td>
                        <td className="py-2.5 px-4 text-right font-bold text-emerald-400">
                          {b.matched_rows}
                        </td>
                        <td className="py-2.5 px-4 text-right font-bold text-amber-400">
                          {b.unmatched_rows}
                        </td>
                        <td className="py-2.5 px-4 text-right font-bold text-slate-100">
                          ₹{b.total_received_amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-2.5 px-4 text-slate-400">
                          {new Date(b.created_at).toLocaleString('en-IN', {
                            dateStyle: 'short',
                            timeStyle: 'short',
                          })}
                        </td>
                        <td className="py-2.5 px-4">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                              b.status === 'committed'
                                ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                : 'bg-rose-950 text-rose-300 border border-rose-800'
                            }`}
                          >
                            {b.status}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-right">
                          {b.status === 'reversed' ? (
                            <span className="text-[10px] text-slate-500 italic">Reversed</span>
                          ) : reversible ? (
                            <button
                              onClick={() => setReversingBatchId(b.id)}
                              className="px-2.5 py-1 rounded bg-rose-950/80 border border-rose-800 text-rose-300 hover:bg-rose-900 font-sans text-xs font-medium transition-colors"
                            >
                              Reverse Batch (24h)
                            </button>
                          ) : (
                            <span className="text-[10px] text-slate-600">Expired (&gt;24h)</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: Unmatched Queue */}
      {activeTab === 'unmatched' && <UnmatchedQueue />}

      {/* TAB 3: Missing Expectations (>45 Days) */}
      {activeTab === 'missing' && (
        <div className="recon-card">
          {loadingMissing ? (
            <div className="p-12 text-center text-xs text-slate-500 font-mono">
              Loading overdue expectations...
            </div>
          ) : missingExps.length === 0 ? (
            <div className="p-12 text-center text-slate-500 font-mono text-xs">
              No expectations are overdue (&gt;45 days without statement receipt). Excellent collection rate!
            </div>
          ) : (
            <div className="recon-table-wrap">
              <table className="recon-table">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-950/70 text-[11px] text-slate-400 font-mono">
                    <th className="py-2.5 px-4">Case #</th>
                    <th className="py-2.5 px-4">Applicant</th>
                    <th className="py-2.5 px-4">Lender</th>
                    <th className="py-2.5 px-4 text-right">Disbursal Amount</th>
                    <th className="py-2.5 px-4 text-right">Expected Commission</th>
                    <th className="py-2.5 px-4">Disbursal Date</th>
                    <th className="py-2.5 px-4 text-right">Days Overdue</th>
                    <th className="py-2.5 px-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {missingExps.map((e) => (
                    <tr key={e.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="py-2.5 px-4 font-semibold text-slate-200">{e.case_no}</td>
                      <td className="py-2.5 px-4 text-slate-300">{e.applicant_name || '—'}</td>
                      <td className="py-2.5 px-4 text-slate-300">{e.lender_name || '—'}</td>
                      <td className="py-2.5 px-4 text-right text-slate-400">
                        ₹{Number(e.disbursal_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-2.5 px-4 text-right font-bold text-amber-400">
                        ₹{Number(e.gross_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-2.5 px-4 text-slate-400">{e.disbursal_date || '—'}</td>
                      <td className="py-2.5 px-4 text-right font-bold text-rose-400">
                        {e.days_overdue} days
                      </td>
                      <td className="py-2.5 px-4">
                        <span className="px-1.5 py-0.5 rounded text-[10px] uppercase font-bold bg-amber-950/80 text-amber-300 border border-amber-800/80">
                          {e.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: Clawbacks */}
      {activeTab === 'clawbacks' && (
        <div className="recon-card">
          {loadingClawbacks ? (
            <div className="p-12 text-center text-xs text-slate-500 font-mono">
              Loading clawback events...
            </div>
          ) : clawbacks.length === 0 ? (
            <div className="p-12 text-center text-slate-500 font-mono text-xs">
              No clawback events recorded. Zero commission recovery losses!
            </div>
          ) : (
            <div className="recon-table-wrap">
              <table className="recon-table">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-950/70 text-[11px] text-slate-400 font-mono">
                    <th className="py-2.5 px-4">Case #</th>
                    <th className="py-2.5 px-4">Reason / Notes</th>
                    <th className="py-2.5 px-4 text-right">Clawback Amount</th>
                    <th className="py-2.5 px-4">Effective Date</th>
                    <th className="py-2.5 px-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {clawbacks.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="py-2.5 px-4 font-semibold text-slate-200">{c.case_no || '—'}</td>
                      <td className="py-2.5 px-4 text-slate-300 max-w-xs truncate">{c.reason}</td>
                      <td className="py-2.5 px-4 text-right font-bold text-rose-400">
                        ₹{c.clawback_amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-2.5 px-4 text-slate-400">{c.effective_date}</td>
                      <td className="py-2.5 px-4">
                        <span className="px-1.5 py-0.5 rounded text-[10px] uppercase font-bold bg-rose-950/80 text-rose-300 border border-rose-800/80">
                          {c.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Import Wizard Modal */}
      {showImportWizard && (
        <StatementImportWizard
          onClose={() => setShowImportWizard(false)}
          onImportComplete={() => {
            fetchBatches()
          }}
        />
      )}

      {/* Reversal Confirmation Modal */}
      {reversingBatchId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-700/80 rounded-xl shadow-2xl w-full max-w-md p-6 space-y-4 text-slate-200">
            <h3 className="text-base font-semibold text-rose-300">
              Confirm Statement Batch Reversal (FR-PAY-008)
            </h3>
            <p className="text-xs text-slate-400">
              Reversing this batch will delete all receipts imported in this file and reset any matched expectations back to &apos;due&apos;. This action is audited and cannot be undone.
            </p>

            <form onSubmit={handleReverseBatch} className="space-y-4">
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">
                  Reversal Reason (Mandatory Memo)
                </label>
                <textarea
                  required
                  rows={3}
                  value={reversalReason}
                  onChange={(e) => setReversalReason(e.target.value)}
                  placeholder="e.g. Uploaded draft statement file instead of confirmed bank credit report"
                  className="w-full bg-slate-950 border border-slate-800 rounded p-2.5 text-xs text-slate-200 focus:outline-none focus:border-rose-500"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setReversingBatchId(null)
                    setReversalReason('')
                  }}
                  className="px-4 py-1.5 rounded-lg border border-slate-700 text-xs font-medium text-slate-300 hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingReversal || !reversalReason.trim()}
                  className="px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-xs font-semibold text-white shadow-lg shadow-rose-900/40"
                >
                  {submittingReversal ? 'Reversing...' : 'Confirm Reversal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
