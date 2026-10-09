import React from 'react'
import { Link } from 'react-router-dom'
import { TopSourceItem } from './types'
import { formatINR } from './utils'

interface SourceTableProps {
  sources: TopSourceItem[]
}

export const SourceTable: React.FC<SourceTableProps> = ({ sources }) => {
  return (
    <div
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        padding: 'var(--spacing-5)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--spacing-4)' }}>
        <div>
          <h3 className="type-h3" style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>
            Top Partner Dealerships & Sources
          </h3>
          <p className="type-body-xs" style={{ color: 'var(--color-text-secondary)', margin: '2px 0 0' }}>
            Ranked by disbursal volume and conversion efficiency
          </p>
        </div>
        <Link
          to="/reports/sources"
          className="type-label-sm"
          style={{ color: 'var(--color-primary)', textDecoration: 'underline', fontSize: '12px' }}
        >
          View Full Report →
        </Link>
      </div>

      {sources.length === 0 ? (
        <div style={{ padding: 'var(--spacing-6)', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
          No source partner data recorded for this period.
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                <th className="type-label-xs" style={{ padding: '8px 12px', color: 'var(--color-text-secondary)' }}>Partner / Source</th>
                <th className="type-label-xs" style={{ padding: '8px 12px', color: 'var(--color-text-secondary)' }}>Type</th>
                <th className="type-label-xs" style={{ padding: '8px 12px', color: 'var(--color-text-secondary)', textAlign: 'center' }}>Files</th>
                <th className="type-label-xs" style={{ padding: '8px 12px', color: 'var(--color-text-secondary)', textAlign: 'right' }}>Conv %</th>
                <th className="type-label-xs" style={{ padding: '8px 12px', color: 'var(--color-text-secondary)', textAlign: 'right' }}>Disbursed Book</th>
                <th className="type-label-xs" style={{ padding: '8px 12px', color: 'var(--color-text-secondary)', textAlign: 'right' }}>Accrued Commission</th>
              </tr>
            </thead>
            <tbody>
              {sources.map((s) => (
                <tr key={s.source_id} style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                  <td style={{ padding: '10px 12px', fontWeight: 600 }}>{s.source_name}</td>
                  <td style={{ padding: '10px 12px', textTransform: 'capitalize' }}>
                    <span
                      style={{
                        background: 'var(--color-primary-subtle)',
                        color: 'var(--color-primary)',
                        padding: '2px 6px',
                        fontSize: '11px',
                        fontWeight: 600,
                        borderRadius: '2px',
                      }}
                    >
                      {s.source_type}
                    </span>
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'center' }} className="type-mono-sm">
                    {s.disbursed_cases} / {s.total_cases}
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right' }} className="type-mono-sm">
                    {s.conversion_rate_pct}%
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600 }} className="type-mono-sm">
                    {formatINR(s.disbursed_volume)}
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--color-accent-dark)', fontWeight: 600 }} className="type-mono-sm">
                    {formatINR(s.accrued_payout)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
