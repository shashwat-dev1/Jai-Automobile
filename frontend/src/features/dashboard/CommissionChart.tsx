import React from 'react'
import { MonthlyCommissionItem } from './types'
import { formatINR } from './utils'

interface CommissionChartProps {
  data?: MonthlyCommissionItem[]
}

const DEFAULT_COMMISSION_DATA: MonthlyCommissionItem[] = [
  { month: 'Oct 2024', expected_amount: '280000', settled_amount: '280000', case_count: 8 },
  { month: 'Nov 2024', expected_amount: '340000', settled_amount: '325000', case_count: 11 },
  { month: 'Dec 2024', expected_amount: '410000', settled_amount: '395000', case_count: 14 },
  { month: 'Jan 2025', expected_amount: '460000', settled_amount: '430000', case_count: 16 },
  { month: 'Feb 2025', expected_amount: '384000', settled_amount: '312000', case_count: 14 },
]

export const CommissionChart: React.FC<CommissionChartProps> = ({ data }) => {
  const chartData = Array.isArray(data) && data.length > 0 ? data : DEFAULT_COMMISSION_DATA

  const maxVal = Math.max(
    ...chartData.flatMap((d) => [parseFloat(d.expected_amount) || 0, parseFloat(d.settled_amount) || 0]),
    1
  )

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
            Lead Inflow & Contact Volume Trends
          </h3>
          <p className="type-body-xs" style={{ color: '#475569', margin: '2px 0 0', fontSize: '12px' }}>
            Monthly lead intake volume vs completed telecaller outreach
          </p>
        </div>
        <div style={{ display: 'flex', gap: '14px', fontSize: '12px', fontWeight: 600 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#475569' }}>
            <span style={{ display: 'inline-block', width: 10, height: 10, background: '#b45309', borderRadius: 2 }} />
            Total Inflow
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#475569' }}>
            <span style={{ display: 'inline-block', width: 10, height: 10, background: '#0f172a', borderRadius: 2 }} />
            Contacted
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {chartData.map((item) => {
          const expNum = parseFloat(item.expected_amount) || 0
          const setNum = parseFloat(item.settled_amount) || 0
          const expWidth = Math.max(2, (expNum / maxVal) * 100)
          const setWidth = Math.max(2, (setNum / maxVal) * 100)

          return (
            <div key={item.month} className="commission-chart-row">
              <div className="type-mono-sm" style={{ fontWeight: 600, color: '#0f172a' }}>
                {item.month}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {/* Inflow bar */}
                <div style={{ background: '#f1f5f9', height: '10px', width: '100%', borderRadius: 2, overflow: 'hidden' }}>
                  <div
                    style={{
                      background: '#b45309',
                      width: `${expWidth}%`,
                      height: '100%',
                    }}
                  />
                </div>
                {/* Contacted bar */}
                <div style={{ background: '#f1f5f9', height: '10px', width: '100%', borderRadius: 2, overflow: 'hidden' }}>
                  <div
                    style={{
                      background: '#0f172a',
                      width: `${setWidth}%`,
                      height: '100%',
                    }}
                  />
                </div>
              </div>

              <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column' }}>
                <span className="type-mono-xs" style={{ color: '#b45309', fontWeight: 600 }}>
                  Exp: {formatINR(item.expected_amount)}
                </span>
                <span className="type-mono-xs" style={{ color: '#0f172a', fontWeight: 600 }}>
                  Set: {formatINR(item.settled_amount)} ({item.case_count} {item.case_count === 1 ? 'client' : 'clients'})
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

