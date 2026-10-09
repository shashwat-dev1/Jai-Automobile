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
import { usePermission } from '../auth/usePermission'
import { PERMISSIONS } from '../auth/types'
import './DashboardPage.css'

interface RecentCaseItem {
  id: string
  case_no: string
  product_type: string
  status: string
  loan_amount_requested: number
  loan_amount_disbursed?: number | null
  primary_applicant_name: string
  vehicle_summary: string
  source_name: string
  owner_name: string
  is_stuck?: boolean
  created_at: string
}

export const DashboardPage: React.FC = () => {
  const { can } = usePermission()
  const [data, setData] = useState<DashboardOverviewResponse | null>(null)
  const [recentCases, setRecentCases] = useState<RecentCaseItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dateRange, setDateRange] = useState<'all' | 'last30' | 'last90'>('all')

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

      const [res, casesRes] = await Promise.all([
        api.get<DashboardOverviewResponse>(`/dashboard/overview${query}`),
        Promise.resolve(api.get<RecentCaseItem[]>('/cases?page=1&page_size=6')).catch(() => [] as RecentCaseItem[]),
      ])

      setData(res)
      setRecentCases(Array.isArray(casesRes) ? casesRes : [])
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load executive dashboard overview'
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

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'disbursed':
      case 'completed':
        return <span className="case-status-badge badge-disbursed">Disbursed</span>
      case 'sanctioned':
        return <span className="case-status-badge badge-sanctioned">Sanctioned</span>
      case 'submitted_to_lender':
      case 'under_lender_review':
        return <span className="case-status-badge badge-submitted">Bank Review</span>
      default:
        return <span className="case-status-badge badge-lead">{status.replace('_', ' ')}</span>
    }
  }

  return (
    <div className="dashboard-page-container">
      {/* Executive Header Bar */}
      <div className="dashboard-header-bar">
        <div>
          <div className="dashboard-pretitle">OPERATIONS COMMAND</div>
          <h1 className="dashboard-title">Operations Console</h1>
          <p className="dashboard-subtitle">
            Live pipeline lifecycle, conversion metrics, bottleneck surveillance, and payout receivables ledger.
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

          {can(PERMISSIONS.CASES_CREATE) && (
            <Link to="/cases/new" className="btn-new-intake">
              + New Case Intake →
            </Link>
          )}

          <Link to="/today" className="btn-today-console">
            Today Console →
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
          <div className="type-mono-sm">Aggregating live operational and financial ledger...</div>
        </div>
      )}

      {/* Live Data Grid */}
      {data && (
        <>
          {/* Tier 1: 6 Compact KPI Cards */}
          <KPIStrip pipeline={data.pipeline_summary} payout={data.payout_summary} />

          {/* Tier 2: Pipeline Funnel (7 cols) + Attention Queue (5 cols) */}
          <div className="dashboard-grid-tier-mid">
            <StageVelocity stages={data.funnel_stages} />
            <AttentionPanel attention={data.attention_items} />
          </div>

          {/* Tier 3: Commission Performance (6 cols) + Top Sources (6 cols) */}
          <div className="dashboard-grid-tier-split">
            <CommissionChart data={data.monthly_commission} />
            <SourceTable sources={data.top_sources} />
          </div>

          {/* Tier 4: Recent Active Loan Files & Live Case Stream (12 cols full width) */}
          {recentCases.length > 0 && (
            <div className="recent-cases-section">
              <div className="recent-cases-header">
                <div>
                  <h3 className="recent-cases-title">Recent Active Loan Files & Live Case Stream</h3>
                  <div className="recent-cases-subtitle">
                    Real-time operational dossier records currently moving through lender pipeline.
                  </div>
                </div>
                <Link to="/cases" className="recent-cases-link">
                  View All Files →
                </Link>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table className="recent-cases-table">
                  <thead>
                    <tr>
                      <th>Case No</th>
                      <th>Primary Applicant</th>
                      <th>Vehicle Collateral</th>
                      <th>Lead Source</th>
                      <th>Requested Book</th>
                      <th>Pipeline Stage</th>
                      <th>Assigned Desk</th>
                      <th style={{ textAlign: 'right' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentCases.map((rc) => (
                      <tr key={rc.id}>
                        <td>
                          <Link to={`/cases/${rc.id}`} className="case-num-link">
                            {rc.case_no}
                          </Link>
                        </td>
                        <td>
                          <span className="case-applicant-name">{rc.primary_applicant_name}</span>
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
                          {getStatusBadge(rc.status)}
                          {rc.is_stuck && (
                            <span style={{ marginLeft: 4, color: '#b91c1c', fontSize: 10, fontWeight: 700 }}>
                              STUCK
                            </span>
                          )}
                        </td>
                        <td>
                          <span className="case-vehicle-text">{rc.owner_name}</span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <Link to={`/cases/${rc.id}`} className="btn-case-action">
                            Open Dossier →
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
export default DashboardPage
