/**
 * DSA OS — Audit Trail Explorer (Owner & Auditor)
 *
 * Implements PERM_AUDIT_READ:
 * - Query immutable system audit logs
 * - Filter by action, entity type, actor
 * - Pagination
 * - Export audit trail to CSV
 */

import { useState, useEffect, useCallback, FormEvent } from 'react'
import { api, ApiError } from '../../shared/lib/api'
import Button from '../../shared/components/Button'
import Input from '../../shared/components/Input'
import './AuditLogPage.css'

interface AuditLogItem {
  id: string
  action: string
  entity_type: string
  entity_id: string
  actor_id?: string | null
  actor_role?: string | null
  ip_address?: string | null
  changes?: Record<string, unknown> | null
  timestamp: string
}

interface PaginationMeta {
  total: number
  page: number
  page_size: number
  has_next: boolean
  has_prev: boolean
}

export function AuditLogPage() {
  const [entries, setEntries] = useState<AuditLogItem[]>([])
  const [meta, setMeta] = useState<PaginationMeta | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Filters
  const [actionFilter, setActionFilter] = useState('')
  const [entityFilter, setEntityFilter] = useState('')
  const [page, setPage] = useState(1)

  const loadAuditLog = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      params.set('page', String(page))
      params.set('page_size', '20')
      if (actionFilter.trim()) params.set('action', actionFilter.trim())
      if (entityFilter.trim()) params.set('entity_type', entityFilter.trim())

      const res = await api.getWithEnvelope<AuditLogItem[]>(`/audit?${params.toString()}`)
      setEntries(res.data)
      setMeta(res.meta as unknown as PaginationMeta)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to query audit log')
    } finally {
      setIsLoading(false)
    }
  }, [page, actionFilter, entityFilter])

  useEffect(() => {
    loadAuditLog()
  }, [loadAuditLog])

  const handleFilterSubmit = (e: FormEvent) => {
    e.preventDefault()
    setPage(1)
    loadAuditLog()
  }

  const handleExportCSV = async () => {
    try {
      const params = new URLSearchParams()
      if (actionFilter.trim()) params.set('action', actionFilter.trim())
      if (entityFilter.trim()) params.set('entity_type', entityFilter.trim())

      const blob = await fetch(`/api/v1/audit/export?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${api}`, // apiFetch handles Authorization
        },
      }).then((r) => r.blob())

      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
    } catch {
      alert('Failed to export CSV')
    }
  }

  return (
    <div className="audit-page">
      <div className="audit-header">
        <div>
          <h1 className="type-h1">Immutable Audit Trail</h1>
          <p className="type-body-md" style={{ color: 'var(--color-text-secondary)' }}>
            Cryptographically sealed, append-only operational record of user, system, and financial actions.
          </p>
        </div>
        <Button variant="secondary" onClick={handleExportCSV}>
          Export CSV
        </Button>
      </div>

      {error && <div className="audit-error-alert">{error}</div>}

      {/* Filter Bar */}
      <form onSubmit={handleFilterSubmit} className="audit-filter-bar">
        <div className="filter-input-wrap">
          <Input
            id="filter-action"
            placeholder="Filter action (e.g. auth.login, case.disbursed)"
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
          />
        </div>
        <div className="filter-input-wrap">
          <Input
            id="filter-entity"
            placeholder="Entity type (e.g. user, case, document)"
            value={entityFilter}
            onChange={(e) => setEntityFilter(e.target.value)}
          />
        </div>
        <Button type="submit" variant="primary" size="md">
          Filter
        </Button>
        {(actionFilter || entityFilter) && (
          <Button
            type="button"
            variant="ghost"
            size="md"
            onClick={() => {
              setActionFilter('')
              setEntityFilter('')
              setPage(1)
            }}
          >
            Reset
          </Button>
        )}
      </form>

      {/* Audit Log Table */}
      {isLoading ? (
        <div className="audit-loading">Fetching immutable ledger records...</div>
      ) : entries.length === 0 ? (
        <div className="audit-empty">
          <h3>No audit records matched</h3>
          <p>Try modifying your search criteria or resetting filters.</p>
        </div>
      ) : (
        <div className="audit-table-wrap">
          <table className="audit-table">
            <thead>
              <tr>
                <th>Timestamp (UTC)</th>
                <th>Action</th>
                <th>Actor Role</th>
                <th>Target Entity</th>
                <th>IP Address</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td>
                    <span className="type-mono-sm">
                      {new Date(entry.timestamp).toISOString().replace('T', ' ').slice(0, 19)}
                    </span>
                  </td>
                  <td>
                    <span className="audit-action-tag">{entry.action}</span>
                  </td>
                  <td>
                    <span className="type-mono-sm">{entry.actor_role || 'system'}</span>
                  </td>
                  <td>
                    <div className="type-mono-sm">
                      <strong style={{ color: 'var(--color-text-primary)' }}>
                        {entry.entity_type}
                      </strong>
                      <span style={{ color: 'var(--color-text-tertiary)', marginLeft: 4 }}>
                        {entry.entity_id}
                      </span>
                    </div>
                  </td>
                  <td>
                    <span className="type-mono-sm">{entry.ip_address || '—'}</span>
                  </td>
                  <td>
                    {entry.changes && Object.keys(entry.changes).length > 0 ? (
                      <details className="audit-details">
                        <summary>View JSON</summary>
                        <pre>{JSON.stringify(entry.changes, null, 2)}</pre>
                      </details>
                    ) : (
                      <span className="type-mono-sm" style={{ color: 'var(--color-text-tertiary)' }}>
                        —
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Pagination Controls */}
          {meta && (
            <div className="audit-pagination">
              <span className="type-mono-sm" style={{ color: 'var(--color-text-secondary)' }}>
                Showing {(meta.page - 1) * meta.page_size + 1}–
                {Math.min(meta.page * meta.page_size, meta.total)} of {meta.total} events
              </span>
              <div className="audit-pagination-btns">
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
    </div>
  )
}
