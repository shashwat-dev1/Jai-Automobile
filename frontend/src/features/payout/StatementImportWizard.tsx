import React, { useEffect, useState } from 'react'
import { api } from '../../shared/lib/api'
import type {
  DryRunReportResponse,
  ImportBatch,
  StatementColumnMapping,
} from './types'

interface LenderOption {
  id: string
  name: string
}

interface StatementImportWizardProps {
  onClose: () => void
  onImportComplete: (batch: ImportBatch) => void
}

export const StatementImportWizard: React.FC<StatementImportWizardProps> = ({
  onClose,
  onImportComplete,
}) => {
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [lenders, setLenders] = useState<LenderOption[]>([])
  const [selectedLenderId, setSelectedLenderId] = useState<string>('')
  const [filename, setFilename] = useState<string>('lender_statement.csv')
  const [csvContent, setCsvContent] = useState<string>('')
  const [tolerance, setTolerance] = useState<number>(10)

  // Column mappings
  const [detectedHeaders, setDetectedHeaders] = useState<string[]>([])
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({
    loan_account_no: '',
    customer_name: '',
    received_amount: '',
    tds_amount: '',
    payment_date: '',
    utr_reference: '',
  })
  const [saveMappingName, setSaveMappingName] = useState<string>('')

  // Dry run result
  const [dryRunReport, setDryRunReport] = useState<DryRunReportResponse | null>(null)
  const [committedBatch, setCommittedBatch] = useState<ImportBatch | null>(null)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load lenders
  useEffect(() => {
    async function loadLenders() {
      try {
        const res = await api.get<LenderOption[]>('/lenders')
        setLenders(res || [])
        if (res && res.length > 0) {
          setSelectedLenderId(res[0].id)
        }
      } catch (err) {
        console.error('Failed to load lenders:', err)
      }
    }
    loadLenders()
  }, [])

  // When lender changes, load saved column mappings if available
  useEffect(() => {
    if (!selectedLenderId) return
    async function loadMappings() {
      try {
        const mappings = await api.get<StatementColumnMapping[]>(
          `/payout/reconciliation/column-mappings/${selectedLenderId}`
        )
        if (mappings && mappings.length > 0) {
          const defaultMap = mappings.find((m) => m.is_default) || mappings[0]
          setColumnMapping((prev) => ({ ...prev, ...defaultMap.mappings }))
          setSaveMappingName(defaultMap.mapping_name)
        }
      } catch (err) {
        console.warn('No saved column mapping found for lender:', err)
      }
    }
    loadMappings()
  }, [selectedLenderId])

  // Parse headers whenever csvContent changes
  const handleCsvChange = (content: string) => {
    setCsvContent(content)
    const firstLine = content.trim().split('\n')[0]
    if (firstLine) {
      const headers = firstLine.split(',').map((h) => h.trim().replace(/^["']|["']$/g, ''))
      setDetectedHeaders(headers)

      // Auto-assign matching headers
      setColumnMapping((prev) => {
        const next = { ...prev }
        headers.forEach((h) => {
          const lower = h.toLowerCase()
          if (!next.loan_account_no && (lower.includes('loan') || lower.includes('lan') || lower.includes('account'))) {
            next.loan_account_no = h
          } else if (!next.customer_name && (lower.includes('name') || lower.includes('customer') || lower.includes('borrower'))) {
            next.customer_name = h
          } else if (!next.received_amount && (lower.includes('amount') || lower.includes('payout') || lower.includes('gross') || lower.includes('commission'))) {
            next.received_amount = h
          } else if (!next.tds_amount && lower.includes('tds')) {
            next.tds_amount = h
          } else if (!next.payment_date && (lower.includes('date') || lower.includes('paid'))) {
            next.payment_date = h
          } else if (!next.utr_reference && (lower.includes('utr') || lower.includes('ref') || lower.includes('cheque'))) {
            next.utr_reference = h
          }
        })
        return next
      })
    }
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setFilename(file.name)
      const reader = new FileReader()
      reader.onload = (event) => {
        const text = event.target?.result as string
        handleCsvChange(text)
      }
      reader.readAsText(file)
    }
  }

  const handleDryRun = async () => {
    if (!selectedLenderId) {
      setError('Please select a lender.')
      return
    }
    if (!csvContent.trim()) {
      setError('Please provide CSV statement content.')
      return
    }
    if (!columnMapping.received_amount || !columnMapping.payment_date) {
      setError('Please map at least Received Amount and Payment Date columns.')
      return
    }

    try {
      setLoading(true)
      setError(null)

      // Optionally save mapping
      if (saveMappingName.trim()) {
        try {
          await api.post('/payout/reconciliation/column-mappings', {
            lender_id: selectedLenderId,
            mapping_name: saveMappingName.trim(),
            mappings: columnMapping,
            is_default: true,
          })
        } catch (mErr) {
          console.warn('Could not save column mapping:', mErr)
        }
      }

      const report = await api.post<DryRunReportResponse>(
        '/payout/reconciliation/import/dry-run',
        {
          lender_id: selectedLenderId,
          filename,
          csv_content: csvContent,
          column_mapping: columnMapping,
          tolerance: Number(tolerance),
        }
      )
      setDryRunReport(report)
      setStep(2)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Dry run failed'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  const handleCommit = async () => {
    try {
      setLoading(true)
      setError(null)
      const batch = await api.post<ImportBatch>(
        '/payout/reconciliation/import/commit',
        {
          lender_id: selectedLenderId,
          filename,
          csv_content: csvContent,
          column_mapping: columnMapping,
          tolerance: Number(tolerance),
        }
      )
      setCommittedBatch(batch)
      onImportComplete(batch)
      setStep(3)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Batch commit failed'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700/80 rounded-xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden text-slate-200">
        {/* Header with Steps */}
        <div className="px-6 py-4 border-b border-slate-800 bg-slate-900/60 flex justify-between items-center">
          <div>
            <h2 className="text-base font-semibold text-slate-100">
              Lender Statement Ingestion Wizard
            </h2>
            <div className="flex items-center space-x-2 mt-1.5 text-xs font-mono">
              <span className={`px-2 py-0.5 rounded ${step === 1 ? 'bg-indigo-900 text-indigo-200 font-bold' : 'text-slate-400'}`}>
                1. Upload & Map
              </span>
              <span className="text-slate-600">&rarr;</span>
              <span className={`px-2 py-0.5 rounded ${step === 2 ? 'bg-indigo-900 text-indigo-200 font-bold' : 'text-slate-400'}`}>
                2. Dry Run Simulation
              </span>
              <span className="text-slate-600">&rarr;</span>
              <span className={`px-2 py-0.5 rounded ${step === 3 ? 'bg-indigo-900 text-indigo-200 font-bold' : 'text-slate-400'}`}>
                3. Committed
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 text-2xl font-bold p-1 rounded"
          >
            &times;
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="mb-4 p-3 bg-rose-950/50 border border-rose-800/80 text-rose-300 text-xs rounded-lg font-mono">
              {error}
            </div>
          )}

          {/* STEP 1: Upload & Mapping */}
          {step === 1 && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="text-xs font-medium text-slate-300 block mb-1">
                    Select Lender
                  </label>
                  <select
                    value={selectedLenderId}
                    onChange={(e) => setSelectedLenderId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                  >
                    {lenders.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-300 block mb-1">
                    Upload CSV File
                  </label>
                  <input
                    type="file"
                    accept=".csv,.txt"
                    onChange={handleFileUpload}
                    className="w-full text-xs text-slate-400 file:mr-2 file:py-1 file:px-2.5 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-slate-800 file:text-slate-200 hover:file:bg-slate-700 cursor-pointer"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-300 block mb-1">
                    Match Tolerance (₹)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={tolerance}
                    onChange={(e) => setTolerance(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
                  />
                </div>
              </div>

              {/* Paste CSV textarea if no file uploaded */}
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">
                  Or Paste Statement CSV Data
                </label>
                <textarea
                  rows={4}
                  value={csvContent}
                  onChange={(e) => handleCsvChange(e.target.value)}
                  placeholder="Loan ID,Borrower Name,Commission,TDS,Date,UTR&#10;LAN101,Rahul Sharma,15000,750,2026-09-15,UTR98765"
                  className="w-full bg-slate-950 border border-slate-800 rounded p-2.5 text-xs font-mono text-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>

              {/* Header Mapping Configuration */}
              {detectedHeaders.length > 0 && (
                <div className="bg-slate-950/60 border border-slate-800 rounded-lg p-4 space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                      Map CSV Columns to System Fields
                    </span>
                    <input
                      type="text"
                      placeholder="Save mapping format name (optional)"
                      value={saveMappingName}
                      onChange={(e) => setSaveMappingName(e.target.value)}
                      className="bg-slate-900 border border-slate-700 rounded px-2.5 py-1 text-xs text-slate-300 w-64"
                    />
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                    {[
                      { key: 'loan_account_no', label: 'Loan Account No / LAN' },
                      { key: 'customer_name', label: 'Customer / Borrower Name' },
                      { key: 'received_amount', label: 'Received / Gross Payout *' },
                      { key: 'tds_amount', label: 'TDS Deduction' },
                      { key: 'payment_date', label: 'Payment / Credit Date *' },
                      { key: 'utr_reference', label: 'UTR / Transaction Ref' },
                    ].map(({ key, label }) => (
                      <div key={key}>
                        <label className="text-[11px] text-slate-400 block mb-1 truncate">
                          {label}
                        </label>
                        <select
                          value={columnMapping[key] || ''}
                          onChange={(e) =>
                            setColumnMapping({ ...columnMapping, [key]: e.target.value })
                          }
                          className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
                        >
                          <option value="">-- Not Mapped --</option>
                          {detectedHeaders.map((h) => (
                            <option key={h} value={h}>
                              {h}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP 2: Dry Run Simulation Preview */}
          {step === 2 && dryRunReport && (
            <div className="space-y-4">
              {/* Summary KPIs */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 font-mono text-xs">
                <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                  <span className="text-[10px] text-slate-500 block uppercase">Total Rows</span>
                  <span className="text-slate-200 font-bold text-base">{dryRunReport.total_rows}</span>
                </div>
                <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                  <span className="text-[10px] text-emerald-500 block uppercase">Auto-Matched</span>
                  <span className="text-emerald-400 font-bold text-base">
                    {dryRunReport.potential_matched}
                  </span>
                </div>
                <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                  <span className="text-[10px] text-amber-500 block uppercase">Unmatched</span>
                  <span className="text-amber-400 font-bold text-base">
                    {dryRunReport.potential_unmatched}
                  </span>
                </div>
                <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                  <span className="text-[10px] text-rose-500 block uppercase">Errors</span>
                  <span className="text-rose-400 font-bold text-base">{dryRunReport.error_rows}</span>
                </div>
                <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                  <span className="text-[10px] text-slate-400 block uppercase">Total Amount</span>
                  <span className="text-slate-100 font-bold text-base">
                    ₹{(dryRunReport.total_amount ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              {/* Rows Table */}
              <div className="border border-slate-800 rounded-lg overflow-hidden max-h-72 overflow-y-auto bg-slate-950/40">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-950/80 text-[11px] text-slate-400 font-mono">
                      <th className="py-2 px-3">#</th>
                      <th className="py-2 px-3">Loan ID</th>
                      <th className="py-2 px-3">Customer</th>
                      <th className="py-2 px-3 text-right">Received</th>
                      <th className="py-2 px-3 text-right">Expected</th>
                      <th className="py-2 px-3 text-right">Variance</th>
                      <th className="py-2 px-3">Status</th>
                      <th className="py-2 px-3">Notes / Issues</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {dryRunReport.rows.map((row) => (
                      <tr key={row.row_index} className="hover:bg-slate-800/30">
                        <td className="py-2 px-3 text-slate-500">{row.row_index}</td>
                        <td className="py-2 px-3 text-slate-300">{row.loan_account_no || '—'}</td>
                        <td className="py-2 px-3 text-slate-300">{row.customer_name || '—'}</td>
                        <td className="py-2 px-3 text-right font-bold text-emerald-400">
                          ₹{(row.received_amount ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-2 px-3 text-right text-slate-300">
                          {row.expected_amount !== null && row.expected_amount !== undefined
                            ? `₹${(row.expected_amount ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
                            : '—'}
                        </td>
                        <td className="py-2 px-3 text-right">
                          {row.variance !== null && row.variance !== undefined ? (
                            <span
                              className={
                                row.variance === 0
                                  ? 'text-slate-400'
                                  : row.variance > 0
                                  ? 'text-indigo-400'
                                  : 'text-amber-400'
                              }
                            >
                              {row.variance > 0 ? '+' : ''}
                              ₹{(row.variance ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="py-2 px-3">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                              row.match_status === 'matched'
                                ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                : row.match_status === 'short'
                                ? 'bg-amber-950 text-amber-300 border border-amber-800'
                                : row.match_status === 'excess'
                                ? 'bg-indigo-950 text-indigo-300 border border-indigo-800'
                                : row.match_status === 'error'
                                ? 'bg-rose-950 text-rose-300 border border-rose-800'
                                : 'bg-slate-800 text-slate-400 border border-slate-700'
                            }`}
                          >
                            {row.match_status}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-[11px] text-slate-400">
                          {row.errors.length > 0 ? (
                            <span className="text-rose-400">{row.errors.join('; ')}</span>
                          ) : row.matched_case_no ? (
                            <span className="text-slate-300">Linked to {row.matched_case_no}</span>
                          ) : (
                            <span className="text-slate-500">Orphan (unmatched)</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* STEP 3: Committed Success */}
          {step === 3 && committedBatch && (
            <div className="py-8 text-center space-y-4">
              <div className="w-12 h-12 rounded-full bg-emerald-950 border border-emerald-800 text-emerald-400 flex items-center justify-center mx-auto text-xl font-bold">
                ✓
              </div>
              <h3 className="text-base font-semibold text-slate-100">
                Statement Batch Successfully Committed
              </h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Batch <span className="font-mono text-slate-300">{committedBatch.filename}</span> committed
                with {committedBatch.matched_rows} auto-matched records and {committedBatch.unmatched_rows} unmatched records.
              </p>

              <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-lg max-w-md mx-auto text-xs font-mono text-slate-300 text-left space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-500">Batch ID:</span>
                  <span className="truncate max-w-[200px]">{committedBatch.id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Total Received:</span>
                  <span className="text-emerald-400 font-bold">
                    ₹{(committedBatch.total_received_amount ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Reversal Window:</span>
                  <span className="text-amber-400">Active (24 hours remaining)</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-900/80 flex justify-between items-center">
          <div>
            {step === 2 && (
              <button
                type="button"
                onClick={() => setStep(1)}
                className="px-4 py-1.5 rounded-lg border border-slate-700 text-xs font-medium text-slate-300 hover:bg-slate-800 transition-colors"
              >
                &larr; Back to Mapping
              </button>
            )}
          </div>
          <div className="flex space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg border border-slate-700 text-xs font-medium text-slate-300 hover:bg-slate-800 transition-colors"
            >
              {step === 3 ? 'Done' : 'Cancel'}
            </button>
            {step === 1 && (
              <button
                type="button"
                onClick={handleDryRun}
                disabled={loading || !csvContent.trim()}
                className="px-5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-xs font-semibold text-white shadow-lg transition-colors"
              >
                {loading ? 'Simulating...' : 'Simulate Dry Run &rarr;'}
              </button>
            )}
            {step === 2 && (
              <button
                type="button"
                onClick={handleCommit}
                disabled={loading}
                className="px-5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-xs font-semibold text-white shadow-lg transition-colors"
              >
                {loading ? 'Committing...' : 'Commit Batch'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
