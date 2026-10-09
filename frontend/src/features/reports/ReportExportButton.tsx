import React, { useState } from 'react'
import { useAuthStore } from '../auth/useAuth'
import { usePermission } from '../auth/usePermission'
import { PERMISSIONS } from '../auth/types'

export const ReportExportButton: React.FC = () => {
  const [showModal, setShowModal] = useState(false)
  const [reportType, setReportType] = useState<'cases' | 'payouts' | 'sources' | 'audit'>('cases')
  const [dateRange, setDateRange] = useState<'all' | 'last30' | 'last90'>('all')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { can } = usePermission()
  const canExport = can(PERMISSIONS.DATA_EXPORT)
  const accessToken = useAuthStore((state) => state.accessToken)

  if (!canExport) {
    return null
  }

  const handleExport = async () => {
    setLoading(true)
    setError(null)

    try {
      let query = `?report_type=${reportType}`
      const now = new Date()
      if (dateRange === 'last30') {
        const from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
        query += `&date_from=${from.toISOString().split('T')[0]}&date_to=${now.toISOString().split('T')[0]}`
      } else if (dateRange === 'last90') {
        const from = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
        query += `&date_from=${from.toISOString().split('T')[0]}&date_to=${now.toISOString().split('T')[0]}`
      }

      const res = await fetch(`/api/v1/reports/export${query}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'X-Request-ID': crypto.randomUUID(),
        },
      })

      if (!res.ok) {
        throw new Error(`Export failed with HTTP ${res.status}`)
      }

      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${reportType}_export_${new Date().toISOString().split('T')[0]}.csv`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)

      setShowModal(false)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Export failed'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          color: 'var(--color-text-primary)',
          padding: '6px 12px',
          fontSize: '13px',
          fontWeight: 600,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
        Export CSV
      </button>

      {showModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            style={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              padding: 'var(--spacing-6)',
              maxWidth: 420,
              width: '100%',
              boxShadow: 'var(--shadow-modal)',
            }}
          >
            <h3 className="type-h3" style={{ margin: '0 0 16px', fontSize: '18px' }}>
              Export Operational Data
            </h3>

            {error && (
              <div
                style={{
                  background: 'rgba(217, 83, 79, 0.15)',
                  color: '#d9534f',
                  padding: '8px 12px',
                  fontSize: '12px',
                  marginBottom: '12px',
                }}
              >
                {error}
              </div>
            )}

            <div style={{ marginBottom: '14px' }}>
              <label className="type-label-sm" style={{ display: 'block', marginBottom: '6px' }}>
                Select Dataset
              </label>
              <select
                value={reportType}
                onChange={(e) => setReportType(e.target.value as 'cases' | 'payouts' | 'sources' | 'audit')}
                style={{
                  width: '100%',
                  padding: '8px',
                  background: 'var(--color-surface-raised)',
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-text-primary)',
                }}
              >
                <option value="cases">Loan Cases Pipeline</option>
                <option value="payouts">Payout Expectations & Commission</option>
                <option value="sources">Dealer & Source Performance</option>
                <option value="audit">Immutable Audit Trail</option>
              </select>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label className="type-label-sm" style={{ display: 'block', marginBottom: '6px' }}>
                Date Range
              </label>
              <select
                value={dateRange}
                onChange={(e) => setDateRange(e.target.value as 'all' | 'last30' | 'last90')}
                style={{
                  width: '100%',
                  padding: '8px',
                  background: 'var(--color-surface-raised)',
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-text-primary)',
                }}
              >
                <option value="all">All Time</option>
                <option value="last30">Last 30 Days</option>
                <option value="last90">Last 90 Days</option>
              </select>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                onClick={() => setShowModal(false)}
                disabled={loading}
                style={{
                  background: 'transparent',
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-text-secondary)',
                  padding: '6px 14px',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleExport}
                disabled={loading}
                style={{
                  background: 'var(--color-primary)',
                  border: '1px solid var(--color-primary)',
                  color: 'var(--color-text-inverse)',
                  padding: '6px 16px',
                  fontWeight: 600,
                }}
              >
                {loading ? 'Generating CSV...' : 'Download CSV'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
