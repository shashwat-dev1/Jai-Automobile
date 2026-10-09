import React from 'react'
import { MonthlyCommissionItem } from './types'
import { formatINR } from './utils'

interface CommissionChartProps {
  data: MonthlyCommissionItem[]
}

export const CommissionChart: React.FC<CommissionChartProps> = ({ data }) => {
  const maxVal = Math.max(
    ...data.flatMap((d) => [parseFloat(d.expected_amount) || 0, parseFloat(d.settled_amount) || 0]),
    1
  )

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
            Commission Performance (Last 6 Months)
          </h3>
          <p className="type-body-xs" style={{ color: 'var(--color-text-secondary)', margin: '2px 0 0' }}>
            Expected commission receivable vs settled bank payouts
          </p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--spacing-3)', fontSize: '12px' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ display: 'inline-block', width: 10, height: 10, background: 'var(--color-accent)' }} />
            Expected
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ display: 'inline-block', width: 10, height: 10, background: 'var(--color-primary)' }} />
            Settled
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-3)' }}>
        {data.map((item) => {
          const expNum = parseFloat(item.expected_amount) || 0
          const setNum = parseFloat(item.settled_amount) || 0
          const expWidth = Math.max(2, (expNum / maxVal) * 100)
          const setWidth = Math.max(2, (setNum / maxVal) * 100)

          return (
            <div key={item.month} className="commission-chart-row">
              <div className="type-mono-sm" style={{ fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                {item.month}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                {/* Expected bar */}
                <div style={{ background: 'var(--color-border-light)', height: '10px', width: '100%' }}>
                  <div
                    style={{
                      background: 'var(--color-accent)',
                      width: `${expWidth}%`,
                      height: '100%',
                    }}
                  />
                </div>
                {/* Settled bar */}
                <div style={{ background: 'var(--color-border-light)', height: '10px', width: '100%' }}>
                  <div
                    style={{
                      background: 'var(--color-primary)',
                      width: `${setWidth}%`,
                      height: '100%',
                    }}
                  />
                </div>
              </div>

              <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column' }}>
                <span className="type-mono-xs" style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>
                  Exp: {formatINR(item.expected_amount)}
                </span>
                <span className="type-mono-xs" style={{ color: 'var(--color-primary)' }}>
                  Set: {formatINR(item.settled_amount)} ({item.case_count} {item.case_count === 1 ? 'file' : 'files'})
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
