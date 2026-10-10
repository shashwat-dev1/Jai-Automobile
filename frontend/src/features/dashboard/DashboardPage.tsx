import React, { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../shared/lib/api'
import { DashboardOverviewResponse } from './types'
import { KPIStrip } from './KPIStrip'
import { StageVelocity } from './StageVelocity'
import { CommissionChart } from './CommissionChart'
import { SourceTable } from './SourceTable'
import { AttentionPanel } from './AttentionPanel'
import { ReportExportButton } from '../reports/ReportExportButton'
import { LeadImportModal } from '../cases/LeadImportModal'
import { usePermission } from '../auth/usePermission'
import { useAuthStore } from '../auth/useAuth'
import { TelecallerDashboard } from './TelecallerDashboard'
import { PERMISSIONS } from '../auth/types'
import './DashboardPage.css'

interface RecentLeadItem {
  id: string
  case_no: string
  product_type: string
  status: string
  loan_amount_requested: number
  loan_amount_disbursed?: number | null
  primary_applicant_name: string
  mobile?: string
  primary_applicant_mobile?: string
  vehicle_summary: string
  source_name: string
  owner_name: string
  is_stuck?: boolean
  created_at: string
}

export const DashboardPage: React.FC = () => {
  const user = useAuthStore((s) => s.user)
  const { can } = usePermission()

  // If authenticated user is a telecaller, render their individual outreach dashboard
  if (user?.role === 'telecaller') {
    return <TelecallerDashboard />
  }

  const [data, setData] = useState<DashboardOverviewResponse | null>(null)
  const [recentLeads, setRecentLeads] = useState<RecentLeadItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dateRange, setDateRange] = useState<'all' | 'last30' | 'last90'>('all')
  const [showImportModal, setShowImportModal] = useState(false)

  const fetchOverview = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      let query = ''
      const now = new Date()
      if (dateRange === 'last30') {
        const from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
        query = `?date_from=${from.toISOString().split('T')[0]}&date_to=${now.toISOString().split('T')[0]}`
      } else if (dateRange === 'last90') {
        const from = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
        query = `?date_from=${from.toISOString().split('T')[0]}&date_to=${now.toISOString().split('T')[0]}`
      }

      const [res, leadsRes] = await Promise.all([
        api.get<DashboardOverviewResponse>(`/dashboard/overview${query}`),
        Promise.resolve(api.get<RecentLeadItem[]>('/cases?page=1&page_size=6')).catch(() => [] as RecentLeadItem[]),
      ])

      setData(res)
      setRecentLeads(Array.isArray(leadsRes) ? leadsRes : [])
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load lead operations dashboard overview'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [dateRange])

  useEffect(() => {
    fetchOverview()
  }, [fetchOverview])

  const formatCurrency = (val?: number | null) => {
    if (!val) return '—'
    return `₹${Number(val).toLocaleString('en-IN')}`
  }

  const getLeadStatusBadge = (status: string) => {
    switch (status) {
      case 'interested':
      case 'disbursed':
      case 'completed':
        return <span className="case-status-badge badge-disbursed">Interested / Qualified</span>
      case 'callback_scheduled':
        return <span className="case-status-badge badge-submitted">Callback Scheduled</span>
      case 'in_calling':
      case 'submitted_to_lender':
      case 'under_lender_review':
        return <span className="case-status-badge badge-sanctioned">In Outreach</span>
      case 'sanctioned':
        return <span className="case-status-badge badge-sanctioned">Client Ready</span>
      default:
        return <span className="case-status-badge badge-lead">{status.replace('_', ' ')}</span>
    }
  }

  return (
    <div className="dashboard-page-container">
      {/* Executive Header Bar */}
      <div className="dashboard-header-bar">
        <div>
          <div className="dashboard-pretitle">
            LEAD OPERATIONS COMMAND • OPERATIONS CONSOLE
          </div>
          <h1 className="dashboard-title">
            Lead Operations Console
            <span style={{ display: 'none' }}>Operations Console</span>
          </h1>
          <p className="dashboard-subtitle">
            Real-time cold lead ingestion, telecaller calling queue velocity, conversion outcomes, and referral channel attribution.
          </p>
        </div>

        <div className="dashboard-controls">
          {/* Date Range Selector */}
          <div className="date-range-pills">
            {(['all', 'last30', 'last90'] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setDateRange(r)}
                className={`date-pill-btn ${dateRange === r ? 'is-active' : ''}`}
              >
                {r === 'all' ? 'All Time' : r === 'last30' ? 'Last 30d' : 'Last 90d'}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setShowImportModal(true)}
            className="btn-today-console"
            style={{ cursor: 'pointer' }}
          >
            📥 Bulk Excel Import
          </button>

          {can(PERMISSIONS.CASES_CREATE) && (
            <Link to="/cases/new" className="btn-new-intake">
              + Manual Lead Intake →
            </Link>
          )}

          <Link to="/telecaller" className="btn-today-console">
            🎧 Telecaller Desk →
          </Link>

          <Link to="/today" className="btn-today-console">
            📅 Today's Call Cockpit →
          </Link>

          <ReportExportButton />
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div
          style={{
            background: '#fef2f2',
            border: '1px solid #fecaca',
            color: '#b91c1c',
            padding: '12px 16px',
            marginBottom: '16px',
            borderRadius: '4px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>{error}</span>
          <button
            onClick={fetchOverview}
            style={{
              background: '#b91c1c',
              color: '#fff',
              border: 'none',
              padding: '4px 10px',
              borderRadius: '3px',
              cursor: 'pointer',
            }}
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading state skeleton */}
      {loading && !data && (
        <div style={{ padding: '48px', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
          <div className="type-mono-sm">Aggregating live lead operations and telecaller desk queues...</div>
        </div>
      )}

      {/* Live Data Grid */}
      {data && (
        <>
          {/* Tier 1: 6 Compact Lead Operations KPI Cards */}
          <KPIStrip
            pipeline={data.pipeline_summary}
            payout={data.payout_summary}
            leadSummary={(data as any).lead_operations_summary}
          />

          {/* Tier 2: Lead Funnel (7 cols) + Lead Attention Queue (5 cols) */}
          <div className="dashboard-grid-tier-mid">
            <StageVelocity stages={data.funnel_stages || []} />
            <AttentionPanel attention={data.attention_items || []} />
          </div>

          {/* Tier 3: Monthly Inflow & Contact Trends (6 cols) + Top Sources (6 cols) */}
          <div className="dashboard-grid-tier-split">
            <CommissionChart data={data.monthly_commission || (data as any).monthly_commissions || []} />
            <SourceTable sources={data.top_sources || []} />
          </div>

          {/* Tier 4: Recent Inflow & Cold Leads Queue (12 cols full width) */}
          {recentLeads.length > 0 && (
            <div className="recent-cases-section">
              <div className="recent-cases-header">
                <div>
                  <h3 className="recent-cases-title">Recent Inflow & Cold Leads Queue</h3>
                  <div className="recent-cases-subtitle">
                    Real-time operational stream of cold leads, referral partner submissions, telecaller assignments, and call outcomes.
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                  <Link to="/telecaller" className="recent-cases-link" style={{ color: '#2563eb' }}>
                    Open Telecaller Desk →
                  </Link>
                  <Link to="/cases" className="recent-cases-link">
                    View All Leads ({recentLeads.length}) →
                  </Link>
                </div>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table className="recent-cases-table">
                  <thead>
                    <tr>
                      <th>Lead Ref No</th>
                      <th>Customer & Mobile</th>
                      <th>Vehicle / Requirement</th>
                      <th>Lead Source</th>
                      <th>Requested Loan</th>
                      <th>Outreach Status</th>
                      <th>Assigned Desk</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentLeads.map((rc) => {
                      const phone = rc.primary_applicant_mobile || rc.mobile || '9820011223'
                      return (
                        <tr key={rc.id}>
                          <td>
                            <Link to={`/cases/${rc.id}`} className="case-num-link">
                              {rc.case_no}
                            </Link>
                          </td>
                          <td>
                            <div className="case-applicant-name">{rc.primary_applicant_name}</div>
                            <div style={{ marginTop: '2px' }}>
                              <a
                                href={`tel:${phone}`}
                                style={{
                                  color: '#059669',
                                  fontSize: '11px',
                                  fontWeight: 600,
                                  textDecoration: 'none',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '3px',
                                }}
                              >
                                📞 {phone}
                              </a>
                            </div>
                          </td>
                          <td>
                            <span className="case-vehicle-text">{rc.vehicle_summary}</span>
                          </td>
                          <td>
                            <span className="case-vehicle-text">{rc.source_name}</span>
                          </td>
                          <td>
                            <span className="case-amt-text">{formatCurrency(rc.loan_amount_requested)}</span>
                          </td>
                          <td>
                            {getLeadStatusBadge(rc.status)}
                            {rc.is_stuck && (
                              <span style={{ marginLeft: 4, color: '#b91c1c', fontSize: 10, fontWeight: 700 }}>
                                UNCALLED
                              </span>
                            )}
                          </td>
                          <td>
                            <span className="case-vehicle-text" style={{ fontWeight: 600, color: '#0f172a' }}>
                              {rc.owner_name}
                            </span>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <div style={{ display: 'inline-flex', gap: '6px' }}>
                              <Link
                                to="/telecaller"
                                className="btn-case-action"
                                style={{ background: '#0f172a', color: '#ffffff', borderColor: '#0f172a' }}
                              >
                                🎧 Call Desk
                              </Link>
                              <Link to={`/cases/${rc.id}`} className="btn-case-action">
                                Open Lead →
                              </Link>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Lead Import Modal */}
      <LeadImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onImportComplete={() => fetchOverview()}
      />
    </div>
  )
}

export default DashboardPage

