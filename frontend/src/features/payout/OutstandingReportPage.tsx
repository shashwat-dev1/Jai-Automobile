import React, { useEffect, useState } from 'react'
import { api } from '../../shared/lib/api'
import type { OutstandingReportResponse } from './types'

export const OutstandingReportPage: React.FC = () => {
  const [report, setReport] = useState<OutstandingReportResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchReport = async () => {
    try {
      setLoading(true)
      const data = await api.get<OutstandingReportResponse>('/payout/reconciliation/outstanding')
      setReport(data)
    } catch (err) {
      console.error('Failed to load outstanding report:', err)
      setError('Failed to load lender receivables outstanding report.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchReport()
  }, [])

  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-xl font-bold text-slate-100 tracking-tight">
            Lender Receivables &amp; Ageing Report
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Complete financial breakdown of expected vs collected payout receivables with overdue ageing buckets
          </p>
        </div>

        <button
          onClick={() => fetchReport()}
          className="px-3.5 py-1.5 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-300 text-xs font-medium transition-colors"
        >
          ↻ Refresh Report
        </button>
      </div>

      {error && (
        <div className="p-3 bg-rose-950/50 border border-rose-800/80 text-rose-300 text-xs rounded-lg font-mono">
          {error}
        </div>
      )}

      {loading ? (
        <div className="p-16 text-center text-xs text-slate-500 font-mono">
          Computing real-time lender receivables ledger...
        </div>
      ) : !report ? (
        <div className="p-16 text-center text-xs text-slate-500 font-mono">
          No receivables data available.
        </div>
      ) : (
        <div className="space-y-6">
          {/* Top Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 font-mono">
            <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-xl shadow-lg">
              <span className="text-[11px] text-slate-400 block uppercase tracking-wider">
                Total Expected Commission
              </span>
              <span className="text-xl font-bold text-slate-100 mt-1 block">
                ₹{(report.total_expected ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
              <span className="text-[10px] text-slate-500 mt-1 block">
                Gross receivables across all disbursed cases
              </span>
            </div>

            <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-xl shadow-lg">
              <span className="text-[11px] text-emerald-400 block uppercase tracking-wider">
                Total Collected / Reconciled
              </span>
              <span className="text-xl font-bold text-emerald-400 mt-1 block">
                ₹{(report.total_received ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
              <span className="text-[10px] text-slate-500 mt-1 block">
                Credits matched through statement ingestion
              </span>
            </div>

            <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-xl shadow-lg">
              <span className="text-[11px] text-amber-400 block uppercase tracking-wider">
                Total Outstanding Receivables
              </span>
              <span className="text-xl font-bold text-amber-400 mt-1 block">
                ₹{(report.total_outstanding ?? (report as any).total_outstanding_net ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
              <span className="text-[10px] text-slate-500 mt-1 block">
                Uncollected payout due from lenders
              </span>
            </div>
          </div>

          {/* Ageing Breakdown Table */}
          <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-900/60 shadow-lg">
            <div className="px-5 py-3 border-b border-slate-800 bg-slate-950/70 flex justify-between items-center">
              <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider">
                Lender-Wise Receivables &amp; Ageing Ledger
              </h3>
              <span className="text-[10px] text-slate-400 font-mono">
                {(report.lenders || []).length} Active Lenders
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-950/90 text-[11px] text-slate-400 font-mono">
                    <th className="py-2.5 px-4">Lender Name</th>
                    <th className="py-2.5 px-4 text-right">Expected</th>
                    <th className="py-2.5 px-4 text-right">Received</th>
                    <th className="py-2.5 px-4 text-right">Outstanding</th>
                    <th className="py-2.5 px-4 text-right">Pending Cases</th>
                    <th className="py-2.5 px-4 text-right bg-slate-950/40">0–30 Days</th>
                    <th className="py-2.5 px-4 text-right bg-slate-950/40">31–60 Days</th>
                    <th className="py-2.5 px-4 text-right bg-slate-950/40">61–90 Days</th>
                    <th className="py-2.5 px-4 text-right bg-rose-950/20 text-rose-300">90+ Days</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {(report.lenders || []).map((l) => (
                    <tr key={l.lender_id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="py-2.5 px-4 font-semibold text-slate-200">{l.lender_name}</td>
                      <td className="py-2.5 px-4 text-right text-slate-300">
                        ₹{(l.total_expected ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-2.5 px-4 text-right text-emerald-400 font-medium">
                        ₹{(l.total_received ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-2.5 px-4 text-right font-bold text-amber-400">
                        ₹{(l.total_outstanding ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-2.5 px-4 text-right text-slate-400">
                        {l.pending_cases_count ?? 0}
                      </td>
                      <td className="py-2.5 px-4 text-right text-slate-300 bg-slate-950/20">
                        ₹{(l.ageing_0_30 ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-2.5 px-4 text-right text-slate-300 bg-slate-950/20">
                        ₹{(l.ageing_31_60 ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-2.5 px-4 text-right text-amber-400 bg-slate-950/20">
                        ₹{(l.ageing_61_90 ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-2.5 px-4 text-right font-bold text-rose-400 bg-rose-950/10">
                        ₹{(l.ageing_90_plus ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
