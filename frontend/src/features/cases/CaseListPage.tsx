/**
 * DSA OS — CaseListPage (Graphite Ledger Design System)
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
import { usePermission } from '../auth/usePermission'
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
  const [cases, setCases] = useState<CaseListItem[]>([])
  const [meta, setMeta] = useState<PaginationMeta | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)

  // Filters
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [productFilter, setProductFilter] = useState<string>('')
  const [page, setPage] = useState(1)

  const loadCases = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      params.set('page', String(page))
      params.set('page_size', '20')
      if (search.trim()) params.set('search', search.trim())
      if (statusFilter) params.set('status', statusFilter)
      if (productFilter) params.set('product_type', productFilter)

      const res = await api.getWithEnvelope<CaseListItem[]>(`/cases?${params.toString()}`)
      setCases(res.data)
      setMeta(res.meta as unknown as PaginationMeta)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to query loan cases')
    } finally {
      setIsLoading(false)
    }
  }, [page, search, statusFilter, productFilter])

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

  // Calculate volume summary for current page
  const totalVolumeRequested = cases.reduce((acc, c) => acc + (c.loan_amount_requested || 0), 0)

  return (
    <div className="cases-page">
      <div className="cases-header">
        <div>
          <h1 className="type-h1">Active Loan Files</h1>
          <p className="type-body-md" style={{ color: 'var(--color-text-secondary)' }}>
            Pipeline operations, lender submissions, and status progression.
          </p>
        </div>
        {can(PERMISSIONS.CASES_CREATE) && (
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button variant="outline" onClick={() => setShowCreateModal(true)}>
              ⚡ Quick Intake
            </Button>
            <Button variant="primary" onClick={() => navigate('/cases/new')}>
              + New Case Workspace →
            </Button>
          </div>
        )}
      </div>

      {error && <div className="cases-error-alert">{error}</div>}

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
          <option value="pdd_pending">PDD Pending</option>
          <option value="pdd_completed">PDD Complete</option>
          <option value="closed">Closed</option>
          <option value="rejected">Rejected</option>
          <option value="withdrawn">Withdrawn</option>
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
          <option value="balance_transfer">Balance Transfer</option>
        </select>

        <Button type="submit" variant="primary" size="md">
          Filter
        </Button>
        {(search || statusFilter || productFilter) && (
          <Button type="button" variant="ghost" size="md" onClick={handleResetFilters}>
            Reset
          </Button>
        )}
      </form>

      {/* Financial Pipeline Snapshot */}
      <div className="cases-summary-bar">
        <div className="summary-item">
          <span className="summary-label">Pipeline Files:</span>
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
          <h3>No loan cases match the criteria</h3>
          <p>Create a new loan file or modify your filter settings.</p>
          <Button variant="primary" style={{ marginTop: 12 }} onClick={() => setShowCreateModal(true)}>
            + Start New Case Intake
          </Button>
        </div>
      ) : (
        <div className="cases-table-wrap">
          <table className="cases-table">
            <thead>
              <tr>
                <th>Case No</th>
                <th>Primary Applicant</th>
                <th>Vehicle Asset</th>
                <th>Product</th>
                <th style={{ textAlign: 'right' }}>Loan Requested</th>
                <th>Status</th>
                <th>Source</th>
                <th>Owner</th>
                <th style={{ textAlign: 'right' }}>Age</th>
              </tr>
            </thead>
            <tbody>
              {cases.map((c) => (
                <tr key={c.id}>
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
                    <span className="type-body-sm">{c.vehicle_summary}</span>
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
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
                      <StatusChip status={c.status} />
                      {c.sla && <SLAIndicator sla={c.sla} compact />}
                    </div>
                  </td>
                  <td>
                    <span className="type-body-xs">{c.source_name}</span>
                  </td>
                  <td>
                    <span className="type-body-xs">{c.owner_name}</span>
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

      {/* Intake Modal */}
      <CaseCreateModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreated={handleCaseCreated}
      />
    </div>
  )
}
