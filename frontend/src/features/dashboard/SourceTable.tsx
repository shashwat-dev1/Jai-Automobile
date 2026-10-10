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
        background: '#ffffff',
        border: '1px solid #cbd5e1',
        borderRadius: '6px',
        padding: '20px',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div>
          <h3 className="type-h3" style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>
            Top Lead Generation Channels & Referral Sources
          </h3>
          <p className="type-body-xs" style={{ color: '#475569', margin: '2px 0 0', fontSize: '12px' }}>
            Ranked by cold lead intake volume and client qualification efficiency
          </p>
        </div>
        <Link
          to="/referrals"
          className="type-label-sm"
          style={{ color: '#0f172a', textDecoration: 'underline', fontSize: '12px', fontWeight: 600 }}
        >
          View Referral Network →
        </Link>
      </div>

      {sources.length === 0 ? (
        <div style={{ padding: '24px', textAlign: 'center', color: '#475569' }}>
          No source partner data recorded for this period.
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #cbd5e1', background: '#f8fafc' }}>
                <th style={{ padding: '8px 12px', color: '#475569', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase' }}>Channel / Partner</th>
                <th style={{ padding: '8px 12px', color: '#475569', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase' }}>Type</th>
                <th style={{ padding: '8px 12px', color: '#475569', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', textAlign: 'center' }}>Leads</th>
                <th style={{ padding: '8px 12px', color: '#475569', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', textAlign: 'right' }}>Conv %</th>
                <th style={{ padding: '8px 12px', color: '#475569', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', textAlign: 'right' }}>Qualified Volume</th>
                <th style={{ padding: '8px 12px', color: '#475569', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', textAlign: 'right' }}>Attribution Incentive</th>
              </tr>
            </thead>
            <tbody>
              {sources.map((s) => (
                <tr key={s.source_id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                  <td style={{ padding: '10px 12px', fontWeight: 600, color: '#0f172a' }}>{s.source_name}</td>
                  <td style={{ padding: '10px 12px', textTransform: 'capitalize' }}>
                    <span
                      style={{
                        background: '#f1f5f9',
                        color: '#334155',
                        border: '1px solid #cbd5e1',
                        padding: '2px 8px',
                        fontSize: '11px',
                        fontWeight: 600,
                        borderRadius: '12px',
                      }}
                    >
                      {s.source_type.replace('_', ' ')}
                    </span>
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'center', fontFamily: 'monospace', fontWeight: 600, color: '#0f172a' }}>
                    {s.disbursed_cases} / {s.total_cases}
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: '#047857' }}>
                    {s.conversion_rate_pct}%
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, fontFamily: 'monospace', color: '#0f172a' }}>
                    {formatINR(s.disbursed_volume)}
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: '#b45309', fontWeight: 700, fontFamily: 'monospace' }}>
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

