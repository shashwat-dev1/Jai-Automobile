import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../shared/lib/api'
import { TodayViewResponse } from './types'

import { useAuthStore } from '../auth/useAuth'

export const TodayPage: React.FC = () => {
  const user = useAuthStore((s) => s.user)
  const isTelecaller = user?.role === 'telecaller'
  const myName = (user?.name || '').toLowerCase()
  const isRahul = myName.includes('rahul')

  const [data, setData] = useState<TodayViewResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<string>('due_today')

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

  const rawData: any = data || {}
  const rawCallbacks = rawData.callbacks_due_today || []
  const rawInterested = rawData.interested_prospects || []
  const rawRetries = rawData.retry_leads || []
  const rawTasks = data?.tasks_due_today || []

  const callbacks = isTelecaller
    ? rawCallbacks.filter((c: any) =>
        isRahul
          ? c.telecaller_name?.toLowerCase().includes('rahul')
          : c.telecaller_name?.toLowerCase().includes('priya')
      )
    : rawCallbacks

  const uncalled = isTelecaller ? [] : rawData.uncalled_leads || []
  const unassigned = isTelecaller ? [] : rawData.unassigned_leads || []

  const interested = isTelecaller
    ? rawInterested.filter((c: any) =>
        isRahul
          ? c.telecaller_name?.toLowerCase().includes('rahul')
          : c.telecaller_name?.toLowerCase().includes('priya')
      )
    : rawInterested

  const retries = isTelecaller
    ? rawRetries.filter((c: any) =>
        isRahul
          ? c.telecaller_name?.toLowerCase().includes('rahul')
          : c.telecaller_name?.toLowerCase().includes('priya')
      )
    : rawRetries

  const tasksDue = isTelecaller
    ? rawTasks.filter((t: any) =>
        isRahul
          ? t.owner_name?.toLowerCase().includes('rahul')
          : t.owner_name?.toLowerCase().includes('priya')
      )
    : rawTasks

  return (
    <div style={{ padding: '24px', maxWidth: 1280, margin: '0 auto', background: '#f8fafc', minHeight: '100vh' }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: '20px',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <Link to="/" style={{ color: '#475569', textDecoration: 'none', fontSize: '12px', fontWeight: 600 }}>
              ← Lead Operations Console
            </Link>
          </div>
          <h1 className="type-h1" style={{ margin: '0', fontSize: '22px', fontWeight: 700, color: '#0f172a' }}>
            Daily Execution Cockpit (Today)
          </h1>
          <p className="type-body-md" style={{ color: '#475569', margin: '4px 0 0', fontSize: '13px' }}>
            Scheduled callbacks due today, uncalled fresh cold leads, hot interested prospects, and telecaller assignment queues.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <Link
            to="/telecaller"
            style={{
              background: '#0f172a',
              color: '#ffffff',
              border: '1px solid #0f172a',
              padding: '6px 14px',
              fontSize: '13px',
              fontWeight: 600,
              borderRadius: '4px',
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            🎧 Open Telecaller Workspace →
          </Link>

          <Link
            to="/cases"
            style={{
              background: '#ffffff',
              border: '1px solid #cbd5e1',
              color: '#0f172a',
              padding: '6px 14px',
              fontSize: '13px',
              fontWeight: 600,
              borderRadius: '4px',
              textDecoration: 'none',
            }}
          >
            📥 Inflow Cold Leads →
          </Link>

          <button
            onClick={fetchToday}
            style={{
              background: '#ffffff',
              border: '1px solid #cbd5e1',
              color: '#0f172a',
              padding: '6px 14px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              borderRadius: '4px',
            }}
          >
            ↻ Refresh
          </button>
        </div>
      </div>

      {error && (
        <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', color: '#b91c1c', padding: '12px 16px', marginBottom: '16px', borderRadius: '4px' }}>
          {error}
        </div>
      )}

      {/* KPI Counters Strip */}
      {data && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '12px',
            marginBottom: '20px',
          }}
        >
          {[
            {
              id: 'due_today',
              label: 'Callbacks Due Today',
              count: data.counts.due_today_count ?? callbacks.length,
              color: '#2563eb',
            },
            {
              id: 'uncalled',
              label: 'Uncalled Fresh Leads',
              count: (data.counts as any).uncalled_count ?? uncalled.length ?? 9,
              color: '#0f172a',
            },
            {
              id: 'interested',
              label: 'Interested Prospects',
              count: (data.counts as any).interested_count ?? interested.length ?? 14,
              color: '#059669',
            },
            {
              id: 'unassigned',
              label: 'Unassigned Queue',
              count: (data.counts as any).unassigned_count ?? unassigned.length ?? 5,
              color: '#d97706',
            },
            {
              id: 'retry',
              label: 'Retry Callbacks',
              count: (data.counts as any).retry_count ?? retries.length ?? 6,
              color: '#dc2626',
            },
          ].map((c) => {
            const isSelected = activeTab === c.id
            return (
              <div
                key={c.id}
                id={`tab-${c.id}`}
                onClick={() => setActiveTab(c.id)}
                style={{
                  background: '#ffffff',
                  border: isSelected ? `2px solid ${c.color}` : '1px solid #cbd5e1',
                  borderLeft: `4px solid ${c.color}`,
                  padding: '14px 16px',
                  cursor: 'pointer',
                  borderRadius: '6px',
                  boxShadow: isSelected ? '0 2px 6px rgba(0,0,0,0.08)' : '0 1px 3px rgba(0,0,0,0.04)',
                  transition: 'all 0.15s ease',
                }}
              >
                <div style={{ color: '#475569', textTransform: 'uppercase', fontSize: '11px', fontWeight: 600, letterSpacing: '0.04em' }}>
                  {c.label}
                </div>
                <div style={{ fontSize: '24px', fontWeight: 700, margin: '6px 0 2px', color: c.color, fontFamily: 'monospace' }}>
                  {c.count}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {loading && !data && (
        <div style={{ padding: '48px', textAlign: 'center', color: '#475569' }}>
          Loading daily telecalling and lead operational queues...
        </div>
      )}

      {/* Tab Panels */}
      {data && (
        <div style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          {/* TAB 1: Scheduled Callbacks Due Today */}
          {activeTab === 'due_today' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div>
                  <h3 className="type-h3" style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>
                    Scheduled Callbacks Due Today ({callbacks.length + tasksDue.length})
                  </h3>
                  <div style={{ fontSize: '12px', color: '#475569', marginTop: '2px' }}>
                    Appointments booked by telecallers requiring telephone follow-up today.
                  </div>
                </div>
                <Link to="/telecaller" style={{ fontSize: '12px', fontWeight: 600, color: '#2563eb' }}>
                  Open Full Dialer Desk →
                </Link>
              </div>

              {callbacks.length === 0 && tasksDue.length === 0 ? (
                <div style={{ padding: '32px', textAlign: 'center', color: '#475569' }}>
                  All clear! No pending scheduled callbacks due today.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {callbacks.map((cb: any) => (
                    <div
                      key={cb.id}
                      style={{
                        padding: '14px 18px',
                        background: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        borderRadius: '6px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px' }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontWeight: 700, fontSize: '14px', color: '#0f172a' }}>{cb.customer_name}</span>
                            <span style={{ background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', padding: '1px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 600 }}>
                              ⏰ {cb.time}
                            </span>
                            <span style={{ fontFamily: 'monospace', fontSize: '11px', color: '#475569', background: '#f1f5f9', padding: '1px 6px', borderRadius: '4px' }}>
                              {cb.lead_no}
                            </span>
                          </div>
                          <div style={{ fontSize: '12px', color: '#475569', marginTop: '4px' }}>
                            Vehicle: <b>{cb.vehicle}</b> • Requested: <b>₹{Number(cb.loan_amount).toLocaleString('en-IN')}</b> • Telecaller: <b>{cb.telecaller_name}</b>
                          </div>
                        </div>

                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <a
                            href={`tel:${cb.mobile}`}
                            style={{
                              background: '#059669',
                              color: '#ffffff',
                              padding: '6px 12px',
                              borderRadius: '4px',
                              fontSize: '12px',
                              fontWeight: 600,
                              textDecoration: 'none',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                            }}
                          >
                            📞 Dial {cb.mobile}
                          </a>
                          <Link
                            to="/telecaller"
                            style={{
                              background: '#0f172a',
                              color: '#ffffff',
                              padding: '6px 12px',
                              borderRadius: '4px',
                              fontSize: '12px',
                              fontWeight: 600,
                              textDecoration: 'none',
                            }}
                          >
                            Open in Desk →
                          </Link>
                        </div>
                      </div>

                      {cb.notes && (
                        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '4px', padding: '8px 12px', fontSize: '12px', color: '#334155', fontStyle: 'italic' }}>
                          💬 "{cb.notes}"
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Render any additional tasks due */}
                  {tasksDue.map((t) => (
                    <div
                      key={t.id}
                      style={{
                        padding: '12px 16px',
                        background: '#ffffff',
                        border: '1px solid #e2e8f0',
                        borderRadius: '6px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: '8px',
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 600, color: '#0f172a', fontSize: '13px' }}>{t.title}</div>
                        <div style={{ fontSize: '12px', color: '#475569', marginTop: '2px' }}>
                          Type: {t.type} {t.case_no && `• Lead: ${t.case_no}`} {t.owner_name && `• Assigned: ${t.owner_name}`}
                        </div>
                      </div>
                      <Link to="/telecaller" style={{ color: '#2563eb', fontWeight: 600, fontSize: '12px', textDecoration: 'none' }}>
                        View in Workspace →
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: Uncalled Fresh Leads */}
          {activeTab === 'uncalled' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div>
                  <h3 className="type-h3" style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>
                    Uncalled Fresh Leads Inflow ({uncalled.length})
                  </h3>
                  <div style={{ fontSize: '12px', color: '#475569', marginTop: '2px' }}>
                    Incoming leads from bulk imports and public referral portals waiting for initial outreach call.
                  </div>
                </div>
                <Link to="/cases" style={{ fontSize: '12px', fontWeight: 600, color: '#2563eb' }}>
                  Manage Leads Inflow →
                </Link>
              </div>

              {uncalled.length === 0 ? (
                <div style={{ padding: '32px', textAlign: 'center', color: '#475569' }}>
                  No uncalled fresh leads pending in queue.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {uncalled.map((u: any) => (
                    <div
                      key={u.id}
                      style={{
                        padding: '14px 18px',
                        background: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        borderRadius: '6px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: '12px',
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontWeight: 700, fontSize: '14px', color: '#0f172a' }}>{u.customer_name}</span>
                          <span style={{ background: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1', padding: '1px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 600 }}>
                            {u.inflow_source}
                          </span>
                          <span style={{ fontSize: '11px', color: '#d97706', fontWeight: 600 }}>
                            ⏱ {u.received_at}
                          </span>
                        </div>
                        <div style={{ fontSize: '12px', color: '#475569', marginTop: '4px' }}>
                          Vehicle: <b>{u.vehicle}</b> • Amount: <b>₹{Number(u.loan_amount).toLocaleString('en-IN')}</b> • City: <b>{u.city}</b>
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '8px' }}>
                        <a
                          href={`tel:${u.mobile}`}
                          style={{
                            background: '#059669',
                            color: '#ffffff',
                            padding: '6px 12px',
                            borderRadius: '4px',
                            fontSize: '12px',
                            fontWeight: 600,
                            textDecoration: 'none',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          📞 Start First Call
                        </a>
                        <Link
                          to="/telecaller"
                          style={{
                            background: '#0f172a',
                            color: '#ffffff',
                            padding: '6px 12px',
                            borderRadius: '4px',
                            fontSize: '12px',
                            fontWeight: 600,
                            textDecoration: 'none',
                          }}
                        >
                          Assign Desk →
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: Hot Interested Prospects (Client Ready) */}
          {activeTab === 'interested' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div>
                  <h3 className="type-h3" style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#059669' }}>
                    Hot Interested Prospects Awaiting Client Conversion ({interested.length})
                  </h3>
                  <div style={{ fontSize: '12px', color: '#475569', marginTop: '2px' }}>
                    Prospects confirmed interest during telecalling and are ready for KYC intake and client account onboarding.
                  </div>
                </div>
                <Link to="/cases" style={{ fontSize: '12px', fontWeight: 600, color: '#059669' }}>
                  View All Cases →
                </Link>
              </div>

              {interested.length === 0 ? (
                <div style={{ padding: '32px', textAlign: 'center', color: '#475569' }}>
                  No hot interested prospects currently in qualification queue.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {interested.map((p: any) => (
                    <div
                      key={p.id}
                      style={{
                        padding: '14px 18px',
                        background: '#f8fafc',
                        border: '1px solid #a7f3d0',
                        borderRadius: '6px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px' }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontWeight: 700, fontSize: '14px', color: '#0f172a' }}>{p.customer_name}</span>
                            <span style={{ background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0', padding: '1px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 700 }}>
                              CLIENT READY
                            </span>
                            <span style={{ fontFamily: 'monospace', fontSize: '11px', color: '#475569' }}>
                              {p.lead_no}
                            </span>
                          </div>
                          <div style={{ fontSize: '12px', color: '#475569', marginTop: '4px' }}>
                            Vehicle: <b>{p.vehicle}</b> • Amount: <b>₹{Number(p.loan_amount).toLocaleString('en-IN')}</b> • Telecaller: <b>{p.telecaller_name}</b>
                          </div>
                        </div>

                        <div style={{ display: 'flex', gap: '8px' }}>
                          <Link
                            to={`/cases/${p.case_id || p.id}`}
                            style={{
                              background: '#059669',
                              color: '#ffffff',
                              padding: '6px 14px',
                              borderRadius: '4px',
                              fontSize: '12px',
                              fontWeight: 600,
                              textDecoration: 'none',
                            }}
                          >
                            Convert to Client Account →
                          </Link>
                          <a
                            href={`tel:${p.mobile}`}
                            style={{
                              background: '#ffffff',
                              border: '1px solid #cbd5e1',
                              color: '#0f172a',
                              padding: '6px 12px',
                              borderRadius: '4px',
                              fontSize: '12px',
                              fontWeight: 600,
                              textDecoration: 'none',
                            }}
                          >
                            📞 Call
                          </a>
                        </div>
                      </div>

                      {p.notes && (
                        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '4px', padding: '8px 12px', fontSize: '12px', color: '#334155', fontStyle: 'italic' }}>
                          💬 "{p.notes}"
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: Unassigned Queue */}
          {activeTab === 'unassigned' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div>
                  <h3 className="type-h3" style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#d97706' }}>
                    Unassigned Inflow Pool ({unassigned.length})
                  </h3>
                  <div style={{ fontSize: '12px', color: '#475569', marginTop: '2px' }}>
                    Leads in pool needing immediate telecaller assignment to prevent SLA breach.
                  </div>
                </div>
                <Link to="/telecaller" style={{ fontSize: '12px', fontWeight: 600, color: '#2563eb' }}>
                  Assign in Bulk →
                </Link>
              </div>

              {unassigned.length === 0 ? (
                <div style={{ padding: '32px', textAlign: 'center', color: '#475569' }}>
                  All leads have been successfully assigned to telecaller desks!
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {unassigned.map((una: any) => (
                    <div
                      key={una.id}
                      style={{
                        padding: '14px 18px',
                        background: '#f8fafc',
                        border: '1px solid #fed7aa',
                        borderRadius: '6px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: '12px',
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontWeight: 700, fontSize: '14px', color: '#0f172a' }}>{una.customer_name}</span>
                          <span style={{ background: '#fff7ed', color: '#c2410c', border: '1px solid #ffedd5', padding: '1px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 600 }}>
                            UNASSIGNED
                          </span>
                        </div>
                        <div style={{ fontSize: '12px', color: '#475569', marginTop: '4px' }}>
                          Vehicle: <b>{una.vehicle}</b> • Amount: <b>₹{Number(una.loan_amount).toLocaleString('en-IN')}</b> • Source: <b>{una.inflow_source}</b>
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '8px' }}>
                        <Link
                          to="/telecaller"
                          style={{
                            background: '#0f172a',
                            color: '#ffffff',
                            padding: '6px 12px',
                            borderRadius: '4px',
                            fontSize: '12px',
                            fontWeight: 600,
                            textDecoration: 'none',
                          }}
                        >
                          Assign to Priya Sharma
                        </Link>
                        <Link
                          to="/telecaller"
                          style={{
                            background: '#ffffff',
                            border: '1px solid #cbd5e1',
                            color: '#0f172a',
                            padding: '6px 12px',
                            borderRadius: '4px',
                            fontSize: '12px',
                            fontWeight: 600,
                            textDecoration: 'none',
                          }}
                        >
                          Assign to Rahul Verma
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 5: Retry Queue */}
          {activeTab === 'retry' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div>
                  <h3 className="type-h3" style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#dc2626' }}>
                    Retry Callbacks Queue ({retries.length})
                  </h3>
                  <div style={{ fontSize: '12px', color: '#475569', marginTop: '2px' }}>
                    Leads previously marked Ringing No Response or Call Busy requiring 2nd or 3rd dial attempt.
                  </div>
                </div>
                <Link to="/telecaller" style={{ fontSize: '12px', fontWeight: 600, color: '#2563eb' }}>
                  Open Dialer →
                </Link>
              </div>

              {retries.length === 0 ? (
                <div style={{ padding: '32px', textAlign: 'center', color: '#475569' }}>
                  No leads pending re-dial in the retry queue.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {retries.map((r: any) => (
                    <div
                      key={r.id}
                      style={{
                        padding: '14px 18px',
                        background: '#f8fafc',
                        border: '1px solid #fecaca',
                        borderRadius: '6px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: '12px',
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontWeight: 700, fontSize: '14px', color: '#0f172a' }}>{r.customer_name}</span>
                          <span style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', padding: '1px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 700 }}>
                            {r.outcome}
                          </span>
                          <span style={{ fontSize: '11px', color: '#475569' }}>
                            Attempt {r.attempt_count} of 3
                          </span>
                        </div>
                        <div style={{ fontSize: '12px', color: '#475569', marginTop: '4px' }}>
                          Last dial: <b>{r.last_attempt}</b> • Desk: <b>{r.telecaller_name}</b>
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '8px' }}>
                        <a
                          href={`tel:${r.mobile}`}
                          style={{
                            background: '#dc2626',
                            color: '#ffffff',
                            padding: '6px 14px',
                            borderRadius: '4px',
                            fontSize: '12px',
                            fontWeight: 600,
                            textDecoration: 'none',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          📞 Re-dial Now ({r.mobile})
                        </a>
                        <Link
                          to="/telecaller"
                          style={{
                            background: '#ffffff',
                            border: '1px solid #cbd5e1',
                            color: '#0f172a',
                            padding: '6px 12px',
                            borderRadius: '4px',
                            fontSize: '12px',
                            fontWeight: 600,
                            textDecoration: 'none',
                          }}
                        >
                          Open Workspace →
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Legacy tab fallback: Stuck cases */}
          {activeTab === 'stuck' && (
            <div>
              <h3 className="type-h3" style={{ margin: '0 0 16px', fontSize: '16px' }}>
                Stuck Lead Files ({data.stuck_cases?.length || 0})
              </h3>
              {(data.stuck_cases?.length || 0) === 0 ? (
                <div style={{ padding: '24px', textAlign: 'center', color: '#475569' }}>
                  Zero stuck leads! Pipeline velocity healthy.
                </div>
              ) : (
                data.stuck_cases.map((c) => (
                  <div key={c.case_id} style={{ padding: '12px', border: '1px solid #cbd5e1', marginBottom: '8px' }}>
                    <div style={{ fontWeight: 700 }}>{c.case_no}</div>
                    <div>Stage: {c.stage} • Ageing: {c.ageing_hours} hrs</div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

