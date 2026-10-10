import React, { useCallback, useEffect, useState } from 'react'
import { api } from '../../shared/lib/api'
import { ManualMatchModal } from './ManualMatchModal'
import type { PayoutReceipt } from './types'

interface LenderOption {
  id: string
  name: string
}

export const UnmatchedQueue: React.FC = () => {
  const [receipts, setReceipts] = useState<PayoutReceipt[]>([])
  const [lenders, setLenders] = useState<LenderOption[]>([])
  const [selectedLender, setSelectedLender] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Matching modal state
  const [matchingReceipt, setMatchingReceipt] = useState<PayoutReceipt | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const fetchUnmatched = useCallback(async () => {
    try {
      setLoading(true)
      const url = selectedLender
        ? `/payout/receipts/unmatched?lender_id=${selectedLender}`
        : '/payout/receipts/unmatched'
      const data = await api.get<PayoutReceipt[]>(url)
      setReceipts(data || [])
    } catch (err) {
      console.error('Failed to load unmatched receipts:', err)
      setError('Failed to load unmatched receipts queue.')
    } finally {
      setLoading(false)
    }
  }, [selectedLender])

  useEffect(() => {
    async function loadLenders() {
      try {
        const res = await api.get<LenderOption[]>('/lenders')
        setLenders(res || [])
      } catch (err) {
        console.error('Failed to load lenders:', err)
      }
    }
    loadLenders()
  }, [])

  useEffect(() => {
    fetchUnmatched()
  }, [fetchUnmatched])

  const handleMatchSuccess = () => {
    setSuccessMessage('Receipt matched successfully and expectation updated to paid.')
    fetchUnmatched()
    setTimeout(() => setSuccessMessage(null), 5000)
  }

  return (
    <div className="space-y-4">
      {/* Header and Filter */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-slate-900/60 p-4 border border-slate-800 rounded-xl">
        <div>
          <h2 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
            Unmatched Receipts Queue
            <span className="px-2 py-0.5 rounded-full text-xs font-mono bg-amber-950/80 text-amber-300 border border-amber-800/80">
              {receipts.length} Orphans
            </span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Bank payout credits that could not be automatically matched against open loan files
          </p>
        </div>

        <div className="flex items-center space-x-3 w-full sm:w-auto">
          <select
            value={selectedLender}
            onChange={(e) => setSelectedLender(e.target.value)}
            className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 w-full sm:w-48"
          >
            <option value="">All Lenders</option>
            {lenders.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
          <button
            onClick={() => fetchUnmatched()}
            className="p-1.5 rounded-lg border border-slate-700 text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors text-xs"
            title="Refresh"
          >
            ↻
          </button>
        </div>
      </div>

      {successMessage && (
        <div className="p-3 bg-emerald-950/50 border border-emerald-800/80 text-emerald-300 text-xs rounded-lg font-mono">
          ✓ {successMessage}
        </div>
      )}

      {error && (
        <div className="p-3 bg-rose-950/50 border border-rose-800/80 text-rose-300 text-xs rounded-lg font-mono">
          {error}
        </div>
      )}

      {/* Receipts Table */}
      <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-900/60 shadow-lg">
        {loading ? (
          <div className="p-12 text-center text-xs text-slate-500 font-mono">
            Loading orphan receipts...
          </div>
        ) : receipts.length === 0 ? (
          <div className="p-12 text-center text-slate-500 font-mono text-xs">
            No unmatched orphan receipts found. All bank payout credits are reconciled!
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/70 text-[11px] text-slate-400 font-mono">
                  <th className="py-2.5 px-4">Lender</th>
                  <th className="py-2.5 px-4">Loan / LAN Ref</th>
                  <th className="py-2.5 px-4">Customer Name</th>
                  <th className="py-2.5 px-4 text-right">Received Gross</th>
                  <th className="py-2.5 px-4 text-right">TDS (5%)</th>
                  <th className="py-2.5 px-4 text-right">Net Credit</th>
                  <th className="py-2.5 px-4">Date / UTR</th>
                  <th className="py-2.5 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {receipts.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-2.5 px-4 text-slate-300 font-medium">{r.lender_name || 'Lender'}</td>
                    <td className="py-2.5 px-4 font-semibold text-slate-200">
                      {r.loan_account_no || '—'}
                    </td>
                    <td className="py-2.5 px-4 text-slate-300">{r.customer_name || '—'}</td>
                    <td className="py-2.5 px-4 text-right font-bold text-emerald-400">
                      ₹{(r.received_amount ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-2.5 px-4 text-right text-slate-400">
                      ₹{(r.tds_amount ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-2.5 px-4 text-right text-slate-200">
                      ₹{(r.net_amount ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-2.5 px-4 text-slate-400">
                      <div>{r.payment_date}</div>
                      {r.utr_reference && (
                        <div className="text-[10px] text-slate-500 truncate max-w-[120px]">
                          {r.utr_reference}
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      <button
                        onClick={() => setMatchingReceipt(r)}
                        className="px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-sans text-xs font-semibold shadow transition-colors"
                      >
                        Match Manually
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Manual Match Modal */}
      {matchingReceipt && (
        <ManualMatchModal
          receipt={matchingReceipt}
          onClose={() => setMatchingReceipt(null)}
          onSuccess={handleMatchSuccess}
        />
      )}
    </div>
  )
}
