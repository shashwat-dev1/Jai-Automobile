import React from 'react'
import { Link } from 'react-router-dom'
import { AttentionItemsSummary } from './types'

interface AttentionPanelProps {
  attention: AttentionItemsSummary | any[]
}

export const AttentionPanel: React.FC<AttentionPanelProps> = ({ attention }) => {
  const att: any = attention || {}

  let items: Array<{
    label: string
    count: number
    description: string
    path: string
    severity: string
  }> = []

  if (Array.isArray(attention) && attention.length > 0) {
    items = attention.map((i: any) => ({
      label: i.label || i.title,
      count: i.count ?? 1,
      description: i.description || (i.amount ? `${i.amount} • ${i.customer_name}` : ''),
      path: i.path || '/today',
      severity: i.severity || i.urgency || 'normal',
    }))
  } else if (att.uncalled_fresh_count !== undefined) {
    items = [
      {
        label: 'Uncalled Fresh Cold Leads',
        count: att.uncalled_fresh_count ?? 9,
        description: 'Fresh batch & guest leads awaiting first contact',
        path: '/today',
        severity: 'high',
      },
      {
        label: 'Scheduled Callbacks Due Today',
        count: att.callbacks_scheduled_count ?? 8,
        description: 'Promised appointment calls booked with prospects',
        path: '/today',
        severity: 'high',
      },
      {
        label: 'Hot Interested Prospects',
        count: att.interested_qualified_count ?? 14,
        description: 'Prospects agreed to apply, ready for client onboarding',
        path: '/today',
        severity: 'medium',
      },
      {
        label: 'Unassigned Leads Pool',
        count: att.unassigned_leads_count ?? 5,
        description: 'Cold leads in queue without telecaller desk assignment',
        path: '/today',
        severity: 'medium',
      },
      {
        label: 'Retry Callbacks (RNR / Busy)',
        count: att.retry_leads_count ?? 6,
        description: 'Leads with 1-2 unanswered attempts requiring follow-up dial',
        path: '/today',
        severity: 'low',
      },
    ]
  } else {
    items = [
      {
        label: 'Stuck Cases (> SLA)',
        count: att.stuck_cases_count ?? 0,
        description: 'Files exceeding stage turnaround SLA',
        path: '/today',
        severity: (att.stuck_cases_count ?? 0) > 0 ? 'high' : 'normal',
      },
      {
        label: 'Urgent Pending Tasks',
        count: att.urgent_tasks_count ?? 0,
        description: 'Follow-ups and queries due today or overdue',
        path: '/today',
        severity: (att.urgent_tasks_count ?? 0) > 0 ? 'medium' : 'normal',
      },
      {
        label: 'Overdue PDD Documents',
        count: att.overdue_pdd_count ?? 0,
        description: 'RC, hypothecation or insurance pending past due',
        path: '/pdd',
        severity: (att.overdue_pdd_count ?? 0) > 0 ? 'high' : 'normal',
      },
      {
        label: 'Payout Discrepancies',
        count: att.discrepancy_payouts_count ?? 0,
        description: 'Short-paid bank credits and commission queries',
        path: '/payout/attention',
        severity: (att.discrepancy_payouts_count ?? 0) > 0 ? 'medium' : 'normal',
      },
      {
        label: 'Expiring Documents',
        count: att.expiring_docs_count ?? 0,
        description: 'Borrower / vehicle papers expiring in 30 days',
        path: '/today',
        severity: (att.expiring_docs_count ?? 0) > 0 ? 'low' : 'normal',
      },
    ]
  }

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
            Lead Operations Attention Queue
          </h3>
          <p className="type-body-xs" style={{ color: '#475569', margin: '2px 0 0', fontSize: '12px' }}>
            Urgent telecalling action items requiring outreach or follow-up
          </p>
        </div>
        <Link
          to="/today"
          className="type-label-sm"
          style={{ color: '#0f172a', textDecoration: 'underline', fontSize: '12px', fontWeight: 600 }}
        >
          Open Today Console →
        </Link>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {items.map((it, idx) => {
          let badgeBg = '#f1f5f9'
          let badgeColor = '#475569'

          if (it.count > 0) {
            if (it.severity === 'high') {
              badgeBg = '#fee2e2'
              badgeColor = '#b91c1c'
            } else if (it.severity === 'medium') {
              badgeBg = '#fef3c7'
              badgeColor = '#b45309'
            } else {
              badgeBg = '#e0e7ff'
              badgeColor = '#3730a3'
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
                padding: '10px 14px',
                border: '1px solid #e2e8f0',
                background: '#f8fafc',
                borderRadius: '4px',
                transition: 'all 0.15s ease',
              }}
            >
              <div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>
                  {it.label}
                </div>
                <div style={{ fontSize: '11px', color: '#475569', marginTop: '2px' }}>
                  {it.description}
                </div>
              </div>

              <span
                className="type-mono-sm"
                style={{
                  background: badgeBg,
                  color: badgeColor,
                  padding: '3px 9px',
                  fontWeight: 700,
                  borderRadius: '12px',
                  fontSize: '12px',
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

