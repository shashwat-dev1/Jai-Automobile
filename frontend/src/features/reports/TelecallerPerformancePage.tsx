import { useState, useEffect, useCallback, useMemo } from 'react'
import { api, ApiError } from '../../shared/lib/api'
import { getISTDateParts } from '../../shared/lib/leadQueues'
import { JAI_MOCK_USERS } from '../../shared/lib/mockDatabase'
import './PartnerPerformancePage.css'

interface TelecallerPerfRow {
  telecallerId: string
  name: string
  currentlyAssigned: number
  leadsContacted: number
  interestedCount: number
  notInterestedCount: number
  followUpsScheduled: number
  followUpsCompleted: number
  interestRate: string // e.g. "45.0% (9/20)"
  sanctionedCount: number
  assignedLeads: any[]
  activities: any[]
}

export function TelecallerPerformancePage() {
  const currentMonth = useMemo(() => getISTDateParts().reportingMonth, [])
  const [selectedPeriod, setSelectedPeriod] = useState<string>(currentMonth)
  const [cases, setCases] = useState<any[]>([])
  const [selectedTelecaller, setSelectedTelecaller] = useState<TelecallerPerfRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const activeTelecallers = useMemo(() => {
    return JAI_MOCK_USERS.filter((u) => u.role === 'telecaller' && u.is_active)
  }, [])

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const casesRes = await api.get<any[]>('/cases')
      setCases(Array.isArray(casesRes) ? casesRes : [])
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load telecaller performance data.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()

    const handleUpdate = () => {
      loadData()
    }
    window.addEventListener('dsa_os_cases_updated', handleUpdate)
    window.addEventListener('storage', handleUpdate)
    return () => {
      window.removeEventListener('dsa_os_cases_updated', handleUpdate)
      window.removeEventListener('storage', handleUpdate)
    }
  }, [loadData])

  // Compute telecaller metrics strictly from genuine call_activity_history events
  const metrics: TelecallerPerfRow[] = useMemo(() => {
    return activeTelecallers.map((tc) => {
      const assigned = cases.filter((c) => c.assigned_telecaller_id === tc.id)

      // Collect all genuine call activities logged in this period
      const tcActivities: Array<{ lead: any; activity: any }> = []
      const contactedLeadIds = new Set<string>()
      let interestedCount = 0
      let notInterestedCount = 0
      let followUpsScheduled = 0
      let followUpsCompleted = 0

      for (const lead of cases) {
        const history: any[] = lead.call_activity_history || []
        for (const act of history) {
          const actCreated = act.created_at
          if (!actCreated) continue

          const { reportingMonth } = getISTDateParts(actCreated)
          if (reportingMonth !== selectedPeriod) continue

          // Match telecaller by ID or name
          const isTc =
            act.telecaller_id === tc.id ||
            (act.telecaller_name && tc.name.toLowerCase().includes(act.telecaller_name.toLowerCase()))

          if (isTc) {
            tcActivities.push({ lead, activity: act })
            contactedLeadIds.add(lead.id)

            if (act.outcome === 'interested') interestedCount++
            if (act.outcome === 'not_interested') notInterestedCount++
            if (act.outcome === 'follow_up') followUpsScheduled++
            if (act.outcome === 'completed' || act.outcome === 'callback_completed') {
              followUpsCompleted++
            }
          }
        }
      }

      const contactedCount = contactedLeadIds.size
      const interestRate =
        contactedCount > 0
          ? `${((interestedCount / contactedCount) * 100).toFixed(1)}% (${interestedCount}/${contactedCount})`
          : '—'

      // Sanctioned attribution: lead currently or originally assigned to this telecaller
      const sanctionedCount = assigned.filter(
        (c) => c.status === 'sanctioned' || c.status === 'disbursed' || c.status === 'converted'
      ).length

      return {
        telecallerId: tc.id,
        name: tc.name,
        currentlyAssigned: assigned.length,
        leadsContacted: contactedCount,
        interestedCount,
        notInterestedCount,
        followUpsScheduled,
        followUpsCompleted,
        interestRate,
        sanctionedCount,
        assignedLeads: assigned,
        activities: tcActivities,
      }
    })
  }, [activeTelecallers, cases, selectedPeriod])

  // Summary top counts
  const summary = useMemo(() => {
    const totalAssigned = metrics.reduce((sum, m) => sum + m.currentlyAssigned, 0)
    const totalContacted = metrics.reduce((sum, m) => sum + m.leadsContacted, 0)
    const totalInterested = metrics.reduce((sum, m) => sum + m.interestedCount, 0)
    const totalSanctioned = metrics.reduce((sum, m) => sum + m.sanctionedCount, 0)

    return { totalAssigned, totalContacted, totalInterested, totalSanctioned }
  }, [metrics])

  return (
    <div className="performance-page-container">
      <div className="performance-header">
        <div className="performance-title-group">
          <h1>Telecaller Performance</h1>
          <p>Verified outreach activity, conversion rates, and call outcomes recorded by the telecalling desk.</p>
        </div>

        <div className="period-filter-group">
          <label htmlFor="telecaller-period-select" style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
            Period (IST):
          </label>
          <select
            id="telecaller-period-select"
            value={selectedPeriod}
            onChange={(e) => setSelectedPeriod(e.target.value)}
          >
            <option value="2026-10">October 2026</option>
            <option value="2026-09">September 2026</option>
            <option value="2026-08">August 2026</option>
          </select>
        </div>
      </div>

      {error && (
        <div className="alert-result-banner error" role="alert">
          {error}
        </div>
      )}

      {/* Summary KPI Cards */}
      <div className="performance-summary-cards">
        <div className="perf-card">
          <div className="perf-card-label">Currently Assigned</div>
          <div className="perf-card-value">{summary.totalAssigned}</div>
        </div>
        <div className="perf-card">
          <div className="perf-card-label">Distinct Leads Contacted</div>
          <div className="perf-card-value" style={{ color: '#0284c7' }}>{summary.totalContacted}</div>
        </div>
        <div className="perf-card">
          <div className="perf-card-label">Interested Prospects</div>
          <div className="perf-card-value" style={{ color: '#16a34a' }}>{summary.totalInterested}</div>
        </div>
        <div className="perf-card">
          <div className="perf-card-label">Attributed Sanctions</div>
          <div className="perf-card-value">{summary.totalSanctioned}</div>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 'var(--space-2xl)', textAlign: 'center' }}>Loading telecaller performance...</div>
      ) : (
        <div className="allocate-table-wrapper">
          <table className="allocate-table" aria-label="Telecaller Performance Ranking">
            <thead>
              <tr>
                <th>Telecaller Name</th>
                <th>Assigned Leads</th>
                <th>Leads Contacted (Period)</th>
                <th>Interested</th>
                <th>Not Interested</th>
                <th>Follow-ups Scheduled</th>
                <th>Follow-ups Completed</th>
                <th>Interest Rate (Interested ÷ Contacted)</th>
                <th>Sanctioned Leads</th>
              </tr>
            </thead>
            <tbody>
              {metrics.map((m) => (
                <tr
                  key={m.telecallerId}
                  className="clickable-row"
                  onClick={() => setSelectedTelecaller(m)}
                  title="Click to view detailed activity stream and assigned leads"
                >
                  <td>
                    <div className="lead-name-cell">{m.name}</div>
                    <div className="lead-id-sub">{m.telecallerId}</div>
                  </td>
                  <td style={{ fontWeight: 600 }}>{m.currentlyAssigned}</td>
                  <td style={{ color: '#0284c7', fontWeight: 600 }}>{m.leadsContacted}</td>
                  <td style={{ color: '#16a34a', fontWeight: 600 }}>{m.interestedCount}</td>
                  <td style={{ color: '#dc2626' }}>{m.notInterestedCount}</td>
                  <td>{m.followUpsScheduled}</td>
                  <td>{m.followUpsCompleted}</td>
                  <td style={{ fontWeight: 700 }}>{m.interestRate}</td>
                  <td style={{ fontWeight: 600 }}>{m.sanctionedCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail Drawer: Telecaller Assigned Leads & Call Logs */}
      {selectedTelecaller && (
        <div
          className="perf-detail-drawer-backdrop"
          onClick={() => setSelectedTelecaller(null)}
          role="dialog"
          aria-modal="true"
        >
          <div className="perf-detail-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <div>
                <h2>{selectedTelecaller.name} — Activity Log</h2>
                <span className="lead-id-sub">
                  Assigned: {selectedTelecaller.currentlyAssigned} · Calls in Period: {selectedTelecaller.activities.length}
                </span>
              </div>
              <button
                type="button"
                className="drawer-close-btn"
                onClick={() => setSelectedTelecaller(null)}
                aria-label="Close drawer"
              >
                ✕
              </button>
            </div>

            <div className="drawer-body">
              <h3 style={{ fontSize: '14px', marginBottom: '12px', fontWeight: 600 }}>
                Logged Call Activities ({selectedPeriod})
              </h3>
              {selectedTelecaller.activities.length === 0 ? (
                <p style={{ color: 'var(--color-text-secondary)', fontSize: '13px' }}>
                  No call activities logged by {selectedTelecaller.name} in this period.
                </p>
              ) : (
                selectedTelecaller.activities.map((item, idx) => {
                  const act = item.activity
                  const lead = item.lead
                  const timeStr = act.created_at
                    ? new Date(act.created_at).toLocaleString('en-IN', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : '—'

                  return (
                    <div key={act.id || idx} className="alloc-detail-card">
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                        <div>
                          <strong>{lead.primary_applicant_name || lead.applicant_name}</strong>
                          <span className="lead-id-sub" style={{ marginLeft: '6px' }}>
                            ({lead.case_no || lead.id})
                          </span>
                        </div>
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 600,
                            padding: '2px 6px',
                            borderRadius: '4px',
                            background:
                              act.outcome === 'interested'
                                ? '#dcfce7'
                                : act.outcome === 'not_interested'
                                ? '#fee2e2'
                                : '#fef3c7',
                            color:
                              act.outcome === 'interested'
                                ? '#15803d'
                                : act.outcome === 'not_interested'
                                ? '#b91c1c'
                                : '#b45309',
                            textTransform: 'uppercase',
                          }}
                        >
                          {act.outcome}
                        </span>
                      </div>

                      <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '4px' }}>
                        <span>Remarks: </span>
                        <em style={{ color: 'var(--color-text-primary)' }}>"{act.remarks || 'No remarks entered'}"</em>
                      </div>

                      <div style={{ fontSize: '11px', color: '#64748b' }}>
                        <span>Logged at: {timeStr}</span>
                        {act.follow_up_at && (
                          <span style={{ marginLeft: '12px', color: '#b45309' }}>
                            Follow-up: {new Date(act.follow_up_at).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default TelecallerPerformancePage
