import React, { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, ApiError } from '../../shared/lib/api'
import { useAuthStore } from '../auth/useAuth'
import { formatINR } from '../../shared/lib/formatters'
import Button from '../../shared/components/Button'
import './DashboardPage.css'
import './TelecallerDashboard.css'

interface AssignedLeadItem {
  id: string
  case_no: string
  applicant_name: string
  primary_applicant_name?: string
  mobile: string
  primary_applicant_mobile?: string
  product_type: string
  loan_amount_requested: number
  vehicle_summary: string
  vehicle_details?: string
  source_name: string
  assigned_telecaller_id?: string
  assigned_telecaller_name?: string
  call_outcome?: string
  telecaller_remarks?: string
  follow_up_at?: string
  call_attempts_count?: number
  created_at: string
  call_activity_history?: Array<{
    id: string
    outcome: string
    remarks: string
    follow_up_at?: string
    telecaller_name: string
    created_at: string
  }>
}

interface WorkspaceMetrics {
  total_assigned: number
  pending_leads: number
  contacted_count: number
  interested_count: number
  not_interested_count: number
  follow_ups_due: number
  completed_count: number
}

const OUTCOME_CONFIG: Record<string, { label: string; badgeClass: string }> = {
  new: { label: 'New / Uncontacted', badgeClass: 'badge-new' },
  interested: { label: 'Interested', badgeClass: 'badge-interested' },
  follow_up: { label: 'Follow-up Due', badgeClass: 'badge-followup' },
  not_interested: { label: 'Not Interested', badgeClass: 'badge-not-interested' },
  not_reachable: { label: 'Not Reachable', badgeClass: 'badge-retry' },
  duplicate: { label: 'Duplicate', badgeClass: 'badge-duplicate' },
}

export const TelecallerDashboard: React.FC = () => {
  const user = useAuthStore((s) => s.user)
  const [leads, setLeads] = useState<AssignedLeadItem[]>([])
  const [metrics, setMetrics] = useState<WorkspaceMetrics>({
    total_assigned: 0,
    pending_leads: 0,
    contacted_count: 0,
    interested_count: 0,
    not_interested_count: 0,
    follow_ups_due: 0,
    completed_count: 0,
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filterTab, setFilterTab] = useState<'all' | 'new' | 'follow_up' | 'interested'>('all')
  const [search, setSearch] = useState('')

  // Modal / Drawer state for updating call outcome
  const [selectedLead, setSelectedLead] = useState<AssignedLeadItem | null>(null)
  const [outcome, setOutcome] = useState('interested')
  const [remarks, setRemarks] = useState('')
  const [followUpAt, setFollowUpAt] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const fetchWorkspaceData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await api.get<any>('/cases/telecaller/workspace')
      if (res) {
        const leadList: AssignedLeadItem[] = Array.isArray(res.leads) ? res.leads : []
        setLeads(leadList)
        setMetrics({
          total_assigned: res.total_assigned ?? leadList.length,
          pending_leads: res.pending_leads ?? leadList.filter((l) => !l.call_outcome || l.call_outcome === 'new').length,
          contacted_count: res.contacted_count ?? leadList.filter((l) => l.call_outcome && l.call_outcome !== 'new').length,
          interested_count: res.interested_count ?? leadList.filter((l) => l.call_outcome === 'interested').length,
          not_interested_count: res.not_interested_count ?? leadList.filter((l) => l.call_outcome === 'not_interested').length,
          follow_ups_due: res.follow_ups_due ?? leadList.filter((l) => l.call_outcome === 'follow_up').length,
          completed_count: res.completed_count ?? leadList.filter((l) => ['interested', 'not_interested', 'duplicate'].includes(l.call_outcome || '')).length,
        })
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load telecaller workspace metrics'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchWorkspaceData()
  }, [fetchWorkspaceData])

  const handleOpenCallModal = (lead: AssignedLeadItem) => {
    setSelectedLead(lead)
    setOutcome(lead.call_outcome && lead.call_outcome !== 'new' ? lead.call_outcome : 'interested')
    setRemarks(lead.telecaller_remarks || '')
    setFollowUpAt(lead.follow_up_at ? lead.follow_up_at.slice(0, 16) : '')
    setActionSuccess(null)
    setActionError(null)
  }

  const handleCloseModal = () => {
    setSelectedLead(null)
    setActionSuccess(null)
    setActionError(null)
  }

  const handleSaveCallActivity = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedLead) return

    setIsSaving(true)
    setActionError(null)
    try {
      await api.post(`/cases/${selectedLead.id}/call-activity`, {
        outcome,
        remarks: remarks.trim() || undefined,
        follow_up_at: outcome === 'follow_up' && followUpAt ? new Date(followUpAt).toISOString() : undefined,
      })

      setActionSuccess(`Call outcome successfully recorded for ${selectedLead.applicant_name}.`)
      await fetchWorkspaceData()
      setTimeout(() => {
        handleCloseModal()
      }, 1000)
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.message : 'Failed to record call activity'
      setActionError(msg)
    } finally {
      setIsSaving(false)
    }
  }

  // Filter leads by tab and search
  const filteredLeads = leads.filter((lead) => {
    if (filterTab === 'new' && lead.call_outcome && lead.call_outcome !== 'new') return false
    if (filterTab === 'follow_up' && lead.call_outcome !== 'follow_up') return false
    if (filterTab === 'interested' && lead.call_outcome !== 'interested') return false

    if (search.trim()) {
      const q = search.toLowerCase()
      const matchName = (lead.applicant_name || lead.primary_applicant_name || '').toLowerCase().includes(q)
      const matchNo = (lead.case_no || '').toLowerCase().includes(q)
      const matchMobile = (lead.mobile || lead.primary_applicant_mobile || '').includes(q)
      const matchVeh = (lead.vehicle_summary || '').toLowerCase().includes(q)
      if (!matchName && !matchNo && !matchMobile && !matchVeh) return false
    }
    return true
  })

  // Recent individual activity history
  const allHistory = leads
    .flatMap((l) =>
      (l.call_activity_history || []).map((h) => ({
        ...h,
        case_no: l.case_no,
        applicant_name: l.applicant_name,
        lead_id: l.id,
      }))
    )
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5)

  return (
    <div className="telecaller-dashboard">
      {/* Top Welcome Strip */}
      <div className="tc-header">
        <div>
          <div className="tc-badge-strip">
            <span className="tc-live-chip">● Live Desk</span>
            <span className="tc-operator-tag">Telecaller Account</span>
          </div>
          <h1 className="tc-title">Welcome back, {user?.name || 'Telecaller'}</h1>
          <p className="tc-subtitle">
            Showing performance and operational queue for your assigned leads. (Restricted to your account)
          </p>
        </div>
        <div className="tc-actions">
          <Button variant="outline" size="sm" onClick={fetchWorkspaceData} disabled={loading}>
            {loading ? 'Refreshing...' : '🔄 Refresh Data'}
          </Button>
        </div>
      </div>

      {error && (
        <div className="tc-alert tc-alert-error" role="alert">
          <span>⚠️ {error}</span>
        </div>
      )}

      {/* Metric KPI Strip */}
      <div className="tc-kpi-grid">
        <div className="tc-kpi-card">
          <div className="tc-kpi-label">Assigned Leads</div>
          <div className="tc-kpi-value text-primary">{metrics.total_assigned}</div>
          <div className="tc-kpi-hint">Allocated to your desk</div>
        </div>

        <div className="tc-kpi-card">
          <div className="tc-kpi-label">Uncontacted / New</div>
          <div className="tc-kpi-value text-amber">{metrics.pending_leads}</div>
          <div className="tc-kpi-hint">Awaiting first outreach</div>
        </div>

        <div className="tc-kpi-card">
          <div className="tc-kpi-label">Leads Contacted</div>
          <div className="tc-kpi-value text-emerald">{metrics.contacted_count}</div>
          <div className="tc-kpi-hint">Dials logged</div>
        </div>

        <div className="tc-kpi-card">
          <div className="tc-kpi-label">Interested / Hot</div>
          <div className="tc-kpi-value text-emerald">{metrics.interested_count}</div>
          <div className="tc-kpi-hint">Qualified prospects</div>
        </div>

        <div className="tc-kpi-card">
          <div className="tc-kpi-label">Follow-ups Due</div>
          <div className="tc-kpi-value text-amber">{metrics.follow_ups_due}</div>
          <div className="tc-kpi-hint">Scheduled callbacks</div>
        </div>

        <div className="tc-kpi-card">
          <div className="tc-kpi-label">Tasks Completed</div>
          <div className="tc-kpi-value text-slate">{metrics.completed_count}</div>
          <div className="tc-kpi-hint">Resolved workflows</div>
        </div>
      </div>

      {/* Main Work Area: Assigned Leads Ledger */}
      <div className="tc-ledger-card">
        <div className="tc-ledger-header">
          <div>
            <h2 className="tc-section-title">Your Assigned Lead Queue ({leads.length})</h2>
            <p className="tc-section-subtitle">
              You have access only to leads assigned to your profile by the administrator.
            </p>
          </div>

          <div className="tc-filter-bar">
            <div className="tc-search-box">
              <input
                type="text"
                placeholder="Search by name, file no, phone..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="tc-search-input"
              />
            </div>
            <div className="tc-tab-strip">
              <button
                type="button"
                className={`tc-tab-btn ${filterTab === 'all' ? 'active' : ''}`}
                onClick={() => setFilterTab('all')}
              >
                All ({leads.length})
              </button>
              <button
                type="button"
                className={`tc-tab-btn ${filterTab === 'new' ? 'active' : ''}`}
                onClick={() => setFilterTab('new')}
              >
                New ({metrics.pending_leads})
              </button>
              <button
                type="button"
                className={`tc-tab-btn ${filterTab === 'follow_up' ? 'active' : ''}`}
                onClick={() => setFilterTab('follow_up')}
              >
                Follow-ups ({metrics.follow_ups_due})
              </button>
              <button
                type="button"
                className={`tc-tab-btn ${filterTab === 'interested' ? 'active' : ''}`}
                onClick={() => setFilterTab('interested')}
              >
                Interested ({metrics.interested_count})
              </button>
            </div>
          </div>
        </div>

        {/* Table of Leads */}
        <div className="tc-table-wrapper">
          <table className="tc-table">
            <thead>
              <tr>
                <th>Borrower & File No</th>
                <th>Mobile Number</th>
                <th>Product & Amount</th>
                <th>Vehicle Summary</th>
                <th>Current Outcome</th>
                <th>Remarks & Follow-up</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredLeads.length === 0 ? (
                <tr>
                  <td colSpan={7} className="tc-empty-cell">
                    {loading ? 'Loading assigned leads...' : 'No assigned leads found for this filter.'}
                  </td>
                </tr>
              ) : (
                filteredLeads.map((lead) => {
                  const cfg = OUTCOME_CONFIG[lead.call_outcome || 'new'] || OUTCOME_CONFIG.new
                  return (
                    <tr key={lead.id} className="tc-row">
                      <td>
                        <div className="tc-lead-name">{lead.applicant_name || lead.primary_applicant_name}</div>
                        <div className="tc-case-no font-mono">{lead.case_no}</div>
                      </td>
                      <td>
                        <div className="tc-phone font-mono">{lead.mobile || lead.primary_applicant_mobile}</div>
                        <span className="tc-sub-text">Inflow: {lead.source_name}</span>
                      </td>
                      <td>
                        <div className="tc-amount font-mono">{formatINR(lead.loan_amount_requested)}</div>
                        <span className="tc-sub-text">{lead.product_type.replace('_', ' ')}</span>
                      </td>
                      <td>
                        <div className="tc-vehicle">{lead.vehicle_summary || lead.vehicle_details || 'Vehicle Loan'}</div>
                      </td>
                      <td>
                        <span className={`tc-outcome-pill ${cfg.badgeClass}`}>{cfg.label}</span>
                        {lead.call_attempts_count ? (
                          <span className="tc-attempts-badge">{lead.call_attempts_count} dials</span>
                        ) : null}
                      </td>
                      <td>
                        <div className="tc-remarks">{lead.telecaller_remarks || '—'}</div>
                        {lead.follow_up_at && (
                          <div className="tc-followup-due">
                            📅 {new Date(lead.follow_up_at).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </div>
                        )}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div className="tc-action-cell">
                          <button
                            type="button"
                            className="tc-call-btn"
                            onClick={() => handleOpenCallModal(lead)}
                          >
                            📞 Log Outcome
                          </button>
                          <Link to={`/cases/${lead.id}`} className="tc-dossier-link">
                            View File →
                          </Link>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Individual Recent Activity Stream */}
      {allHistory.length > 0 && (
        <div className="tc-history-card">
          <h3 className="tc-section-title" style={{ fontSize: '1rem' }}>Your Recent Outreach History</h3>
          <div className="tc-history-list">
            {allHistory.map((act) => (
              <div key={act.id} className="tc-history-item">
                <div className="tc-history-dot" />
                <div className="tc-history-content">
                  <div className="tc-history-header">
                    <span className="tc-history-applicant">{act.applicant_name}</span>
                    <span className="tc-history-case font-mono">({act.case_no})</span>
                    <span className="tc-history-outcome-tag">{act.outcome}</span>
                    <span className="tc-history-time text-muted">
                      {new Date(act.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  {act.remarks && <p className="tc-history-remarks">"{act.remarks}"</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Update Call Outcome Modal */}
      {selectedLead && (
        <div className="tc-modal-backdrop" onClick={handleCloseModal}>
          <div className="tc-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="tc-modal-header">
              <div>
                <h3 className="tc-modal-title">Log Call & Outreach Outcome</h3>
                <p className="tc-modal-sub font-mono">
                  {selectedLead.applicant_name} — {selectedLead.case_no}
                </p>
              </div>
              <button type="button" className="tc-modal-close" onClick={handleCloseModal}>
                ✕
              </button>
            </div>

            {actionSuccess && (
              <div className="tc-alert tc-alert-success">
                <span>✓ {actionSuccess}</span>
              </div>
            )}
            {actionError && (
              <div className="tc-alert tc-alert-error">
                <span>⚠️ {actionError}</span>
              </div>
            )}

            <form onSubmit={handleSaveCallActivity} className="tc-modal-form">
              <div className="form-group">
                <label className="form-label">Call Outcome *</label>
                <select
                  value={outcome}
                  onChange={(e) => setOutcome(e.target.value)}
                  className="guest-select"
                  required
                >
                  <option value="interested">Interested — Qualified Lead</option>
                  <option value="follow_up">Follow-up Due — Callback Scheduled</option>
                  <option value="not_interested">Not Interested</option>
                  <option value="not_reachable">Ringing No Response (RNR) / Busy</option>
                  <option value="duplicate">Duplicate Record</option>
                </select>
              </div>

              {outcome === 'follow_up' && (
                <div className="form-group">
                  <label className="form-label">Callback Scheduled Date & Time *</label>
                  <input
                    type="datetime-local"
                    value={followUpAt}
                    onChange={(e) => setFollowUpAt(e.target.value)}
                    required={outcome === 'follow_up'}
                    className="guest-input font-mono"
                  />
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Telecaller Remarks / Notes</label>
                <textarea
                  rows={3}
                  placeholder="Record customer discussion, vehicle interest, or ROI expectation..."
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  className="tc-textarea"
                />
              </div>

              <div className="tc-modal-actions">
                <Button variant="outline" type="button" onClick={handleCloseModal}>
                  Cancel
                </Button>
                <Button variant="primary" type="submit" disabled={isSaving}>
                  {isSaving ? 'Saving Outcome...' : 'Save Activity & Update Lead'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
