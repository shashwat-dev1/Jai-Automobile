import { useState, useEffect, useCallback } from 'react'
import { api, ApiError } from '../../shared/lib/api'
import { formatINR } from '../../shared/lib/formatters'
import Button from '../../shared/components/Button'
import { JAI_MOCK_CASES } from '../../shared/lib/mockDatabase'
import './TelecallerWorkspacePage.css'

interface TelecallerLead {
  id: string
  case_no: string
  applicant_name: string
  primary_applicant_name?: string
  mobile: string
  primary_applicant_mobile?: string
  product_type: string
  loan_amount_requested: number
  vehicle_summary: string
  source_name: string
  referral_partner_name?: string
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

interface WorkspaceSummary {
  total_assigned: number
  pending_leads: number
  follow_ups_due: number
  interested_count: number
  completed_count: number
}

const OUTCOME_LABELS: Record<string, { label: string; color: string }> = {
  new: { label: 'New Lead', color: '#38bdf8' },
  interested: { label: 'Interested', color: '#10b981' },
  not_interested: { label: 'Not Interested', color: '#ef4444' },
  follow_up: { label: 'Follow-up Due', color: '#f59e0b' },
  not_reachable: { label: 'Not Reachable', color: '#94a3b8' },
  duplicate: { label: 'Duplicate File', color: '#64748b' },
}

export function TelecallerWorkspacePage() {
  const [leads, setLeads] = useState<TelecallerLead[]>([])
  const [summary, setSummary] = useState<WorkspaceSummary>({
    total_assigned: 0,
    pending_leads: 0,
    follow_ups_due: 0,
    interested_count: 0,
    completed_count: 0,
  })
  const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'follow_up' | 'interested' | 'not_reachable' | 'completed'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Active Call Drawer
  const [selectedLead, setSelectedLead] = useState<TelecallerLead | null>(null)
  const [outcome, setOutcome] = useState('interested')
  const [remarks, setRemarks] = useState('')
  const [followUpAt, setFollowUpAt] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [saveSuccessMsg, setSaveSuccessMsg] = useState('')

  const loadWorkspace = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await api.get<any>('/cases/telecaller/workspace')
      if (res) {
        const rawLeads = res.leads || JAI_MOCK_CASES
        setLeads(rawLeads)
        setSummary({
          total_assigned: res.total_assigned || rawLeads.length,
          pending_leads: res.pending_leads || rawLeads.filter((l: any) => !l.call_outcome || l.call_outcome === 'new').length,
          follow_ups_due: res.follow_ups_due || rawLeads.filter((l: any) => l.call_outcome === 'follow_up').length,
          interested_count: res.interested_count || rawLeads.filter((l: any) => l.call_outcome === 'interested').length,
          completed_count: res.completed_count || rawLeads.filter((l: any) => ['interested', 'not_interested', 'duplicate'].includes(l.call_outcome || '')).length,
        })
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to load telecaller workspace')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadWorkspace()
  }, [loadWorkspace])

  const handleOpenDrawer = (lead: TelecallerLead) => {
    setSelectedLead(lead)
    setOutcome(lead.call_outcome && lead.call_outcome !== 'new' ? lead.call_outcome : 'interested')
    setRemarks(lead.telecaller_remarks || '')
    setFollowUpAt(lead.follow_up_at ? new Date(lead.follow_up_at).toISOString().slice(0, 16) : '')
    setSaveSuccessMsg('')
  }

  const handleSaveActivity = async () => {
    if (!selectedLead) return
    if (!remarks.trim()) {
      alert('Please enter remarks for this call activity.')
      return
    }

    setIsSaving(true)
    try {
      await api.post(`/cases/${selectedLead.id}/call-activity`, {
        outcome,
        remarks: remarks.trim(),
        follow_up_at: outcome === 'follow_up' && followUpAt ? new Date(followUpAt).toISOString() : null,
      })

      // Update in local state
      setLeads((prev) =>
        prev.map((l) => {
          if (l.id === selectedLead.id) {
            const history = l.call_activity_history || []
            const newEntry = {
              id: `act-${Date.now()}`,
              outcome,
              remarks: remarks.trim(),
              follow_up_at: followUpAt || undefined,
              telecaller_name: 'Priya Nair',
              created_at: new Date().toISOString(),
            }
            return {
              ...l,
              call_outcome: outcome,
              telecaller_remarks: remarks.trim(),
              follow_up_at: followUpAt || undefined,
              call_attempts_count: (l.call_attempts_count || 0) + 1,
              call_activity_history: [newEntry, ...history],
            }
          }
          return l
        })
      )

      setSaveSuccessMsg('Call activity logged successfully!')
      setTimeout(() => {
        setSaveSuccessMsg('')
      }, 3000)
    } catch {
      alert('Failed to log call activity. Please retry.')
    } finally {
      setIsSaving(false)
    }
  }

  const filteredLeads = leads.filter((lead) => {
    const q = searchQuery.toLowerCase().trim()
    const name = (lead.applicant_name || lead.primary_applicant_name || '').toLowerCase()
    const mobile = (lead.mobile || lead.primary_applicant_mobile || '').toLowerCase()
    const caseNo = (lead.case_no || '').toLowerCase()
    const matchesSearch = !q || name.includes(q) || mobile.includes(q) || caseNo.includes(q)

    if (!matchesSearch) return false

    if (activeTab === 'pending') {
      return !lead.call_outcome || lead.call_outcome === 'new'
    }
    if (activeTab === 'follow_up') {
      return lead.call_outcome === 'follow_up'
    }
    if (activeTab === 'interested') {
      return lead.call_outcome === 'interested'
    }
    if (activeTab === 'not_reachable') {
      return lead.call_outcome === 'not_reachable'
    }
    if (activeTab === 'completed') {
      return ['interested', 'not_interested', 'duplicate'].includes(lead.call_outcome || '')
    }
    return true
  })

  return (
    <div className="telecaller-page">
      {/* Header & KPI Summary */}
      <div className="telecaller-header">
        <div>
          <h1 className="type-h1">Telecaller Workspace</h1>
          <p className="type-body-md text-muted">
            Direct customer outreach, click-to-call, outcome recording, and scheduled follow-ups.
          </p>
        </div>
        <div className="telecaller-header-badge">
          <span className="telecaller-status-dot" />
          <span>Active Session: Priya Nair (Telecaller Desk 1)</span>
        </div>
      </div>

      {/* KPI Counters Strip */}
      <div className="telecaller-kpi-grid">
        <div className="kpi-card" onClick={() => setActiveTab('all')}>
          <span className="kpi-title">Assigned Leads</span>
          <span className="kpi-val">{summary.total_assigned}</span>
        </div>
        <div className="kpi-card kpi-pending" onClick={() => setActiveTab('pending')}>
          <span className="kpi-title">Pending First Call</span>
          <span className="kpi-val text-pending">{summary.pending_leads}</span>
        </div>
        <div className="kpi-card kpi-followup" onClick={() => setActiveTab('follow_up')}>
          <span className="kpi-title">Follow-ups Due</span>
          <span className="kpi-val text-followup">{summary.follow_ups_due}</span>
        </div>
        <div className="kpi-card kpi-interested" onClick={() => setActiveTab('interested')}>
          <span className="kpi-title">Interested Leads</span>
          <span className="kpi-val text-interested">{summary.interested_count}</span>
        </div>
        <div className="kpi-card" onClick={() => setActiveTab('completed')}>
          <span className="kpi-title">Completed Calls</span>
          <span className="kpi-val">{summary.completed_count}</span>
        </div>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div className="telecaller-controls">
        <div className="telecaller-tabs">
          <button
            className={`tab-btn ${activeTab === 'all' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('all')}
          >
            All Assigned ({leads.length})
          </button>
          <button
            className={`tab-btn ${activeTab === 'pending' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('pending')}
          >
            Pending ({summary.pending_leads})
          </button>
          <button
            className={`tab-btn ${activeTab === 'follow_up' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('follow_up')}
          >
            Follow-ups ({summary.follow_ups_due})
          </button>
          <button
            className={`tab-btn ${activeTab === 'interested' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('interested')}
          >
            Interested ({summary.interested_count})
          </button>
          <button
            className={`tab-btn ${activeTab === 'not_reachable' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('not_reachable')}
          >
            Not Reachable
          </button>
          <button
            className={`tab-btn ${activeTab === 'completed' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('completed')}
          >
            Completed
          </button>
        </div>

        <div className="telecaller-search">
          <input
            type="text"
            placeholder="Search by customer name, mobile, or file #..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="telecaller-search-input"
          />
        </div>
      </div>

      {/* Main Content Area: Responsive Leads Grid / Cards */}
      {isLoading ? (
        <div className="telecaller-loading">Loading assigned leads workspace...</div>
      ) : error ? (
        <div className="telecaller-error">{error}</div>
      ) : filteredLeads.length === 0 ? (
        <div className="telecaller-empty">
          <p className="type-title-sm">No leads match this view</p>
          <p className="type-body-xs text-muted">Try selecting another filter tab or clearing search.</p>
        </div>
      ) : (
        <div className="leads-grid">
          {filteredLeads.map((lead) => {
            const currentOutcome = lead.call_outcome || 'new'
            const outcomeMeta = OUTCOME_LABELS[currentOutcome] || { label: currentOutcome, color: '#94a3b8' }
            const customerName = lead.applicant_name || lead.primary_applicant_name || 'Borrower'
            const phone = lead.mobile || lead.primary_applicant_mobile || ''

            return (
              <div
                key={lead.id}
                className={`lead-card ${selectedLead?.id === lead.id ? 'is-selected' : ''}`}
              >
                <div className="lead-card-top">
                  <div>
                    <span className="case-no-badge">{lead.case_no}</span>
                    <h3 className="lead-name">{customerName}</h3>
                  </div>
                  <span
                    className="outcome-chip"
                    style={{
                      backgroundColor: `${outcomeMeta.color}1f`,
                      color: outcomeMeta.color,
                      borderColor: `${outcomeMeta.color}40`,
                    }}
                  >
                    {outcomeMeta.label}
                  </span>
                </div>

                <div className="lead-card-details">
                  <div className="detail-row">
                    <span className="detail-label">Loan Product:</span>
                    <span className="detail-value text-capitalize">{lead.product_type?.replace(/_/g, ' ')}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Requested:</span>
                    <span className="detail-value font-mono font-bold">
                      {formatINR(lead.loan_amount_requested)}
                    </span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Vehicle:</span>
                    <span className="detail-value">{lead.vehicle_summary || 'Not specified'}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Channel/Referral:</span>
                    <span className="detail-value text-secondary">
                      {lead.referral_partner_name ? `🤝 ${lead.referral_partner_name}` : lead.source_name}
                    </span>
                  </div>
                  {lead.follow_up_at && (
                    <div className="detail-row follow-up-notice">
                      <span className="detail-label">Callback:</span>
                      <span className="detail-value font-mono">
                        ⏰ {new Date(lead.follow_up_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  )}
                  {lead.telecaller_remarks && (
                    <div className="remarks-snippet">
                      <span className="detail-label">Latest Remarks:</span>
                      <p className="remarks-text">{lead.telecaller_remarks}</p>
                    </div>
                  )}
                </div>

                <div className="lead-card-footer">
                  <a
                    href={`tel:${phone}`}
                    className="call-action-btn"
                    title={`Call customer at ${phone}`}
                  >
                    📞 Call ({phone.slice(0, 5)} {phone.slice(5)})
                  </a>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleOpenDrawer(lead)}
                  >
                    📝 Log Call Activity
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Slide-Over Call Activity & Follow-Up Drawer */}
      {selectedLead && (
        <div className="call-drawer-backdrop" onClick={() => setSelectedLead(null)}>
          <div className="call-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <div>
                <span className="case-no-badge">{selectedLead.case_no}</span>
                <h2 className="type-h2">
                  {selectedLead.applicant_name || selectedLead.primary_applicant_name}
                </h2>
                <p className="type-body-xs text-muted">
                  Attempts Logged: {selectedLead.call_attempts_count || 0}
                </p>
              </div>
              <button
                className="drawer-close-btn"
                onClick={() => setSelectedLead(null)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="drawer-body">
              {/* Direct Click-to-Call Banner */}
              <div className="drawer-call-banner">
                <div>
                  <span className="type-body-xs text-muted">Customer Mobile:</span>
                  <p className="font-mono type-title-sm">{selectedLead.mobile || selectedLead.primary_applicant_mobile}</p>
                </div>
                <a
                  href={`tel:${selectedLead.mobile || selectedLead.primary_applicant_mobile}`}
                  className="drawer-call-btn"
                >
                  📞 Launch Phone Call
                </a>
              </div>

              {saveSuccessMsg && (
                <div className="alert-success">
                  {saveSuccessMsg}
                </div>
              )}

              {/* Form: Call Outcome Selector */}
              <div className="drawer-section">
                <label className="type-title-xs">Call Outcome *</label>
                <div className="outcome-picker-grid">
                  {[
                    { val: 'interested', label: 'Interested', desc: 'Customer interested in loan offer' },
                    { val: 'follow_up', label: 'Follow-up Due', desc: 'Requested callback at specific time' },
                    { val: 'not_reachable', label: 'Not Reachable', desc: 'Ringing, busy, or switched off' },
                    { val: 'not_interested', label: 'Not Interested', desc: 'Declined or borrower cancelled' },
                    { val: 'duplicate', label: 'Duplicate File', desc: 'Already applied through other desk' },
                  ].map((opt) => (
                    <button
                      key={opt.val}
                      type="button"
                      className={`outcome-choice-btn ${outcome === opt.val ? 'is-selected' : ''}`}
                      onClick={() => setOutcome(opt.val)}
                    >
                      <span className="choice-title">{opt.label}</span>
                      <span className="choice-desc">{opt.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Follow-up Date Time Picker if Outcome is follow_up */}
              {outcome === 'follow_up' && (
                <div className="drawer-section">
                  <label className="type-title-xs">Schedule Follow-up Date & Time *</label>
                  <input
                    type="datetime-local"
                    value={followUpAt}
                    onChange={(e) => setFollowUpAt(e.target.value)}
                    className="telecaller-date-input"
                  />
                  <p className="type-body-xs text-muted">
                    This lead will automatically be flagged on your dashboard when this time arrives.
                  </p>
                </div>
              )}

              {/* Remarks Field */}
              <div className="drawer-section">
                <label className="type-title-xs">Telecaller Remarks & Discussion Notes *</label>
                <textarea
                  rows={4}
                  placeholder="Record customer response, tenure preference, vehicle details, budget, or objections..."
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  className="telecaller-textarea"
                />
              </div>

              <div className="drawer-save-bar">
                <Button
                  variant="primary"
                  onClick={handleSaveActivity}
                  disabled={isSaving}
                >
                  {isSaving ? 'Saving Activity...' : 'Save Call Activity & Remarks'}
                </Button>
              </div>

              {/* Activity History Timeline */}
              <div className="drawer-section">
                <h3 className="type-title-sm">Call Activity Log</h3>
                <div className="activity-timeline">
                  {selectedLead.call_activity_history && selectedLead.call_activity_history.length > 0 ? (
                    selectedLead.call_activity_history.map((act) => (
                      <div key={act.id} className="timeline-item">
                        <div className="timeline-marker" />
                        <div className="timeline-content">
                          <div className="timeline-top">
                            <span className="timeline-outcome">{act.outcome}</span>
                            <span className="timeline-time font-mono text-muted">
                              {new Date(act.created_at).toLocaleString()}
                            </span>
                          </div>
                          <p className="timeline-remarks">{act.remarks}</p>
                          {act.follow_up_at && (
                            <p className="timeline-followup">
                              ⏰ Callback set for: {new Date(act.follow_up_at).toLocaleString()}
                            </p>
                          )}
                          <span className="timeline-agent text-muted">Logged by: {act.telecaller_name}</span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="timeline-empty text-muted">
                      No previous calls logged for this customer.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
