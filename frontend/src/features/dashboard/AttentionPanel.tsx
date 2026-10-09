import React from 'react'
import { Link } from 'react-router-dom'
import { AttentionItemsSummary } from './types'

interface AttentionPanelProps {
  attention: AttentionItemsSummary
}

export const AttentionPanel: React.FC<AttentionPanelProps> = ({ attention }) => {
  const items = [
    {
      label: 'Stuck Cases (> SLA)',
      count: attention.stuck_cases_count,
      description: 'Files exceeding stage turnaround SLA',
      path: '/today',
      severity: attention.stuck_cases_count > 0 ? 'high' : 'normal',
    },
    {
      label: 'Urgent Pending Tasks',
      count: attention.urgent_tasks_count,
      description: 'Follow-ups and queries due today or overdue',
      path: '/tasks',
      severity: attention.urgent_tasks_count > 0 ? 'medium' : 'normal',
    },
    {
      label: 'Overdue PDD Documents',
      count: attention.overdue_pdd_count,
      description: 'RC, hypothecation or insurance pending past due',
      path: '/pdd',
      severity: attention.overdue_pdd_count > 0 ? 'high' : 'normal',
    },
    {
      label: 'Payout Discrepancies',
      count: attention.discrepancy_payouts_count,
      description: 'Short-paid bank credits and commission queries',
      path: '/payout/attention',
      severity: attention.discrepancy_payouts_count > 0 ? 'medium' : 'normal',
    },
    {
      label: 'Expiring Documents',
      count: attention.expiring_docs_count,
      description: 'Borrower / vehicle papers expiring in 30 days',
      path: '/today',
      severity: attention.expiring_docs_count > 0 ? 'low' : 'normal',
    },
  ]

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
            Operational Attention Queue
          </h3>
          <p className="type-body-xs" style={{ color: 'var(--color-text-secondary)', margin: '2px 0 0' }}>
            Action items requiring urgent intervention
          </p>
        </div>
        <Link
          to="/today"
          className="type-label-sm"
          style={{ color: 'var(--color-primary)', textDecoration: 'underline', fontSize: '12px' }}
        >
          Open Today Console →
        </Link>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-3)' }}>
        {items.map((it, idx) => {
          let badgeBg = 'var(--color-surface-raised)'
          let badgeColor = 'var(--color-text-secondary)'

          if (it.count > 0) {
            if (it.severity === 'high') {
              badgeBg = 'rgba(217, 83, 79, 0.15)'
              badgeColor = '#d9534f'
            } else if (it.severity === 'medium') {
              badgeBg = 'rgba(240, 173, 78, 0.15)'
              badgeColor = '#b58a4a'
            } else {
              badgeBg = 'var(--color-primary-subtle)'
              badgeColor = 'var(--color-primary)'
            }
          }

          return (
            <Link
              key={idx}
              to={it.path}
              style={{
                textDecoration: 'none',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: 'var(--spacing-3) var(--spacing-4)',
                border: '1px solid var(--color-border-light)',
                background: 'var(--color-surface-raised)',
                transition: 'background 0.2s',
              }}
            >
              <div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                  {it.label}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
                  {it.description}
                </div>
              </div>

              <span
                className="type-mono-sm"
                style={{
                  background: badgeBg,
                  color: badgeColor,
                  padding: '4px 10px',
                  fontWeight: 700,
                  borderRadius: '2px',
                  minWidth: '24px',
                  textAlign: 'center',
                }}
              >
                {it.count}
              </span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
