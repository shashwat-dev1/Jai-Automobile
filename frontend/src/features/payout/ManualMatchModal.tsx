import React, { useEffect, useState } from 'react'
import { api } from '../../shared/lib/api'
import type { PayoutExpectation, PayoutReceipt, Reconciliation } from './types'

interface ManualMatchModalProps {
  receipt: PayoutReceipt
  onClose: () => void
  onSuccess: (recon: Reconciliation) => void
}

export const ManualMatchModal: React.FC<ManualMatchModalProps> = ({
  receipt,
  onClose,
  onSuccess,
}) => {
  const [expectations, setExpectations] = useState<PayoutExpectation[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedExpId, setSelectedExpId] = useState<string | null>(null)
  const [tolerance, setTolerance] = useState<number>(10)
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadExpectations() {
      try {
        setLoading(true)
        // Fetch expectations for this lender
        const data = await api.get<PayoutExpectation[]>(
          `/payout/expectations?lender_id=${receipt.lender_id}`
        )
        // Filter to unsettled expectations
        const openExps = (data || []).filter(
          (e) => e.status === 'held' || e.status === 'due' || e.status === 'no_rule'
        )
        setExpectations(openExps)
      } catch (err) {
        console.error('Failed to load expectations for matching:', err)
        setError('Failed to load available payout expectations.')
      } finally {
        setLoading(false)
      }
    }
    loadExpectations()
  }, [receipt.lender_id])

  const filtered = expectations.filter((e) => {
    const term = searchTerm.toLowerCase().trim()
    if (!term) return true
    const caseMatch = e.case_no?.toLowerCase().includes(term)
    const nameMatch = e.applicant_name?.toLowerCase().includes(term)
    return Boolean(caseMatch || nameMatch)
  })

  const selectedExp = expectations.find((e) => e.id === selectedExpId)

  // Variance preview
  let variance = 0
  let matchStatus: 'matched' | 'short' | 'excess' = 'matched'
  if (selectedExp) {
    variance = receipt.received_amount - selectedExp.gross_amount
    const absVar = Math.abs(variance)
    if (absVar <= tolerance) {
      matchStatus = 'matched'
    } else if (variance < 0) {
      matchStatus = 'short'
    } else {
      matchStatus = 'excess'
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedExpId) {
      setError('Please select an expectation to match against.')
      return
    }

    try {
      setSubmitting(true)
      setError(null)
      const recon = await api.post<Reconciliation>('/payout/reconciliation/match', {
        expectation_id: selectedExpId,
        receipt_id: receipt.id,
        tolerance: Number(tolerance),
        notes: notes.trim() || undefined,
      })
      onSuccess(recon)
      onClose()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Manual match failed'
      setError(msg)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700/80 rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden text-slate-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
          <div>
            <h2 className="text-lg font-semibold text-slate-100">Manual Receipt Matching</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Link unmatched bank credit to an expected commission receivable
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 text-xl font-bold p-1 rounded transition-colors"
          >
            &times;
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {error && (
            <div className="p-3 bg-rose-950/50 border border-rose-800/80 text-rose-300 text-sm rounded-lg">
              {error}
            </div>
          )}

          {/* Receipt Info Card */}
          <div className="bg-slate-950/60 border border-slate-800 rounded-lg p-4 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs font-mono">
            <div>
              <span className="text-slate-500 block text-[10px] uppercase tracking-wider">Lender</span>
              <span className="text-slate-200 font-medium">{receipt.lender_name || 'Lender'}</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px] uppercase tracking-wider">Loan / Ref No</span>
              <span className="text-slate-200 font-medium">{receipt.loan_account_no || '—'}</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px] uppercase tracking-wider">Received Amount</span>
              <span className="text-emerald-400 font-bold">
                ₹{receipt.received_amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px] uppercase tracking-wider">Date / UTR</span>
              <span className="text-slate-300">
                {receipt.payment_date} {receipt.utr_reference ? `(${receipt.utr_reference})` : ''}
              </span>
            </div>
          </div>

          {/* Search Candidate Expectations */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-xs font-medium text-slate-300 uppercase tracking-wider">
                Select Matching Payout Expectation
              </label>
              <input
                type="text"
                placeholder="Search case # or customer..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="bg-slate-950 border border-slate-700 rounded px-2.5 py-1 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 w-64"
              />
            </div>

            <div className="border border-slate-800 rounded-lg overflow-hidden max-h-56 overflow-y-auto bg-slate-950/40">
              {loading ? (
                <div className="p-8 text-center text-xs text-slate-500 font-mono">
                  Loading open expectations...
                </div>
              ) : filtered.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500 font-mono">
                  No matching unsettled expectations found for this lender.
                </div>
              ) : (
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-950/80 text-[11px] text-slate-400 font-mono">
                      <th className="py-2 px-3">Select</th>
                      <th className="py-2 px-3">Case #</th>
                      <th className="py-2 px-3">Applicant</th>
                      <th className="py-2 px-3 text-right">Disbursal</th>
                      <th className="py-2 px-3 text-right">Expected Gross</th>
                      <th className="py-2 px-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {filtered.map((exp) => (
                      <tr
                        key={exp.id}
                        onClick={() => setSelectedExpId(exp.id)}
                        className={`cursor-pointer transition-colors ${
                          selectedExpId === exp.id
                            ? 'bg-indigo-950/40 border-l-2 border-indigo-500'
                            : 'hover:bg-slate-800/40'
                        }`}
                      >
                        <td className="py-2 px-3">
                          <input
                            type="radio"
                            checked={selectedExpId === exp.id}
                            onChange={() => setSelectedExpId(exp.id)}
                            className="text-indigo-600 focus:ring-0"
                          />
                        </td>
                        <td className="py-2 px-3 font-semibold text-slate-200">{exp.case_no}</td>
                        <td className="py-2 px-3 text-slate-300">{exp.applicant_name || '—'}</td>
                        <td className="py-2 px-3 text-right text-slate-400">
                          ₹{exp.disbursal_amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-2 px-3 text-right font-bold text-slate-100">
                          ₹{exp.gross_amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-2 px-3">
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium uppercase bg-slate-800 text-slate-300">
                            {exp.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Variance & Parameters Preview */}
          {selectedExp && (
            <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-4 space-y-3">
              <div className="text-xs font-semibold text-slate-200 uppercase tracking-wider flex justify-between items-center">
                <span>Match Verification & Variance</span>
                <span
                  className={`px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider ${
                    matchStatus === 'matched'
                      ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                      : matchStatus === 'short'
                      ? 'bg-amber-950 text-amber-300 border border-amber-800'
                      : 'bg-indigo-950 text-indigo-300 border border-indigo-800'
                  }`}
                >
                  {matchStatus === 'matched'
                    ? 'Within Tolerance (Matched)'
                    : matchStatus === 'short'
                    ? 'Short Payment (Deficit)'
                    : 'Excess Payment (Surplus)'}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-3 text-xs font-mono pt-1">
                <div className="bg-slate-900/60 p-2.5 rounded border border-slate-800">
                  <span className="text-[10px] text-slate-500 block">Expected Gross</span>
                  <span className="text-slate-200 font-bold">
                    ₹{selectedExp.gross_amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="bg-slate-900/60 p-2.5 rounded border border-slate-800">
                  <span className="text-[10px] text-slate-500 block">Actual Received</span>
                  <span className="text-emerald-400 font-bold">
                    ₹{receipt.received_amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="bg-slate-900/60 p-2.5 rounded border border-slate-800">
                  <span className="text-[10px] text-slate-500 block">Signed Variance</span>
                  <span
                    className={`font-bold ${
                      variance === 0
                        ? 'text-slate-300'
                        : variance > 0
                        ? 'text-indigo-400'
                        : 'text-amber-400'
                    }`}
                  >
                    {variance > 0 ? '+' : ''}
                    ₹{variance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <div>
                  <label className="text-[11px] font-medium text-slate-400 block mb-1">
                    Tolerance (₹)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={tolerance}
                    onChange={(e) => setTolerance(Number(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-slate-400 block mb-1">
                    Reconciliation Notes / Memo
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Subvention deduction verified with branch manager"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-900/80 flex justify-end space-x-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg border border-slate-700 text-xs font-medium text-slate-300 hover:bg-slate-800 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!selectedExpId || submitting}
            className="px-5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-xs font-semibold text-white shadow-lg transition-colors"
          >
            {submitting ? 'Matching...' : 'Confirm Match'}
          </button>
        </div>
      </div>
    </div>
  )
}
