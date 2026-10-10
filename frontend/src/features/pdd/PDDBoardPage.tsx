import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { api, ApiError } from '../../shared/lib/api'
import Button from '../../shared/components/Button'
import { PDDCard } from './PDDCard'
import { PDDStatusModal } from './PDDStatusModal'
import type { PDDAgeingBucket, PDDBoardResponse, PDDItem, PDDStatus } from './types'
import './PDDBoardPage.css'

export const PDDBoardPage: React.FC = () => {
  const [boardData, setBoardData] = useState<PDDBoardResponse | null>(null)
  const [selectedBucket, setSelectedBucket] = useState<PDDAgeingBucket | 'all'>('all')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [lenderFilter, setLenderFilter] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Status update modal
  const [selectedItem, setSelectedItem] = useState<PDDItem | null>(null)
  const [targetStatus, setTargetStatus] = useState<PDDStatus | null>(null)
  const [showStatusModal, setShowStatusModal] = useState(false)

  const loadBoard = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (selectedBucket !== 'all') params.set('bucket', selectedBucket)
      if (statusFilter) params.set('status', statusFilter)
      const url = `/pdd${params.toString() ? `?${params.toString()}` : ''}`
      const data = await api.get<PDDBoardResponse>(url)
      setBoardData(data)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load PDD Board')
    } finally {
      setIsLoading(false)
    }
  }, [selectedBucket, statusFilter])

  useEffect(() => {
    loadBoard()
  }, [loadBoard])

  const handleOpenStatusModal = (item: PDDItem, status: PDDStatus) => {
    setSelectedItem(item)
    setTargetStatus(status)
    setShowStatusModal(true)
  }

  // Extract unique lenders for filter dropdown
  const uniqueLenders = useMemo(() => {
    if (!boardData?.items) return []
    const names = new Set<string>()
    boardData.items.forEach((item) => {
      if (item.lender_name) names.add(item.lender_name)
    })
    return Array.from(names).sort()
  }, [boardData])

  // Filter items in memory by search query and lender
  const filteredItems = useMemo(() => {
    if (!boardData?.items) return []
    return boardData.items.filter((item) => {
      if (lenderFilter && item.lender_name !== lenderFilter) return false
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim()
        const matchCase = item.case_no?.toLowerCase().includes(q)
        const matchCust = item.applicant_name?.toLowerCase().includes(q)
        const matchTitle = item.title.toLowerCase().includes(q)
        const matchLender = item.lender_name?.toLowerCase().includes(q)
        if (!matchCase && !matchCust && !matchTitle && !matchLender) return false
      }
      return true
    })
  }, [boardData, lenderFilter, searchQuery])

  const getPriorityBadge = (bucket: PDDAgeingBucket, isOverdue: boolean) => {
    if (bucket === '30_plus' || isOverdue) {
      return <span className="pdd-badge pdd-badge-critical">Critical / Risk</span>
    }
    if (bucket === '16_30') {
      return <span className="pdd-badge pdd-badge-high">High Priority</span>
    }
    if (bucket === '8_15') {
      return <span className="pdd-badge pdd-badge-amber">Medium</span>
    }
    return <span className="pdd-badge pdd-badge-fresh">Fresh</span>
  }

  const getStatusBadge = (status: PDDStatus) => {
    switch (status) {
      case 'acknowledged_by_lender':
        return <span className="pdd-status-chip pdd-status-acknowledged">✓ Acknowledged</span>
      case 'sent_to_lender':
        return <span className="pdd-status-chip pdd-status-sent">Bank In-Review</span>
      case 'collected':
        return <span className="pdd-status-chip pdd-status-collected">Ready for Dispatch</span>
      case 'rejected':
        return <span className="pdd-status-chip pdd-status-rejected">Discrepancy / Query</span>
      default:
        return <span className="pdd-status-chip pdd-status-pending">Pending Collection</span>
    }
  }

  return (
    <div className="pdd-board-page">
      {/* Page Header */}
      <div className="pdd-board-header">
        <div>
          <div className="pdd-header-pretitle">POST-DISBURSAL COMPLIANCE</div>
          <h1 className="pdd-page-title">Post-Disbursal Documents (PDD) Operational Board</h1>
          <p className="pdd-page-subtitle">
            Track and resolve RTO RC Hypothecation, Insurance Endorsement, and Invoice deliverables to prevent lender commission clawbacks.
          </p>
        </div>
        <div className="pdd-header-actions">
          <Link to="/cases?status=disbursed">
            <Button variant="secondary" size="sm">
              View Disbursed Cases
            </Button>
          </Link>
          <Button variant="secondary" size="sm" onClick={loadBoard} loading={isLoading}>
            Refresh Board
          </Button>
        </div>
      </div>

      {/* KPI Ageing Summary Strip */}
      <div className="pdd-metrics-grid">
        <div
          className={`pdd-metric-card ${selectedBucket === 'all' ? 'is-selected' : ''}`}
          onClick={() => setSelectedBucket('all')}
        >
          <div className="pdd-metric-header">
            <span className="pdd-metric-label">Active PDD Pool</span>
            <span className="pdd-metric-pill">All</span>
          </div>
          <div className="pdd-metric-val">{boardData ? boardData.total_pending : 0}</div>
          <div className="pdd-metric-sub">Pending bank closure</div>
        </div>

        <div
          className={`pdd-metric-card pdd-card-fresh ${selectedBucket === '0_7' ? 'is-selected' : ''}`}
          onClick={() => setSelectedBucket('0_7')}
        >
          <div className="pdd-metric-header">
            <span className="pdd-metric-label">Fresh (0–7 Days)</span>
            <span className="pdd-metric-pill pdd-pill-fresh">Fresh</span>
          </div>
          <div className="pdd-metric-val">{boardData ? boardData.bucket_0_7_count : 0}</div>
          <div className="pdd-metric-sub">Invoice & delivery challan</div>
        </div>

        <div
          className={`pdd-metric-card pdd-card-amber ${selectedBucket === '8_15' ? 'is-selected' : ''}`}
          onClick={() => setSelectedBucket('8_15')}
        >
          <div className="pdd-metric-header">
            <span className="pdd-metric-label">Ageing (8–15 Days)</span>
            <span className="pdd-metric-pill pdd-pill-amber">Attention</span>
          </div>
          <div className="pdd-metric-val">{boardData ? boardData.bucket_8_15_count : 0}</div>
          <div className="pdd-metric-sub">Insurance hypothecation clause</div>
        </div>

        <div
          className={`pdd-metric-card pdd-card-high ${selectedBucket === '16_30' ? 'is-selected' : ''}`}
          onClick={() => setSelectedBucket('16_30')}
        >
          <div className="pdd-metric-header">
            <span className="pdd-metric-label">Critical (16–30 Days)</span>
            <span className="pdd-metric-pill pdd-pill-high">Priority</span>
          </div>
          <div className="pdd-metric-val">{boardData ? boardData.bucket_16_30_count : 0}</div>
          <div className="pdd-metric-sub">Form 34 RTO endorsement</div>
        </div>

        <div
          className={`pdd-metric-card pdd-card-critical ${selectedBucket === '30_plus' ? 'is-selected' : ''}`}
          onClick={() => setSelectedBucket('30_plus')}
        >
          <div className="pdd-metric-header">
            <span className="pdd-metric-label">At Risk (&gt;30 Days)</span>
            <span className="pdd-metric-pill pdd-pill-critical">Clawback Risk</span>
          </div>
          <div className="pdd-metric-val">{boardData ? boardData.bucket_30_plus_count : 0}</div>
          <div className="pdd-metric-sub">Impending payout hold</div>
        </div>
      </div>

      {/* Operational Controls & Filter Bar */}
      <div className="pdd-filters-bar">
        <div className="pdd-filters-left">
          <div className="pdd-search-input-wrapper">
            <input
              type="text"
              placeholder="Search by case #, customer, lender, or doc..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pdd-search-input"
            />
          </div>

          <div className="pdd-filter-group">
            <label className="pdd-filter-label">Status:</label>
            <select
              className="pdd-filter-select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">All Statuses</option>
              <option value="pending">Pending Collection</option>
              <option value="collected">Collected (Ready for Dispatch)</option>
              <option value="sent_to_lender">Dispatched to Bank</option>
              <option value="rejected">Bank Discrepancy / Query</option>
              <option value="acknowledged_by_lender">Bank Acknowledged</option>
            </select>
          </div>

          {uniqueLenders.length > 0 && (
            <div className="pdd-filter-group">
              <label className="pdd-filter-label">Lender:</label>
              <select
                className="pdd-filter-select"
                value={lenderFilter}
                onChange={(e) => setLenderFilter(e.target.value)}
              >
                <option value="">All Partner Lenders</option>
                {uniqueLenders.map((lender) => (
                  <option key={lender} value={lender}>
                    {lender}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="pdd-filters-right">
          <div className="pdd-view-toggle">
            <button
              type="button"
              className={`pdd-toggle-btn ${viewMode === 'table' ? 'is-active' : ''}`}
              onClick={() => setViewMode('table')}
            >
              Operational Table
            </button>
            <button
              type="button"
              className={`pdd-toggle-btn ${viewMode === 'cards' ? 'is-active' : ''}`}
              onClick={() => setViewMode('cards')}
            >
              Card Deck
            </button>
          </div>
        </div>
      </div>

      {error && <div className="pdd-alert-error">{error}</div>}

      {/* Main Work Area */}
      {isLoading ? (
        <div className="pdd-loading-state">
          <div className="pdd-spinner" />
          <span>Synchronizing PDD lifecycle records...</span>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="pdd-empty-state">
          <div className="pdd-empty-icon">✓</div>
          <h3 className="pdd-empty-title">All PDD Deliverables Clear</h3>
          <p className="pdd-empty-desc">
            {searchQuery || statusFilter || lenderFilter || selectedBucket !== 'all'
              ? 'No post-disbursal items match your applied filters. Reset filters to see all records.'
              : 'All disbursed files have their post-disbursal document mandates collected and acknowledged by lenders.'}
          </p>
          <div className="pdd-empty-actions">
            {(searchQuery || statusFilter || lenderFilter || selectedBucket !== 'all') && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setSelectedBucket('all')
                  setStatusFilter('')
                  setLenderFilter('')
                  setSearchQuery('')
                }}
              >
                Clear All Filters
              </Button>
            )}
            <Link to="/cases?status=disbursed">
              <Button variant="primary" size="sm">
                View Disbursed Cases
              </Button>
            </Link>
          </div>
        </div>
      ) : viewMode === 'table' ? (
        <div className="pdd-table-container">
          <table className="pdd-operational-table">
            <thead>
              <tr>
                <th>Case No</th>
                <th>Customer</th>
                <th>Lender</th>
                <th>PDD Requirement</th>
                <th>Due Date</th>
                <th>Age</th>
                <th>Priority</th>
                <th>Status</th>
                <th>Owner</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((item) => (
                <tr key={item.id} className={item.is_overdue ? 'row-overdue' : ''}>
                  <td>
                    <Link to={`/cases/${item.case_id}`} className="pdd-case-link">
                      {item.case_no || 'CASE-LINK'}
                    </Link>
                  </td>
                  <td>
                    <div className="pdd-customer-name">{item.applicant_name || 'Customer'}</div>
                  </td>
                  <td>
                    <span className="pdd-lender-tag">{item.lender_name || 'Partner Bank'}</span>
                  </td>
                  <td>
                    <div className="pdd-item-title">{item.title}</div>
                    <div className="pdd-item-doc-type">{item.document_type.replace('_', ' ').toUpperCase()}</div>
                  </td>
                  <td>
                    <div className="pdd-due-date">
                      {new Date(item.due_date).toLocaleDateString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </div>
                    {item.is_overdue && <span className="pdd-overdue-tag">OVERDUE</span>}
                  </td>
                  <td>
                    <span className="pdd-ageing-val">{item.ageing_days}d</span>
                  </td>
                  <td>{getPriorityBadge(item.ageing_bucket, item.is_overdue)}</td>
                  <td>{getStatusBadge(item.status)}</td>
                  <td>
                    <span className="pdd-owner-name">{item.owner_name || 'Operations Desk'}</span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div className="pdd-action-buttons">
                      {item.status === 'pending' && (
                        <button
                          type="button"
                          className="pdd-btn-action"
                          onClick={() => handleOpenStatusModal(item, 'collected')}
                          title="Mark collected from borrower"
                        >
                          Collect
                        </button>
                      )}
                      {item.status === 'collected' && (
                        <button
                          type="button"
                          className="pdd-btn-action pdd-btn-primary"
                          onClick={() => handleOpenStatusModal(item, 'sent_to_lender')}
                          title="Dispatch to partner bank"
                        >
                          Dispatch
                        </button>
                      )}
                      {item.status === 'sent_to_lender' && (
                        <button
                          type="button"
                          className="pdd-btn-action pdd-btn-success"
                          onClick={() => handleOpenStatusModal(item, 'acknowledged_by_lender')}
                          title="Record bank receipt acknowledgement"
                        >
                          Acknowledge
                        </button>
                      )}
                      <Link to={`/cases/${item.case_id}`} className="pdd-btn-view">
                        View
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="pdd-table-footer">
            <span>Showing {filteredItems.length} of {boardData?.items.length || 0} PDD operational items</span>
          </div>
        </div>
      ) : (
        <div className="pdd-cards-grid">
          {filteredItems.map((item) => (
            <PDDCard key={item.id} item={item} onOpenStatusModal={handleOpenStatusModal} />
          ))}
        </div>
      )}

      {/* Status Transition Modal */}
      <PDDStatusModal
        item={selectedItem}
        targetStatus={targetStatus}
        isOpen={showStatusModal}
        onClose={() => {
          setShowStatusModal(false)
          setSelectedItem(null)
          setTargetStatus(null)
        }}
        onSuccess={loadBoard}
      />
    </div>
  )
}
