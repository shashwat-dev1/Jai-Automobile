import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../shared/lib/api'
import { TodayViewResponse } from './types'

export const TodayPage: React.FC = () => {
  const [data, setData] = useState<TodayViewResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'due_today' | 'overdue' | 'stuck' | 'expiring' | 'pdd'>('due_today')

  const fetchToday = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await api.get<TodayViewResponse>('/dashboard/today')
      setData(res)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch today cockpit'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchToday()
  }, [])

  return (
    <div style={{ padding: 'var(--spacing-3)', maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--spacing-6)', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Link to="/" style={{ color: 'var(--color-text-secondary)', textDecoration: 'none', fontSize: '13px' }}>
              ← Operations Console
            </Link>
          </div>
          <h1 className="type-h1" style={{ margin: '4px 0 0' }}>
            Daily Execution Cockpit (Today)
          </h1>
          <p className="type-body-md" style={{ color: 'var(--color-text-secondary)', margin: '4px 0 0' }}>
            Daily task checklist, overdue follow-ups, stuck pipeline files, and document expiry warnings.
          </p>
        </div>

        <button
          onClick={fetchToday}
          style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            padding: '6px 14px',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          ↻ Refresh
        </button>
      </div>

      {error && (
        <div style={{ background: 'rgba(217, 83, 79, 0.15)', color: '#d9534f', padding: '12px', marginBottom: '16px' }}>
          {error}
        </div>
      )}

      {/* KPI Counters Strip */}
      {data && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 'var(--spacing-3)',
            marginBottom: 'var(--spacing-6)',
          }}
        >
          {[
            { id: 'due_today', label: 'Due Today', count: data.counts.due_today_count, color: 'var(--color-primary)' },
            { id: 'overdue', label: 'Overdue Tasks', count: data.counts.overdue_count, color: '#d9534f' },
            { id: 'stuck', label: 'Stuck Cases (> SLA)', count: data.counts.stuck_cases_count, color: '#b58a4a' },
            { id: 'expiring', label: 'Expiring Docs', count: data.counts.expiring_docs_count, color: 'var(--color-text-secondary)' },
            { id: 'pdd', label: 'PDD Pending', count: data.counts.pdd_due_count, color: 'var(--color-status-warning)' },
          ].map((c) => (
            <div
              key={c.id}
              onClick={() => setActiveTab(c.id as 'due_today' | 'overdue' | 'stuck' | 'expiring' | 'pdd')}
              style={{
                background: activeTab === c.id ? 'var(--color-surface-raised)' : 'var(--color-surface)',
                border: activeTab === c.id ? `2px solid ${c.color}` : '1px solid var(--color-border)',
                padding: 'var(--spacing-4)',
                cursor: 'pointer',
                boxShadow: activeTab === c.id ? 'var(--shadow-card)' : 'none',
              }}
            >
              <div className="type-label-sm" style={{ color: 'var(--color-text-secondary)', textTransform: 'uppercase', fontSize: '11px' }}>
                {c.label}
              </div>
              <div className="type-mono-xl" style={{ fontSize: '24px', fontWeight: 700, margin: '4px 0', color: c.color }}>
                {c.count}
              </div>
            </div>
          ))}
        </div>
      )}

      {loading && !data && (
        <div style={{ padding: 'var(--spacing-12)', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
          Loading daily operational items...
        </div>
      )}

      {/* Tab Panels */}
      {data && (
        <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', padding: 'var(--spacing-5)' }}>
          {/* TAB: Due Today */}
          {activeTab === 'due_today' && (
            <div>
              <h3 className="type-h3" style={{ margin: '0 0 16px', fontSize: '16px' }}>
                Tasks Due Today ({data.tasks_due_today.length})
              </h3>
              {data.tasks_due_today.length === 0 ? (
                <div style={{ padding: 'var(--spacing-8)', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                  All clear! No pending tasks due today.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {data.tasks_due_today.map((t) => (
                    <div
                      key={t.id}
                      style={{
                        padding: '12px 16px',
                        background: 'var(--color-surface-raised)',
                        border: '1px solid var(--color-border-light)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 600 }}>{t.title}</div>
                        <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
                          Type: {t.type} {t.case_no && `• Case: ${t.case_no}`} {t.owner_name && `• Assigned: ${t.owner_name}`}
                        </div>
                      </div>
                      <Link to="/tasks" style={{ color: 'var(--color-primary)', fontWeight: 600, fontSize: '12px' }}>
                        View in Follow-ups →
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB: Overdue Tasks */}
          {activeTab === 'overdue' && (
            <div>
              <h3 className="type-h3" style={{ margin: '0 0 16px', fontSize: '16px', color: '#d9534f' }}>
                Overdue Tasks Backlog ({data.tasks_overdue.length})
              </h3>
              {data.tasks_overdue.length === 0 ? (
                <div style={{ padding: 'var(--spacing-8)', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                  No overdue tasks backlog.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {data.tasks_overdue.map((t) => (
                    <div
                      key={t.id}
                      style={{
                        padding: '12px 16px',
                        background: 'var(--color-surface-raised)',
                        borderLeft: '4px solid #d9534f',
                        borderTop: '1px solid var(--color-border-light)',
                        borderRight: '1px solid var(--color-border-light)',
                        borderBottom: '1px solid var(--color-border-light)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 600 }}>{t.title}</div>
                        <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
                          Due: {new Date(t.due_date).toLocaleDateString()} {t.case_no && `• Case: ${t.case_no}`} {t.owner_name && `• Owner: ${t.owner_name}`}
                        </div>
                      </div>
                      <Link to="/tasks" style={{ color: '#d9534f', fontWeight: 600, fontSize: '12px' }}>
                        Resolve Now →
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB: Stuck Cases */}
          {activeTab === 'stuck' && (
            <div>
              <h3 className="type-h3" style={{ margin: '0 0 16px', fontSize: '16px' }}>
                Stuck Loan Files Exceeding Stage SLA ({data.stuck_cases.length})
              </h3>
              {data.stuck_cases.length === 0 ? (
                <div style={{ padding: 'var(--spacing-8)', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                  Pipeline velocity healthy! Zero stuck files.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {data.stuck_cases.map((c) => (
                    <div
                      key={c.case_id}
                      style={{
                        padding: '12px 16px',
                        background: 'var(--color-surface-raised)',
                        border: '1px solid var(--color-border-light)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 700 }}>{c.case_no}</div>
                        <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
                          Stage: <span style={{ textTransform: 'capitalize' }}>{c.stage.replace('_', ' ')}</span> • Ageing: <b>{c.ageing_hours} hrs</b> (SLA: {c.sla_hours} hrs)
                          {c.owner_name && ` • Owner: ${c.owner_name}`}
                        </div>
                      </div>
                      <Link to={`/cases/${c.case_id}`} style={{ color: 'var(--color-primary)', fontWeight: 600, fontSize: '12px' }}>
                        Open Case File →
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB: Expiring Documents */}
          {activeTab === 'expiring' && (
            <div>
              <h3 className="type-h3" style={{ margin: '0 0 16px', fontSize: '16px' }}>
                Expiring Documents Warning Queue ({data.expiring_documents.length})
              </h3>
              {data.expiring_documents.length === 0 ? (
                <div style={{ padding: 'var(--spacing-8)', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                  No customer or vehicle documents expiring within the next 30 days.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {data.expiring_documents.map((d) => (
                    <div
                      key={d.document_id}
                      style={{
                        padding: '12px 16px',
                        background: 'var(--color-surface-raised)',
                        border: '1px solid var(--color-border-light)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 600 }}>{d.document_name}</div>
                        <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
                          Type: {d.document_type_name} • Expires: {new Date(d.expires_at).toLocaleDateString()}
                        </div>
                      </div>
                      <span
                        className="type-mono-xs"
                        style={{
                          background: d.days_until_expiry <= 7 ? 'rgba(217, 83, 79, 0.15)' : 'var(--color-primary-subtle)',
                          color: d.days_until_expiry <= 7 ? '#d9534f' : 'var(--color-primary)',
                          padding: '3px 8px',
                          fontWeight: 700,
                        }}
                      >
                        {d.days_until_expiry} days left
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB: Due PDD Items */}
          {activeTab === 'pdd' && (
            <div>
              <h3 className="type-h3" style={{ margin: '0 0 16px', fontSize: '16px' }}>
                Post-Disbursal Documents (PDD) Due or Overdue ({data.pdd_items_due.length})
              </h3>
              {data.pdd_items_due.length === 0 ? (
                <div style={{ padding: 'var(--spacing-8)', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                  All post-disbursal items collected and submitted!
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {data.pdd_items_due.map((p) => (
                    <div
                      key={p.id}
                      style={{
                        padding: '12px 16px',
                        background: 'var(--color-surface-raised)',
                        border: '1px solid var(--color-border-light)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 600 }}>{p.title}</div>
                        <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
                          Type: {p.document_type} • Due Date: {p.due_date} {p.lender_name && `• Lender: ${p.lender_name}`}
                        </div>
                      </div>
                      <Link to="/pdd" style={{ color: 'var(--color-primary)', fontWeight: 600, fontSize: '12px' }}>
                        View in PDD Board →
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
