import React, { useCallback, useEffect, useState } from 'react'
import { api } from '../../shared/lib/api'
import { SourceReportResponse } from '../dashboard/types'
import { formatINR } from '../dashboard/utils'
import { ReportExportButton } from './ReportExportButton'

export const SourcesReportPage: React.FC = () => {
  const [data, setData] = useState<SourceReportResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sourceType, setSourceType] = useState<string>('all')
  const [dateRange, setDateRange] = useState<'all' | 'last30' | 'last90'>('all')

  const fetchReport = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      let query = '?'
      if (sourceType !== 'all') {
        query += `source_type=${sourceType}&`
      }
      const now = new Date()
      if (dateRange === 'last30') {
        const from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
        query += `date_from=${from.toISOString().split('T')[0]}&date_to=${now.toISOString().split('T')[0]}&`
      } else if (dateRange === 'last90') {
        const from = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
        query += `date_from=${from.toISOString().split('T')[0]}&date_to=${now.toISOString().split('T')[0]}&`
      }

      const res = await api.get<SourceReportResponse>(`/sources/report${query}`)
      setData(res)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch source performance report'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [sourceType, dateRange])

  useEffect(() => {
    fetchReport()
  }, [fetchReport])

  return (
    <div style={{ padding: 'var(--spacing-4)', maxWidth: 1400, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--spacing-6)', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 className="type-h1" style={{ margin: 0 }}>
            Source & Dealer Performance
          </h1>
          <p className="type-body-md" style={{ color: 'var(--color-text-secondary)', margin: '4px 0 0' }}>
            FR-SRC-004: Multi-channel origination analytics, conversion rates, and partner commission ledger.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          {/* Source Type Filter */}
          <select
            value={sourceType}
            onChange={(e) => setSourceType(e.target.value)}
            style={{
              padding: '6px 12px',
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text-primary)',
              fontSize: '13px',
            }}
          >
            <option value="all">All Source Types</option>
            <option value="dealer">Dealerships</option>
            <option value="sub_dsa">Sub-DSAs</option>
            <option value="connector">Connectors</option>
            <option value="direct">Direct Walk-ins</option>
          </select>

          {/* Date Range Selector */}
          <div style={{ display: 'inline-flex', background: 'var(--color-surface)', border: '1px solid var(--color-border)', padding: '2px' }}>
            {(['all', 'last30', 'last90'] as const).map((r) => (
              <button
                key={r}
                onClick={() => setDateRange(r)}
                style={{
                  background: dateRange === r ? 'var(--color-primary)' : 'transparent',
                  color: dateRange === r ? 'var(--color-text-inverse)' : 'var(--color-text-secondary)',
                  border: 'none',
                  padding: '4px 10px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {r === 'all' ? 'All Time' : r === 'last30' ? 'Last 30d' : 'Last 90d'}
              </button>
            ))}
          </div>

          <ReportExportButton />
        </div>
      </div>

      {error && (
        <div style={{ background: 'rgba(217, 83, 79, 0.15)', color: '#d9534f', padding: '12px', marginBottom: '16px' }}>
          {error}
        </div>
      )}

      {/* Summary KPI Strip */}
      {data && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 'var(--spacing-4)',
            marginBottom: 'var(--spacing-6)',
          }}
        >
          <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', padding: 'var(--spacing-4)' }}>
            <div className="type-label-sm" style={{ color: 'var(--color-text-secondary)' }}>TOTAL PARTNERS</div>
            <div className="type-mono-xl" style={{ fontSize: '24px', fontWeight: 700, margin: '4px 0' }}>
              {data.sources.length}
            </div>
            <div className="type-body-xs" style={{ color: 'var(--color-text-tertiary)' }}>Empanelled origination sources</div>
          </div>

          <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', padding: 'var(--spacing-4)' }}>
            <div className="type-label-sm" style={{ color: 'var(--color-text-secondary)' }}>TOTAL FILES</div>
            <div className="type-mono-xl" style={{ fontSize: '24px', fontWeight: 700, margin: '4px 0' }}>
              {data.total_cases}
            </div>
            <div className="type-body-xs" style={{ color: 'var(--color-text-tertiary)' }}>Cases logged across all channels</div>
          </div>

          <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', padding: 'var(--spacing-4)' }}>
            <div className="type-label-sm" style={{ color: 'var(--color-text-secondary)' }}>DISBURSED BOOK</div>
            <div className="type-mono-xl" style={{ fontSize: '24px', fontWeight: 700, margin: '4px 0', color: 'var(--color-primary)' }}>
              {formatINR(data.total_disbursed_volume)}
            </div>
            <div className="type-body-xs" style={{ color: 'var(--color-text-tertiary)' }}>Total disbursed vehicle loan volume</div>
          </div>

          <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', padding: 'var(--spacing-4)' }}>
            <div className="type-label-sm" style={{ color: 'var(--color-text-secondary)' }}>COMMISSION ACCRUED</div>
            <div className="type-mono-xl" style={{ fontSize: '24px', fontWeight: 700, margin: '4px 0', color: 'var(--color-accent-dark)' }}>
              {formatINR(data.total_payout_expected)}
            </div>
            <div className="type-body-xs" style={{ color: 'var(--color-text-tertiary)' }}>
              Received: {formatINR(data.total_payout_received)}
            </div>
          </div>
        </div>
      )}

      {loading && !data && (
        <div style={{ padding: 'var(--spacing-12)', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
          Computing source analytics and partner metrics...
        </div>
      )}

      {/* Main Table */}
      {data && (
        <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-surface-raised)' }}>
                <th className="type-label-xs" style={{ padding: '10px 14px' }}>Partner / Source</th>
                <th className="type-label-xs" style={{ padding: '10px 14px' }}>Type</th>
                <th className="type-label-xs" style={{ padding: '10px 14px' }}>Contact</th>
                <th className="type-label-xs" style={{ padding: '10px 14px', textAlign: 'center' }}>Total Files</th>
                <th className="type-label-xs" style={{ padding: '10px 14px', textAlign: 'center' }}>Disbursed</th>
                <th className="type-label-xs" style={{ padding: '10px 14px', textAlign: 'right' }}>Conv %</th>
                <th className="type-label-xs" style={{ padding: '10px 14px', textAlign: 'right' }}>Disbursed Book</th>
                <th className="type-label-xs" style={{ padding: '10px 14px', textAlign: 'right' }}>Payout Expected</th>
                <th className="type-label-xs" style={{ padding: '10px 14px', textAlign: 'right' }}>Payout Settled</th>
                <th className="type-label-xs" style={{ padding: '10px 14px', textAlign: 'center' }}>Quality Score</th>
              </tr>
            </thead>
            <tbody>
              {data.sources.length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ padding: '32px', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                    No partners matching the selected filter criteria.
                  </td>
                </tr>
              ) : (
                data.sources.map((s) => (
                  <tr key={s.source_id} style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                    <td style={{ padding: '12px 14px', fontWeight: 600 }}>{s.source_name}</td>
                    <td style={{ padding: '12px 14px' }}>
                      <span
                        style={{
                          background: 'var(--color-primary-subtle)',
                          color: 'var(--color-primary)',
                          padding: '2px 6px',
                          fontSize: '11px',
                          fontWeight: 600,
                          borderRadius: '2px',
                          textTransform: 'capitalize',
                        }}
                      >
                        {s.source_type}
                      </span>
                    </td>
                    <td style={{ padding: '12px 14px', fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                      {s.contact_person || '—'} {s.phone && `(${s.phone})`}
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'center' }} className="type-mono-sm">
                      {s.total_cases}
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'center' }} className="type-mono-sm">
                      {s.disbursed_cases}
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'right' }} className="type-mono-sm">
                      {s.conversion_rate_pct}%
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 600 }} className="type-mono-sm">
                      {formatINR(s.disbursed_volume)}
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'right', color: 'var(--color-accent-dark)', fontWeight: 600 }} className="type-mono-sm">
                      {formatINR(s.payout_expected)}
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'right', color: 'var(--color-primary)', fontWeight: 600 }} className="type-mono-sm">
                      {formatINR(s.payout_received)}
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'center' }} className="type-mono-sm">
                      <span
                        style={{
                          background: parseFloat(s.quality_score) >= 50 ? 'rgba(40, 167, 69, 0.15)' : 'var(--color-border-light)',
                          color: parseFloat(s.quality_score) >= 50 ? '#28a745' : 'var(--color-text-secondary)',
                          padding: '2px 8px',
                          fontWeight: 700,
                          borderRadius: '2px',
                        }}
                      >
                        {s.quality_score}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
