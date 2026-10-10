/**
 * DSA OS — CaseListPage (Graphite Ledger Design System)
 * Workflow A: Admin-managed cold leads, bulk import, telecaller assignment.
 */

import { useState, useEffect, useCallback, FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, ApiError } from '../../shared/lib/api'
import { formatINR } from '../../shared/lib/formatters'
import Button from '../../shared/components/Button'
import Input from '../../shared/components/Input'
import StatusChip from '../../shared/components/StatusChip'
import { SLAIndicator } from '../workflow/SLAIndicator'
import { CaseCreateModal } from './CaseCreateModal'
import { LeadImportModal } from './LeadImportModal'
import { usePermission } from '../auth/usePermission'
import { useAuthStore } from '../auth/useAuth'
import { PERMISSIONS } from '../auth/types'
import type { CaseDetail, CaseListItem } from './types'
import './CaseListPage.css'

interface PaginationMeta {
  total: number
  page: number
  page_size: number
  has_next: boolean
  has_prev: boolean
}

export function CaseListPage() {
  const navigate = useNavigate()
  const { can } = usePermission()
  const user = useAuthStore((s) => s.user)
  const isTelecaller = user?.role === 'telecaller'
  const [cases, setCases] = useState<CaseListItem[]>([])
  const [meta, setMeta] = useState<PaginationMeta | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)

  // Bulk Selection & Telecaller Assignment
  const [selectedCaseIds, setSelectedCaseIds] = useState<string[]>([])
  const [assignTelecallerId, setAssignTelecallerId] = useState('usr-telecaller-1')
  const [isAssigning, setIsAssigning] = useState(false)
  const [assignSuccessMsg, setAssignSuccessMsg] = useState('')

  // Filters
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [productFilter, setProductFilter] = useState<string>('')
  const [telecallerFilter, setTelecallerFilter] = useState<string>('')
  const [outcomeFilter, setOutcomeFilter] = useState<string>('')
  const [page, setPage] = useState(1)

  const loadCases = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      params.set('page', String(page))
      params.set('page_size', '30')
      if (search.trim()) params.set('search', search.trim())
      if (statusFilter) params.set('status', statusFilter)
      if (productFilter) params.set('product_type', productFilter)

      const res = await api.getWithEnvelope<CaseListItem[]>(`/cases?${params.toString()}`)
      let list = res.data || []
      if (telecallerFilter) {
        list = list.filter((c: any) =>
          telecallerFilter === 'unassigned'
            ? !c.assigned_telecaller_id && !c.assigned_telecaller_name
            : c.assigned_telecaller_id === telecallerFilter || c.assigned_telecaller_name?.includes(telecallerFilter)
        )
      }
      if (outcomeFilter) {
        list = list.filter((c: any) => c.call_outcome === outcomeFilter)
      }
      setCases(list)
      setMeta(res.meta as unknown as PaginationMeta)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to query loan cases')
    } finally {
      setIsLoading(false)
    }
  }, [page, search, statusFilter, productFilter, telecallerFilter, outcomeFilter])

  useEffect(() => {
    loadCases()
  }, [loadCases])

  const handleFilterSubmit = (e: FormEvent) => {
    e.preventDefault()
    setPage(1)
    loadCases()
  }

  const handleResetFilters = () => {
    setSearch('')
    setStatusFilter('')
    setProductFilter('')
    setTelecallerFilter('')
    setOutcomeFilter('')
    setPage(1)
  }

  const handleCaseCreated = (createdCase: CaseDetail) => {
    setShowCreateModal(false)
    if (createdCase?.id) {
      navigate(`/cases/${createdCase.id}`)
    } else {
      loadCases()
    }
  }

  // Row selection
  const handleToggleSelectAll = () => {
    if (selectedCaseIds.length === cases.length) {
      setSelectedCaseIds([])
    } else {
      setSelectedCaseIds(cases.map((c) => c.id))
    }
  }

  const handleToggleSelectRow = (id: string) => {
    setSelectedCaseIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    )
  }

  // Bulk Assignment Handler
  const handleBulkAssign = async () => {
    if (selectedCaseIds.length === 0) return
    setIsAssigning(true)
    try {
      await api.post('/cases/assign', {
        case_ids: selectedCaseIds,
        telecaller_id: assignTelecallerId,
      })
      const tcName = assignTelecallerId === 'usr-telecaller-2' ? 'Rahul Verma' : 'Priya Sharma'
      setCases((prev) =>
        prev.map((c) =>
          selectedCaseIds.includes(c.id)
            ? { ...c, assigned_telecaller_id: assignTelecallerId, assigned_telecaller_name: tcName }
            : c
        )
      )
      setAssignSuccessMsg(`Successfully assigned ${selectedCaseIds.length} lead(s) to ${tcName}.`)
      setSelectedCaseIds([])
      setTimeout(() => setAssignSuccessMsg(''), 4000)
    } catch {
      alert('Failed to assign leads. Please retry.')
    } finally {
      setIsAssigning(false)
    }
  }

  const handleImportComplete = (count: number) => {
    setAssignSuccessMsg(`Successfully imported ${count} cold leads from Excel/CSV file!`)
    loadCases()
    setTimeout(() => setAssignSuccessMsg(''), 4000)
  }

  // Volume summary
  const totalVolumeRequested = cases.reduce((acc, c) => acc + (c.loan_amount_requested || 0), 0)

  return (
    <div className="cases-page">
      <div className="cases-header">
        <div>
          <h1 className="type-h1">{isTelecaller ? 'My Assigned Leads Desk' : 'Cold Leads & Active Files'}</h1>
          <p className="type-body-md" style={{ color: 'var(--color-text-secondary)' }}>
            {isTelecaller
              ? 'Review, call, and update outcomes for borrower leads assigned to your telecalling queue.'
              : 'Admin lead desk, Excel bulk ingestion, telecaller assignments, and pipeline tracking.'}
          </p>
        </div>
        {!isTelecaller && (
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <Button variant="secondary" onClick={() => setShowImportModal(true)}>
              📥 Bulk Excel Import
            </Button>
            {can(PERMISSIONS.CASES_CREATE) && (
              <>
                <Button variant="outline" onClick={() => setShowCreateModal(true)}>
                  ⚡ Quick Intake
                </Button>
                <Button variant="primary" onClick={() => navigate('/cases/new')}>
                  + New Lead Workspace →
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      {assignSuccessMsg && (
        <div className="cases-success-alert" style={{ background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.3)', color: '#34d399', padding: '0.75rem 1rem', borderRadius: 6 }}>
          ✓ {assignSuccessMsg}
        </div>
      )}

      {error && <div className="cases-error-alert">{error}</div>}

      {/* Bulk Assignment Action Bar (Admin only) */}
      {!isTelecaller && selectedCaseIds.length > 0 && (
        <div className="bulk-assign-bar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(30, 41, 59, 0.95)', border: '1px solid #3b82f6', padding: '0.75rem 1.25rem', borderRadius: 8, gap: '1rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontWeight: 600, color: '#60a5fa' }}>{selectedCaseIds.length} lead(s) selected</span>
            <button
              type="button"
              onClick={() => setSelectedCaseIds([])}
              style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '0.8125rem', textDecoration: 'underline' }}
            >
              Clear selection
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontSize: '0.875rem', color: '#cbd5e1' }}>Assign to Telecaller:</span>
            <select
              value={assignTelecallerId}
              onChange={(e) => setAssignTelecallerId(e.target.value)}
              className="cases-filter-select"
              style={{ minWidth: 180 }}
            >
              <option value="usr-telecaller-1">Priya Sharma (Telecaller Desk 1)</option>
              <option value="usr-telecaller-2">Rahul Verma (Sr. Telecaller)</option>
            </select>
            <Button
              variant="primary"
              size="sm"
              onClick={handleBulkAssign}
              disabled={isAssigning}
            >
              {isAssigning ? 'Assigning...' : `Assign ${selectedCaseIds.length} Leads`}
            </Button>
          </div>
        </div>
      )}

      {/* Filter Bar */}
      <form onSubmit={handleFilterSubmit} className="cases-filter-bar">
        <div className="cases-search-wrap">
          <Input
            id="case-search"
            placeholder="Search by Case No, Applicant, Mobile, or Vehicle Reg..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {!isTelecaller && (
          <select
            className="cases-filter-select"
            value={telecallerFilter}
            onChange={(e) => {
              setTelecallerFilter(e.target.value)
              setPage(1)
            }}
          >
            <option value="">All Telecallers</option>
            <option value="Priya Sharma">Priya Sharma</option>
            <option value="Rahul Verma">Rahul Verma</option>
            <option value="unassigned">Unassigned Leads</option>
          </select>
        )}

        <select
          className="cases-filter-select"
          value={outcomeFilter}
          onChange={(e) => {
            setOutcomeFilter(e.target.value)
            setPage(1)
          }}
        >
          <option value="">All Call Outcomes</option>
          <option value="new">New Lead</option>
          <option value="interested">Interested</option>
          <option value="follow_up">Follow-up Due</option>
          <option value="not_reachable">Not Reachable</option>
          <option value="not_interested">Not Interested</option>
          <option value="duplicate">Duplicate File</option>
        </select>

        <select
          className="cases-filter-select"
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value)
            setPage(1)
          }}
        >
          <option value="">All Statuses</option>
          <option value="lead">Lead</option>
          <option value="lead_qualified">Qualified</option>
          <option value="docs_in_progress">Docs Pending</option>
          <option value="docs_collected">Docs Collected</option>
          <option value="file_logged_in">Logged In</option>
          <option value="in_review_lender">In Review</option>
          <option value="queries_raised">Query Raised</option>
          <option value="sanctioned">Sanctioned</option>
          <option value="disbursed">Disbursed</option>
          <option value="closed">Closed</option>
          <option value="rejected">Rejected</option>
        </select>

        <select
          className="cases-filter-select"
          value={productFilter}
          onChange={(e) => {
            setProductFilter(e.target.value)
            setPage(1)
          }}
        >
          <option value="">All Products</option>
          <option value="used_car">Used Car</option>
          <option value="new_car">New Car</option>
          <option value="commercial_vehicle">Commercial Vehicle</option>
          <option value="two_wheeler">Two Wheeler</option>
          <option value="refinance">Refinance</option>
          <option value="top_up">Top-Up</option>
        </select>

        <Button type="submit" variant="primary" size="md">
          Filter
        </Button>
        {(search || statusFilter || productFilter || telecallerFilter || outcomeFilter) && (
          <Button type="button" variant="ghost" size="md" onClick={handleResetFilters}>
            Reset
          </Button>
        )}
      </form>

      {/* Financial Pipeline Snapshot */}
      <div className="cases-summary-bar">
        <div className="summary-item">
          <span className="summary-label">Pipeline Leads:</span>
          <span className="summary-value type-mono-sm">{meta ? meta.total : cases.length}</span>
        </div>
        <div className="summary-item">
          <span className="summary-label">Active Request Volume:</span>
          <span className="summary-value type-mono-sm" style={{ color: 'var(--color-primary)' }}>
            {formatINR(totalVolumeRequested)}
          </span>
        </div>
      </div>

      {/* Cases Table */}
      {isLoading ? (
        <div className="cases-loading">Fetching operations pipeline...</div>
      ) : cases.length === 0 ? (
        <div className="cases-empty">
          <h3>No loan leads match the criteria</h3>
          <p>{isTelecaller ? 'No leads are currently assigned to your desk queue.' : 'Import leads from Excel or create a new lead entry.'}</p>
          {!isTelecaller && (
            <Button variant="primary" style={{ marginTop: 12 }} onClick={() => setShowImportModal(true)}>
              📥 Bulk Excel Import
            </Button>
          )}
        </div>
      ) : (
        <div className="cases-table-wrap">
          <table className="cases-table">
            <thead>
              <tr>
                {!isTelecaller && (
                  <th style={{ width: 40 }}>
                    <input
                      type="checkbox"
                      checked={cases.length > 0 && selectedCaseIds.length === cases.length}
                      onChange={handleToggleSelectAll}
                      aria-label="Select all"
                    />
                  </th>
                )}
                <th>Case No</th>
                <th>Primary Applicant</th>
                <th>Product</th>
                <th style={{ textAlign: 'right' }}>Loan Requested</th>
                <th>Telecaller & Outcome</th>
                <th>Channel / Referral</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Age</th>
              </tr>
            </thead>
            <tbody>
              {cases.map((c) => (
                <tr key={c.id} className={selectedCaseIds.includes(c.id) ? 'row-selected' : ''}>
                  {!isTelecaller && (
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedCaseIds.includes(c.id)}
                        onChange={() => handleToggleSelectRow(c.id)}
                        aria-label={`Select ${c.case_no}`}
                      />
                    </td>
                  )}
                  <td>
                    <Link to={`/cases/${c.id}`} className="case-no-link type-mono-sm">
                      {c.case_no}
                    </Link>
                  </td>
                  <td>
                    <div className="applicant-cell">
                      <div className="applicant-name">{c.primary_applicant_name}</div>
                      <div className="applicant-mobile type-mono-xs">
                        {c.primary_applicant_mobile}
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className="type-body-xs product-tag">
                      {c.product_type.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <span className="type-mono-sm font-semibold">
                      {formatINR(c.loan_amount_requested)}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: c.assigned_telecaller_name ? '#0F172A' : '#64748B' }}>
                        {c.assigned_telecaller_name ? `👤 ${c.assigned_telecaller_name}` : 'Unassigned'}
                      </span>
                      {c.call_outcome && (
                        <span style={{ fontSize: '0.7rem', fontWeight: 700, color: c.call_outcome === 'interested' ? '#047857' : c.call_outcome === 'follow_up' ? '#B45309' : '#64748B', textTransform: 'uppercase' }}>
                          ● {c.call_outcome.replace(/_/g, ' ')}
                        </span>
                      )}
                    </div>
                  </td>
                  <td>
                    <span className="type-body-xs">
                      {c.referral_partner_name ? `🤝 ${c.referral_partner_name}` : c.source_name}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
                      <StatusChip status={c.status} />
                      {c.sla && <SLAIndicator sla={c.sla} compact />}
                    </div>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <span className="type-mono-xs" style={{ color: c.age_in_days > 14 ? 'var(--color-danger)' : 'inherit' }}>
                      {c.age_in_days}d
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {meta && (
            <div className="cases-pagination">
              <span className="type-mono-sm" style={{ color: 'var(--color-text-secondary)' }}>
                Showing {(meta.page - 1) * meta.page_size + 1}–
                {Math.min(meta.page * meta.page_size, meta.total)} of {meta.total} cases
              </span>
              <div className="cases-pagination-btns">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={!meta.has_prev}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={!meta.has_next}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Manual Quick Intake Modal */}
      <CaseCreateModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreated={handleCaseCreated}
      />

      {/* Excel Bulk Lead Ingestion Modal */}
      <LeadImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onImportComplete={handleImportComplete}
      />
    </div>
  )
}

