import { useState, useRef, ChangeEvent } from 'react'
import Button from '../../shared/components/Button'
import { JAI_MOCK_CASES } from '../../shared/lib/mockDatabase'
import { formatINR } from '../../shared/lib/formatters'
import './LeadImportModal.css'

interface LeadImportModalProps {
  isOpen: boolean
  onClose: () => void
  onImportComplete: (importedCount: number) => void
}

interface ParsedLeadRow {
  rowNumber: number
  applicant_name: string
  mobile: string
  product_type: string
  loan_amount_requested: number
  city: string
  state: string
  pincode: string
  vehicle_reg_no?: string
  source_name: string
  isValid: boolean
  isDuplicate: boolean
  errorMessage?: string
}

const SAMPLE_CSV = `applicant_name,mobile,product_type,loan_amount_requested,city,state,pincode,vehicle_reg_no,source_name
Sunil Verma,9820011223,used_car,650000,Mumbai,Maharashtra,400053,MH02EJ4455,Cold Calling Q1
Meena Sundaram,9821199887,new_car,1200000,Pune,Maharashtra,411001,,Walk-in Campaign
Ravi Teja,9844055667,commercial_vehicle,850000,Nagpur,Maharashtra,440001,MH31AB9988,Database Telecalling
Deepak Jadhav,9899011234,refinance,450000,Thane,Maharashtra,400601,MH04CD1212,Direct Outreach`

export function LeadImportModal({ isOpen, onClose, onImportComplete }: LeadImportModalProps) {
  const [file, setFile] = useState<File | null>(null)
  const [parsedRows, setParsedRows] = useState<ParsedLeadRow[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [importSummary, setImportSummary] = useState<{ total: number; valid: number; invalid: number; duplicates: number } | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  if (!isOpen) return null

  const handleDownloadTemplate = () => {
    const blob = new Blob([SAMPLE_CSV], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', 'DSA_OS_Leads_Import_Template.csv')
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const parseCsvText = (text: string) => {
    const lines = text.split(/\r\n|\n/).filter((l) => l.trim().length > 0)
    if (lines.length < 2) {
      alert('The uploaded file contains no data rows.')
      return
    }

    const headers = lines[0].split(',').map((h) => h.trim().toLowerCase().replace(/['"]/g, ''))
    const existingMobiles = new Set(JAI_MOCK_CASES.map((c) => c.primary_applicant_mobile || c.mobile))
    const seenFileMobiles = new Set<string>()

    const rows: ParsedLeadRow[] = []
    let validCount = 0
    let invalidCount = 0
    let dupCount = 0

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map((v) => v.trim().replace(/^["']|["']$/g, ''))
      const getVal = (colNames: string[]) => {
        for (const col of colNames) {
          const idx = headers.findIndex((h) => h.includes(col))
          if (idx !== -1 && values[idx]) return values[idx]
        }
        return ''
      }

      const applicantName = getVal(['name', 'applicant', 'customer', 'borrower'])
      const rawMobile = getVal(['mobile', 'phone', 'contact'])
      const cleanMobile = rawMobile.replace(/\D/g, '').slice(-10)
      const productType = getVal(['product', 'loan_type', 'type']) || 'used_car'
      const rawAmount = getVal(['amount', 'loan_amount', 'requested'])
      const loanAmount = Number(rawAmount.replace(/[^0-9.]/g, '')) || 0
      const city = getVal(['city']) || 'Mumbai'
      const state = getVal(['state']) || 'Maharashtra'
      const pincode = getVal(['pin', 'pincode', 'postal']) || '400001'
      const vehicleReg = getVal(['reg', 'vehicle', 'rc'])
      const sourceName = getVal(['source', 'channel', 'campaign']) || 'Bulk Excel Import'

      let isValid = true
      let isDuplicate = false
      let errorMessage = ''

      if (!applicantName) {
        isValid = false
        errorMessage = 'Applicant name is required'
      } else if (cleanMobile.length !== 10) {
        isValid = false
        errorMessage = `Invalid mobile (${rawMobile}). Must be 10 digits.`
      } else if (loanAmount <= 0) {
        isValid = false
        errorMessage = 'Loan amount must be greater than zero.'
      } else if (seenFileMobiles.has(cleanMobile)) {
        isDuplicate = true
        errorMessage = 'Duplicate phone number in this file.'
      } else if (existingMobiles.has(cleanMobile)) {
        isDuplicate = true
        errorMessage = 'Customer mobile already exists in lead database.'
      }

      if (cleanMobile.length === 10) {
        seenFileMobiles.add(cleanMobile)
      }

      if (isDuplicate) dupCount++
      if (isValid && !isDuplicate) validCount++
      if (!isValid) invalidCount++

      rows.push({
        rowNumber: i,
        applicant_name: applicantName || 'Unknown',
        mobile: cleanMobile || rawMobile,
        product_type: productType,
        loan_amount_requested: loanAmount,
        city,
        state,
        pincode,
        vehicle_reg_no: vehicleReg,
        source_name: sourceName,
        isValid,
        isDuplicate,
        errorMessage,
      })
    }

    setParsedRows(rows)
    setImportSummary({
      total: lines.length - 1,
      valid: validCount,
      invalid: invalidCount,
      duplicates: dupCount,
    })
  }

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selected = e.target.files[0]
      setFile(selected)
      const reader = new FileReader()
      reader.onload = (event) => {
        const text = event.target?.result as string
        parseCsvText(text)
      }
      reader.readAsText(selected)
    }
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragActive(false)
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const dropped = e.dataTransfer.files[0]
      setFile(dropped)
      const reader = new FileReader()
      reader.onload = (event) => {
        const text = event.target?.result as string
        parseCsvText(text)
      }
      reader.readAsText(dropped)
    }
  }

  const handleCommitImport = () => {
    const validLeads = parsedRows.filter((r) => r.isValid && !r.isDuplicate)
    if (validLeads.length === 0) {
      alert('There are no valid, non-duplicate leads ready for import.')
      return
    }

    setIsProcessing(true)

    try {
      validLeads.forEach((lead) => {
        const newCase: any = {
          id: `case-bulk-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
          case_no: `JA-2025-${Math.floor(1000 + Math.random() * 9000)}`,
          applicant_name: lead.applicant_name,
          primary_applicant_name: lead.applicant_name,
          mobile: lead.mobile,
          primary_applicant_mobile: lead.mobile,
          product: lead.product_type,
          product_type: lead.product_type,
          status: 'lead',
          applied_loan_amount: lead.loan_amount_requested,
          loan_amount_requested: lead.loan_amount_requested,
          vehicle_summary: lead.vehicle_reg_no ? `Vehicle (${lead.vehicle_reg_no})` : 'Vehicle Loan Application',
          vehicle_details: lead.vehicle_reg_no ? `Vehicle (${lead.vehicle_reg_no})` : 'Vehicle Loan Application',
          source_name: lead.source_name,
          owner_name: 'Aarav Sharma',
          call_outcome: 'new',
          call_attempts_count: 0,
          has_consent: true,
          age_in_days: 0,
          version: 1,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          primary_party: {
            id: `p-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            name: lead.applicant_name,
            mobile_primary: lead.mobile,
            city: lead.city,
          },
        }
        JAI_MOCK_CASES.unshift(newCase)
      })

      setIsProcessing(false)
      onImportComplete(validLeads.length)
      onClose()
    } catch {
      setIsProcessing(false)
      alert('Failed to import leads. Please verify formatting.')
    }
  }

  return (
    <div className="lead-import-backdrop" onClick={onClose}>
      <div className="lead-import-modal" onClick={(e) => e.stopPropagation()}>
        <div className="lead-import-header">
          <div>
            <h2 className="type-h2">Bulk Cold Lead Excel / CSV Import</h2>
            <p className="type-body-sm text-muted">
              Upload spreadsheets, validate applicant columns, detect duplicates, and preview rows before importing.
            </p>
          </div>
          <button className="lead-import-close-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="lead-import-body">
          {/* Top Actions: Template Download & File Picker */}
          <div className="lead-import-actions-bar">
            <Button variant="secondary" onClick={handleDownloadTemplate}>
              📥 Download Excel/CSV Template
            </Button>
            <span className="type-body-xs text-muted">Format: 9 standard columns with phone and pincode validation</span>
          </div>

          {/* Drag & Drop Zone */}
          <div
            className={`lead-import-dropzone ${dragActive ? 'is-dragover' : ''} ${file ? 'has-file' : ''}`}
            onDragOver={(e) => {
              e.preventDefault()
              setDragActive(true)
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls,text/csv"
              style={{ display: 'none' }}
              onChange={handleFileChange}
            />
            <div className="dropzone-content">
              <span className="dropzone-icon">📊</span>
              {file ? (
                <div>
                  <p className="type-title-sm">{file.name}</p>
                  <p className="type-body-xs text-muted">{(file.size / 1024).toFixed(1)} KB — Click or drop to replace</p>
                </div>
              ) : (
                <div>
                  <p className="type-title-sm">Click to browse or drag & drop CSV file here</p>
                  <p className="type-body-xs text-muted">Supports CSV, TSV with headers. Max 5,000 rows per batch.</p>
                </div>
              )}
            </div>
          </div>

          {/* Validation Summary Metrics */}
          {importSummary && (
            <div className="lead-import-metrics">
              <div className="metric-pill metric-total">
                <span className="metric-num">{importSummary.total}</span>
                <span className="metric-lbl">Total Rows</span>
              </div>
              <div className="metric-pill metric-valid">
                <span className="metric-num">{importSummary.valid}</span>
                <span className="metric-lbl">Ready to Import</span>
              </div>
              <div className="metric-pill metric-duplicates">
                <span className="metric-num">{importSummary.duplicates}</span>
                <span className="metric-lbl">Duplicates Detected</span>
              </div>
              <div className="metric-pill metric-invalid">
                <span className="metric-num">{importSummary.invalid}</span>
                <span className="metric-lbl">Invalid Rows</span>
              </div>
            </div>
          )}

          {/* Preview Table */}
          {parsedRows.length > 0 && (
            <div className="lead-import-preview-container">
              <div className="preview-table-header">
                <span className="type-title-xs">Row-Level Validation Preview</span>
                <span className="type-body-xs text-muted">Showing {parsedRows.length} rows parsed</span>
              </div>
              <div className="preview-table-scroll">
                <table className="preview-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Status</th>
                      <th>Applicant Name</th>
                      <th>Mobile</th>
                      <th>Product</th>
                      <th>Amount</th>
                      <th>Location</th>
                      <th>Validation Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedRows.map((row) => (
                      <tr
                        key={row.rowNumber}
                        className={!row.isValid ? 'row-invalid' : row.isDuplicate ? 'row-duplicate' : 'row-valid'}
                      >
                        <td className="text-muted">{row.rowNumber}</td>
                        <td>
                          {!row.isValid ? (
                            <span className="preview-badge badge-err">Invalid</span>
                          ) : row.isDuplicate ? (
                            <span className="preview-badge badge-dup">Duplicate</span>
                          ) : (
                            <span className="preview-badge badge-ok">Ready</span>
                          )}
                        </td>
                        <td><strong>{row.applicant_name}</strong></td>
                        <td className="text-mono">{row.mobile}</td>
                        <td><span className="product-tag">{row.product_type}</span></td>
                        <td>{formatINR(row.loan_amount_requested)}</td>
                        <td>{row.city}, {row.pincode}</td>
                        <td>
                          {row.errorMessage ? (
                            <span className="preview-err-text">{row.errorMessage}</span>
                          ) : (
                            <span className="preview-ok-text">Valid format</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div className="lead-import-footer">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleCommitImport}
            disabled={!importSummary || importSummary.valid === 0 || isProcessing}
          >
            {isProcessing ? 'Importing...' : `Confirm Import (${importSummary?.valid || 0} Leads)`}
          </Button>
        </div>
      </div>
    </div>
  )
}
