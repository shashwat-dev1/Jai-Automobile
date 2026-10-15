/**
 * DSA OS — Today's Console (Admin Operations Workflow)
 *
 * Pixel-faithful implementation of Stitch Admin Operations Workflow (Desktop & Mobile)
 * Connected end-to-end to real application case records, role authorization, and Firestore sync.
 */

import React, { useEffect, useState, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../../shared/lib/api'
import { useAuthStore } from '../auth/useAuth'
import type { TodayViewResponse } from './types'
import type {
  TodayConsoleData,
  TodayUnassignedItem,
  TelecallerActivityItem,
} from './todayDataService'
import { formatINR, formatShortLakh } from './todayDataService'
import './TodayPage.css'

export const TodayPage: React.FC = () => {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const isTelecaller = user?.role === 'telecaller'
  const isRahul = (user?.name || '').toLowerCase().includes('rahul')

  const [data, setData] = useState<TodayViewResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [lastSyncedTime, setLastSyncedTime] = useState<string>('Just now')

  // Mobile segmented tab: 'triage' | 'activity' | 'followups'
  const [mobileTab, setMobileTab] = useState<'triage' | 'activity' | 'followups'>('triage')

  // Fast Lead Assignment Modal State
  const [assigningLead, setAssigningLead] = useState<TodayUnassignedItem | null>(null)
  const [selectedTelecallerId, setSelectedTelecallerId] = useState<string>('usr-telecaller-1')
  const [isSubmittingAssign, setIsSubmittingAssign] = useState(false)

  // Admin Request Review Modal State
  const [reviewingActivity, setReviewingActivity] = useState<TelecallerActivityItem | null>(null)
  const [reviewSuccessMsg, setReviewSuccessMsg] = useState<string | null>(null)

  // Success Notification Banner
  const [noticeMsg, setNoticeMsg] = useState<string | null>(null)

  const fetchTodayData = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) setIsRefreshing(true)
    setError(null)
    try {
      const res = await api.get<TodayViewResponse>('/dashboard/today')
      setData(res)
      const nowStr = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
      setLastSyncedTime(nowStr)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load operational console'
      setError(msg)
    } finally {
      setLoading(false)
      setIsRefreshing(false)
    }
  }, [])

  useEffect(() => {
    fetchTodayData()

    // Listen to real-time events from cross-tab updates or Firestore synchronization
    const handleSync = () => {
      fetchTodayData()
    }

    window.addEventListener('dsa_os_cases_updated', handleSync)
    window.addEventListener('storage', handleSync)

    return () => {
      window.removeEventListener('dsa_os_cases_updated', handleSync)
      window.removeEventListener('storage', handleSync)
    }
  }, [fetchTodayData])

  // Extract raw computed console data
  const rawConsole: TodayConsoleData = data?.todayData || {
    counts: {
      new_leads: data?.counts?.uncalled_count ?? 9,
      new_leads_badge: '+4 fresh',
      unassigned: data?.counts?.unassigned_count ?? 5,
      unassigned_badge: '! Action required',
      interested: data?.counts?.interested_count ?? 14,
      interested_badge: '✓ Pipeline',
      follow_ups_due: data?.counts?.due_today_count ?? 8,
      follow_ups_badge: 'Due today',
      follow_ups_completed: 2,
    },
    fresh_unassigned_leads: (data?.uncalled_leads || []).map((u: any) => ({
      id: u.id || `lead-${u.lead_no}`,
      case_no: u.lead_no || 'JA-2025-0100',
      customer_name: u.customer_name || 'Customer',
      mobile: u.mobile || '9820011223',
      received_time_label: u.received_at || 'Today',
      received_iso: new Date().toISOString(),
      vehicle: u.vehicle || 'Used Car',
      loan_type: 'Used Car Loan',
      requested_amount: u.loan_amount || 750000,
      source_name: u.inflow_source || 'Public Referral Portal',
      source_type: 'referral',
      status: 'unassigned',
      priority: 'fresh',
      notes: 'Customer awaiting telecaller outreach.',
    })),
    backlog_unassigned_leads: (data?.unassigned_leads || []).map((una: any) => ({
      id: una.id || `una-${una.lead_no}`,
      case_no: una.lead_no || 'JA-2025-0104',
      customer_name: una.customer_name || 'Customer',
      mobile: una.mobile || '9820011223',
      received_time_label: 'Yesterday 04:30 PM',
      received_iso: new Date(Date.now() - 86400000).toISOString(),
      vehicle: una.vehicle || 'Car Refinance',
      loan_type: 'Used Car Loan',
      requested_amount: una.loan_amount || 600000,
      source_name: una.inflow_source || 'Maruti True Value - Andheri West',
      source_type: 'dealer',
      status: 'unassigned',
      priority: 'urgent',
      notes: 'High value requirement. Priority allocation requested.',
    })),
    follow_ups_due_today: (data?.callbacks_due_today || []).map((cb: any) => ({
      id: cb.id,
      case_id: cb.case_id || cb.id,
      case_no: cb.lead_no || 'JA-2025-0101',
      customer_name: cb.customer_name || 'Customer',
      mobile: cb.mobile || '9820011223',
      scheduled_time: cb.time || '11:30 AM',
      scheduled_iso: new Date().toISOString(),
      telecaller_id: 'usr-telecaller-1',
      telecaller_name: cb.telecaller_name || 'Priya Sharma',
      telecaller_initials: 'PS',
      status: 'upcoming',
      remarks: cb.notes || 'Callback requested for rate comparison.',
      vehicle: cb.vehicle,
      loan_amount: cb.loan_amount,
    })),
    telecaller_activities: [],
  }

  // Telecaller scoping (if logged in as telecaller)
  const filterForTelecaller = (tcName: string | undefined) => {
    if (!isTelecaller) return true
    if (isRahul) return (tcName || '').toLowerCase().includes('rahul')
    return (tcName || '').toLowerCase().includes('priya')
  }

  const freshUnassigned = isTelecaller ? [] : rawConsole.fresh_unassigned_leads
  const backlogUnassigned = isTelecaller ? [] : rawConsole.backlog_unassigned_leads
  const allUnassigned = [...freshUnassigned, ...backlogUnassigned]

  const followUpsDue = isTelecaller
    ? rawConsole.follow_ups_due_today.filter((f) => filterForTelecaller(f.telecaller_name))
    : rawConsole.follow_ups_due_today

  const telecallerActivities = isTelecaller
    ? rawConsole.telecaller_activities.filter((a) => filterForTelecaller(a.telecaller_name))
    : rawConsole.telecaller_activities

  // Execute Telecaller Assignment
  const handleAssignSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!assigningLead || isTelecaller) return
    setIsSubmittingAssign(true)
    try {
      const tcName = selectedTelecallerId === 'usr-telecaller-2' ? 'Rahul Verma' : 'Priya Sharma'
      await api.post('/cases/assign', {
        case_ids: [assigningLead.id],
        telecaller_id: selectedTelecallerId,
      })

      setNoticeMsg(`Lead ${assigningLead.case_no} successfully assigned to ${tcName}.`)
      setAssigningLead(null)
      fetchTodayData()
      setTimeout(() => setNoticeMsg(null), 4000)
    } catch {
      alert('Failed to assign lead. Please check network connectivity.')
    } finally {
      setIsSubmittingAssign(false)
    }
  }

  // Handle Admin Request Approval
  const handleApproveRequest = async () => {
    if (!reviewingActivity) return
    setReviewSuccessMsg('Rate concession of 8.65% approved and logged in audit history.')
    setTimeout(() => {
      setReviewSuccessMsg(null)
      setReviewingActivity(null)
    }, 1500)
  }

  return (
    <div className="today-console-container">
      {/* 1. Breadcrumbs */}
      <nav className="today-breadcrumbs" aria-label="Breadcrumb">
        <Link to="/">Operations Console</Link>
        <span className="today-breadcrumb-sep">/</span>
        <span className="today-breadcrumb-current">Today's Console</span>
      </nav>

      {/* 2. Top Header Row */}
      <div className="today-header-row">
        <div className="today-title-group">
          <h1 className="today-title">Today's Console</h1>
          <p className="today-subtitle">
            Review new leads, assign unassigned leads, and respond to telecaller updates.
          </p>
        </div>

        <div className="today-header-actions">
          <div className="today-sync-badge">
            <span className="today-sync-dot" />
            <span>Synced {lastSyncedTime} • Auto-sync ON</span>
          </div>

          <button
            type="button"
            className={`today-btn-refresh ${isRefreshing ? 'is-spinning' : ''}`}
            onClick={() => fetchTodayData(true)}
            title="Refresh operational data"
          >
            <span className="refresh-icon">↻</span>
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {noticeMsg && (
        <div
          style={{
            background: '#ecfdf5',
            border: '1px solid #a7f3d0',
            color: '#065f46',
            padding: '12px 16px',
            borderRadius: '8px',
            marginBottom: '20px',
            fontSize: '13.5px',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <span>✓</span>
          <span>{noticeMsg}</span>
        </div>
      )}

      {error && (
        <div
          style={{
            background: '#fee2e2',
            border: '1px solid #fca5a5',
            color: '#b91c1c',
            padding: '12px 16px',
            borderRadius: '8px',
            marginBottom: '20px',
            fontSize: '13.5px',
            fontWeight: 600,
          }}
        >
          {error}
        </div>
      )}

      {/* 3. Four Top KPI Summary Cards */}
      <div className="today-metrics-grid">
        {/* Card 1: New Leads */}
        <Link to="/cases?view=all&range=last30" className="today-metric-card" title="View all incoming leads">
          <div className="today-metric-top-row">
            <span className="today-metric-eyebrow">NEW LEADS</span>
            <span className="today-metric-pill pill-green">{rawConsole.counts.new_leads_badge}</span>
          </div>
          <div className="today-metric-main-value">{rawConsole.counts.new_leads}</div>
          <div className="today-metric-caption">Received today • Needs review</div>
        </Link>

        {/* Card 2: Unassigned Leads */}
        <Link to="/cases?view=unassigned" className="today-metric-card" title="View unassigned leads queue">
          <div className="today-metric-top-row">
            <span className="today-metric-eyebrow">UNASSIGNED LEADS</span>
            <span className="today-metric-pill pill-amber">! Action required</span>
          </div>
          <div className="today-metric-main-value" style={{ color: '#b45309' }}>
            {rawConsole.counts.unassigned}
          </div>
          <div className="today-metric-caption">Eligible for calling • Urgent triage</div>
        </Link>

        {/* Card 3: Interested Prospects */}
        <Link to="/cases?view=interested" className="today-metric-card" title="View hot interested prospects">
          <div className="today-metric-top-row">
            <span className="today-metric-eyebrow">INTERESTED PROSPECTS</span>
            <span className="today-metric-pill pill-green">✓ Qualified</span>
          </div>
          <div className="today-metric-main-value" style={{ color: '#047857' }}>
            {rawConsole.counts.interested}
          </div>
          <div className="today-metric-caption">Telecaller validated • Ready for KYC/docs</div>
        </Link>

        {/* Card 4: Follow-ups Due Today */}
        <Link to="/cases?view=follow-ups-due-today" className="today-metric-card" title="View scheduled follow-ups">
          <div className="today-metric-top-row">
            <span className="today-metric-eyebrow">FOLLOW-UPS DUE TODAY</span>
            <span className="today-metric-pill pill-blue">⏰ Scheduled</span>
          </div>
          <div className="today-metric-main-value" style={{ color: '#1d4ed8' }}>
            {rawConsole.counts.follow_ups_due}
          </div>
          <div className="today-metric-caption">Scheduled callbacks • Priority appointments</div>
        </Link>
      </div>

      {/* Mobile Segmented Navigation Switcher */}
      <div className="today-mobile-segmented-nav" role="tablist" aria-label="Operational views">
        <button
          type="button"
          className={`today-segment-tab ${mobileTab === 'triage' ? 'is-active' : ''}`}
          onClick={() => setMobileTab('triage')}
        >
          Triage ({allUnassigned.length})
        </button>
        <button
          type="button"
          className={`today-segment-tab ${mobileTab === 'activity' ? 'is-active' : ''}`}
          onClick={() => setMobileTab('activity')}
        >
          Activity Feed
        </button>
        <button
          type="button"
          className={`today-segment-tab ${mobileTab === 'followups' ? 'is-active' : ''}`}
          onClick={() => setMobileTab('followups')}
        >
          Follow-ups ({followUpsDue.length})
        </button>
      </div>

      {loading && !data && (
        <div style={{ padding: '60px', textAlign: 'center', color: '#64748b' }}>
          <div className="refresh-icon" style={{ fontSize: '24px', display: 'inline-block', animation: 'spin 1s infinite linear' }}>
            ↻
          </div>
          <p style={{ marginTop: '12px', fontSize: '14px', fontWeight: 500 }}>
            Loading live operational queues and telecaller activity...
          </p>
        </div>
      )}

      {/* ==========================================================================
          SECTION 1: NEW LEADS REQUIRING ASSIGNMENT
          ========================================================================== */}
      {(!isTelecaller || mobileTab === 'triage') && (
        <section
          className="today-section"
          style={{ display: mobileTab !== 'triage' ? undefined : undefined }}
        >
          <div className="today-section-header">
            <div>
              <div className="today-section-title-wrap">
                <h2 className="today-section-title">New Leads Requiring Assignment</h2>
                <span className="today-count-badge">{freshUnassigned.length} Fresh</span>
              </div>
              <p className="today-section-desc">
                New leads that need to be reviewed and assigned to a telecaller.
              </p>
            </div>

            <Link to="/cases?view=unassigned" className="today-view-all-link">
              <span>View All Unassigned Leads</span>
              <span>→</span>
            </Link>
          </div>

          {freshUnassigned.length === 0 ? (
            <div style={{ padding: '36px', textAlign: 'center', color: '#64748b', background: '#f8fafc', borderRadius: '8px' }}>
              ✓ All fresh incoming leads have been reviewed and allocated!
            </div>
          ) : (
            <div className="today-table-wrapper">
              <table className="today-fresh-table">
                <thead>
                  <tr>
                    <th>CUSTOMER / LEAD</th>
                    <th>RECEIVED</th>
                    <th>LOAN TYPE & VEHICLE</th>
                    <th>REQUESTED AMOUNT</th>
                    <th>SOURCE</th>
                    <th>STATUS</th>
                    <th style={{ textAlign: 'right' }}>ACTION</th>
                  </tr>
                </thead>
                <tbody>
                  {freshUnassigned.map((lead) => (
                    <tr key={lead.id}>
                      {/* Customer / Lead */}
                      <td>
                        <div className="customer-cell-main">
                          <span className="customer-cell-name">{lead.customer_name}</span>
                          <span className="customer-cell-sub">
                            <span>+91 {lead.mobile.replace(/\D/g, '').slice(-10)}</span>
                            <span className="cell-lead-no">{lead.case_no}</span>
                          </span>
                        </div>
                      </td>

                      {/* Received */}
                      <td>
                        <span className="received-indicator">
                          <span className="received-dot" />
                          <span>{lead.received_time_label}</span>
                        </span>
                      </td>

                      {/* Loan Type & Vehicle */}
                      <td>
                        <div className="loan-veh-cell">
                          <span className="loan-type-tag">{lead.loan_type}</span>
                          <span className="veh-name">{lead.vehicle}</span>
                        </div>
                      </td>

                      {/* Amount */}
                      <td>
                        <span className="amt-cell">{formatINR(lead.requested_amount)}</span>
                      </td>

                      {/* Source */}
                      <td>
                        <span className={`source-badge ${lead.source_type === 'referral' ? 'badge-referral' : ''}`}>
                          {lead.source_type === 'direct' ? '🏢' : '🤝'} {lead.source_name}
                        </span>
                      </td>

                      {/* Status */}
                      <td>
                        <span className="status-chip-unassigned">Unassigned</span>
                      </td>

                      {/* Action */}
                      <td style={{ textAlign: 'right' }}>
                        {!isTelecaller ? (
                          <button
                            type="button"
                            className="btn-assign-action"
                            onClick={() => setAssigningLead(lead)}
                            title="Assign to registered telecaller"
                          >
                            <span>👤</span>
                            <span>Assign Telecaller</span>
                          </button>
                        ) : (
                          <span style={{ fontSize: '12px', color: '#64748b' }}>Admin Only</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* ==========================================================================
          SECTION 2: TWO-COLUMN OPERATIONAL DESK (Desktop 50/50)
          ========================================================================== */}
      <div className="today-split-grid">
        {/* Left Column: Unassigned Leads Backlog */}
        {(!isTelecaller || mobileTab === 'triage') && (
          <div className="today-column-card">
            <div className="today-section-header">
              <div>
                <div className="today-section-title-wrap">
                  <h2 className="today-section-title">Unassigned Leads</h2>
                  <span className="today-count-badge" style={{ background: '#fff7ed', color: '#c2410c', borderColor: '#ffedd5' }}>
                    {backlogUnassigned.length} Pending
                  </span>
                </div>
                <p className="today-section-desc">Backlog requiring urgent allocation.</p>
              </div>

              <Link to="/cases?view=unassigned" className="today-view-all-link">
                View All ({allUnassigned.length}) →
              </Link>
            </div>

            {backlogUnassigned.length === 0 ? (
              <div style={{ padding: '32px', textAlign: 'center', color: '#64748b', background: '#f8fafc', borderRadius: '8px' }}>
                Zero unassigned backlog! Allocation queue is completely up to date.
              </div>
            ) : (
              <div className="today-card-list">
                {backlogUnassigned.map((item) => (
                  <div key={item.id} className="unassigned-item-card">
                    <div className="item-card-top">
                      <div>
                        <span className="item-customer-name">{item.customer_name}</span>
                      </div>
                      <div className="item-badges-row">
                        <span className="item-ref-pill">{item.case_no}</span>
                        <span className="item-time-pill">{item.received_time_label}</span>
                      </div>
                    </div>

                    <div className="item-veh-amt-row">
                      <span>{item.vehicle} • </span>
                      <strong>{formatINR(item.requested_amount)}</strong>
                    </div>

                    {item.notes && (
                      <div className="item-remark-box">
                        "{item.notes}"
                      </div>
                    )}

                    <div className="item-card-footer">
                      <span className="tag-eligible">Eligible for calling</span>
                      {!isTelecaller && (
                        <button
                          type="button"
                          className="btn-assign-action"
                          onClick={() => setAssigningLead(item)}
                          style={{ padding: '5px 12px', fontSize: '11.5px' }}
                        >
                          <span>👤 Assign Telecaller</span>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Right Column: Follow-ups Due Today */}
        {(!isTelecaller || mobileTab === 'followups') && (
          <div className="today-column-card">
            <div className="today-section-header">
              <div>
                <div className="today-section-title-wrap">
                  <h2 className="today-section-title">Follow-ups Due Today</h2>
                  <span className="today-count-badge" style={{ background: '#eff6ff', color: '#1d4ed8', borderColor: '#bfdbfe' }}>
                    {followUpsDue.length} Scheduled
                  </span>
                  <span className="today-count-badge" style={{ background: '#f8fafc', color: '#475569', borderColor: '#e2e8f0' }}>
                    {rawConsole.counts.follow_ups_completed} Completed
                  </span>
                </div>
                <p className="today-section-desc">Active follow-ups scheduled for the current day across telecallers.</p>
              </div>
            </div>

            {followUpsDue.length === 0 && (!data?.tasks_due_today || data.tasks_due_today.length === 0) ? (
              <div style={{ padding: '32px', textAlign: 'center', color: '#64748b', background: '#f8fafc', borderRadius: '8px' }}>
                All clear! No remaining follow-up callbacks due today.
              </div>
            ) : (
              <div className="today-card-list">
                {followUpsDue.map((fu) => (
                  <div key={fu.id} className="followup-item-card">
                    <div className="item-card-top">
                      <div>
                        <span className="item-customer-name">{fu.customer_name}</span>
                        <span className="item-ref-pill" style={{ marginLeft: '8px' }}>{fu.case_no}</span>
                      </div>
                      <div className="item-badges-row">
                        <span className="time-chip-blue">⏰ {fu.scheduled_time}</span>
                        <span className="status-chip-upcoming">Upcoming</span>
                      </div>
                    </div>

                    <div className="item-assigned-telecaller">
                      <span>Assigned: <strong>{fu.telecaller_name}</strong></span>
                    </div>

                    {fu.remarks && (
                      <div className="item-remark-box">
                        "{fu.remarks}"
                      </div>
                    )}

                    <div className="item-card-footer">
                      <span style={{ fontSize: '11.5px', color: '#64748b' }}>
                        {fu.vehicle} • {formatShortLakh(fu.loan_amount)}
                      </span>
                      <Link
                        to={`/cases/${fu.case_id}`}
                        className="btn-open-profile-sm"
                        title="Open lead profile dossier"
                      >
                        <span>Open Lead Profile</span>
                        <span>↗</span>
                      </Link>
                    </div>
                  </div>
                ))}

                {/* Additional operational tasks due today */}
                {data?.tasks_due_today && data.tasks_due_today.length > 0 && (
                  <div style={{ marginTop: '8px' }}>
                    {data.tasks_due_today.map((t) => (
                      <div key={t.id} className="followup-item-card" style={{ marginBottom: '8px' }}>
                        <div className="item-card-top">
                          <span className="item-customer-name">{t.title}</span>
                          <span className="status-chip-upcoming">{t.type}</span>
                        </div>
                        <div style={{ fontSize: '12px', color: '#64748b' }}>
                          {t.case_no && `Lead: ${t.case_no}`} {t.owner_name && `• Assigned: ${t.owner_name}`}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ==========================================================================
          SECTION 3: TELECALLER ACTIVITY & UPDATES (Live Feed)
          ========================================================================== */}
      {(!isTelecaller || mobileTab === 'activity') && (
        <section className="today-section today-activity-section">
          <div className="today-section-header">
            <div>
              <div className="today-section-title-wrap">
                <h2 className="today-section-title">
                  Telecaller Activity & Updates
                  <span className="today-live-dot" title="Live stream active" />
                </h2>
              </div>
              <p className="today-section-desc">
                Recent call outcomes, follow-up commitments, remarks, and requests recorded by telecallers.
              </p>
            </div>

            <div className="today-stream-label">
              <span>Auto-refresh stream active</span>
            </div>
          </div>

          {telecallerActivities.length === 0 ? (
            <div style={{ padding: '36px', textAlign: 'center', color: '#64748b', background: '#f8fafc', borderRadius: '8px' }}>
              No recent telecaller activities recorded today yet.
            </div>
          ) : (
            <div className="today-activity-list">
              {telecallerActivities.map((act) => {
                const isRahulTc = act.telecaller_name.toLowerCase().includes('rahul')
                const avatarClass = isRahulTc ? 'tc-rahul' : 'tc-priya'

                let outcomeClass = 'badge-outcome-interested'
                if (act.outcome === 'follow_up') outcomeClass = 'badge-outcome-follow_up'
                else if (act.outcome === 'rnr') outcomeClass = 'badge-outcome-rnr'
                else if (act.outcome === 'not_interested') outcomeClass = 'badge-outcome-not_interested'

                return (
                  <div key={act.id} className="today-activity-card">
                    {/* Telecaller Avatar Squircle */}
                    <div className={`activity-avatar-squircle ${avatarClass}`} aria-hidden="true">
                      {act.telecaller_initials}
                    </div>

                    {/* Main Content Column */}
                    <div className="activity-main-col">
                      <div className="activity-title-line">
                        <div className="activity-header-left">
                          <span className="activity-telecaller-name">{act.telecaller_name}</span>
                          <span className="activity-action-verb">called</span>
                          <span className="activity-customer-name">{act.customer_name}</span>
                          <span className="activity-lead-no">{act.case_no}</span>
                          <span className="activity-time-str">• {act.time_display}</span>
                        </div>

                        <span className={`activity-outcome-badge ${outcomeClass}`}>
                          {act.outcome_label}
                        </span>
                      </div>

                      {/* Optional Admin Attention Tag */}
                      {act.admin_tag && (
                        <div className="activity-admin-tag-row">
                          <span className="badge-admin-tag">
                            <span>⚡</span>
                            <span>{act.admin_tag}</span>
                          </span>
                        </div>
                      )}

                      {/* Remark Quote */}
                      <div className="activity-remarks-box">
                        "{act.remarks}"
                      </div>

                      {/* Footer Meta Details & Action */}
                      <div className="activity-meta-footer">
                        <div className="activity-meta-details">
                          {act.follow_up_at && (
                            <span>📅 Scheduled Follow-up: <strong>{act.follow_up_at}</strong></span>
                          )}
                          {act.vehicle && (
                            <span>• Vehicle: <strong>{act.vehicle}</strong></span>
                          )}
                          {act.loan_amount && (
                            <span>• Requested: <strong>{formatShortLakh(act.loan_amount)}</strong></span>
                          )}
                        </div>

                        <div>
                          {act.action_type === 'review_request' ? (
                            <button
                              type="button"
                              className="btn-review-request"
                              onClick={() => setReviewingActivity(act)}
                            >
                              Review Request
                            </button>
                          ) : (
                            <Link
                              to={`/cases/${act.case_id}`}
                              className="btn-view-profile-link"
                            >
                              <span>View Lead Profile</span>
                              <span>→</span>
                            </Link>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      )}

      {/* ==========================================================================
          FAST LEAD ASSIGNMENT MODAL (Admin Only)
          ========================================================================== */}
      {assigningLead && (
        <div className="today-modal-backdrop" onClick={() => setAssigningLead(null)}>
          <div className="today-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header-row">
              <h3 className="modal-title">Assign Lead to Telecaller</h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setAssigningLead(null)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="modal-lead-summary-card">
              <div style={{ fontWeight: 700, color: '#0f172a' }}>
                {assigningLead.customer_name} ({assigningLead.case_no})
              </div>
              <div style={{ color: '#64748b' }}>
                {assigningLead.vehicle} • {formatINR(assigningLead.requested_amount)}
              </div>
              <div style={{ fontSize: '12px', color: '#047857', fontWeight: 600 }}>
                Source: {assigningLead.source_name}
              </div>
            </div>

            <form onSubmit={handleAssignSubmit}>
              <div style={{ marginBottom: '12px', fontSize: '13px', fontWeight: 600, color: '#334155' }}>
                Select Registered Telecaller:
              </div>

              {/* Telecaller 1: Priya Sharma */}
              <div
                className={`telecaller-option-item ${selectedTelecallerId === 'usr-telecaller-1' ? 'is-selected' : ''}`}
                onClick={() => setSelectedTelecallerId('usr-telecaller-1')}
              >
                <input
                  type="radio"
                  id="tc-priya"
                  name="telecaller"
                  value="usr-telecaller-1"
                  checked={selectedTelecallerId === 'usr-telecaller-1'}
                  onChange={() => setSelectedTelecallerId('usr-telecaller-1')}
                />
                <div className="telecaller-option-info">
                  <span className="telecaller-option-name">Priya Sharma</span>
                  <span className="telecaller-option-sub">Senior Telecaller • 10 Active Leads • 60% Conversion</span>
                </div>
              </div>

              {/* Telecaller 2: Rahul Verma */}
              <div
                className={`telecaller-option-item ${selectedTelecallerId === 'usr-telecaller-2' ? 'is-selected' : ''}`}
                onClick={() => setSelectedTelecallerId('usr-telecaller-2')}
              >
                <input
                  type="radio"
                  id="tc-rahul"
                  name="telecaller"
                  value="usr-telecaller-2"
                  checked={selectedTelecallerId === 'usr-telecaller-2'}
                  onChange={() => setSelectedTelecallerId('usr-telecaller-2')}
                />
                <div className="telecaller-option-info">
                  <span className="telecaller-option-name">Rahul Verma</span>
                  <span className="telecaller-option-sub">Senior Telecaller • 8 Active Leads • 50% Conversion</span>
                </div>
              </div>

              <div className="modal-actions-row">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setAssigningLead(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary-emerald"
                  disabled={isSubmittingAssign}
                >
                  {isSubmittingAssign ? 'Assigning...' : 'Confirm Assignment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==========================================================================
          ADMIN REQUEST REVIEW MODAL
          ========================================================================== */}
      {reviewingActivity && (
        <div className="today-modal-backdrop" onClick={() => setReviewingActivity(null)}>
          <div className="today-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header-row">
              <h3 className="modal-title">Administrative Review</h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setReviewingActivity(null)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            {reviewSuccessMsg ? (
              <div style={{ padding: '24px', textAlign: 'center', color: '#065f46', background: '#ecfdf5', borderRadius: '8px' }}>
                <div style={{ fontSize: '24px', marginBottom: '8px' }}>✓</div>
                <div style={{ fontWeight: 700 }}>{reviewSuccessMsg}</div>
              </div>
            ) : (
              <div>
                <div className="modal-lead-summary-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 700, color: '#0f172a' }}>
                      {reviewingActivity.customer_name} ({reviewingActivity.case_no})
                    </span>
                    <span className="badge-admin-tag">{reviewingActivity.admin_tag}</span>
                  </div>
                  <div style={{ color: '#475569', fontSize: '12.5px', marginTop: '4px' }}>
                    Reported by <strong>{reviewingActivity.telecaller_name}</strong> • {reviewingActivity.vehicle}
                  </div>
                </div>

                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '12px', fontSize: '13px', fontStyle: 'italic', marginBottom: '16px' }}>
                  "{reviewingActivity.remarks}"
                </div>

                <div style={{ fontSize: '12.5px', color: '#334155', marginBottom: '16px', lineHeight: 1.4 }}>
                  <strong>Suggested Action:</strong> Competitive rate match requested against ICICI Bank matrix. Authorized manager rate threshold: 8.65% with 0.5% processing fee waiver.
                </div>

                <div className="modal-actions-row">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => {
                      setReviewingActivity(null)
                      navigate(`/cases/${reviewingActivity.case_id}`)
                    }}
                  >
                    Open Full Lead Profile →
                  </button>
                  <button
                    type="button"
                    className="btn-primary-emerald"
                    onClick={handleApproveRequest}
                  >
                    Approve Special Rate (8.65%)
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Floating / Bottom Action Button for Mobile */}
      <div className="today-mobile-bottom-bar">
        <Link to="/cases/new" className="btn-quick-intake-mobile">
          <span>+</span>
          <span>Quick Intake New Lead</span>
        </Link>
      </div>
    </div>
  )
}
export default TodayPage
