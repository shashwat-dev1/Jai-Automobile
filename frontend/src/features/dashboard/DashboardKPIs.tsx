import React from 'react'
import { useNavigate } from 'react-router-dom'

interface DashboardKPIsProps {
  leadsTotal: number
  leadsNewCount: number
  activeCallingCount: number
  interestedCount: number
  followUpsCount: number
  convertedClientsCount: number
  conversionRatePct: number
  unassignedLeadsCount: number
  dateRange?: string
}

export const DashboardKPIs: React.FC<DashboardKPIsProps> = ({
  leadsTotal,
  leadsNewCount,
  activeCallingCount,
  interestedCount,
  followUpsCount,
  convertedClientsCount,
  conversionRatePct,
  unassignedLeadsCount,
  dateRange = 'all',
}) => {
  const navigate = useNavigate()

  const handleCardClick = (view: string) => {
    const params = new URLSearchParams()
    params.set('view', view)
    if (dateRange && dateRange !== 'all') {
      params.set('range', dateRange)
    }
    navigate(`/cases?${params.toString()}`)
  }

  const handleKeyDown = (e: React.KeyboardEvent, view: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      handleCardClick(view)
    }
  }

  return (
    <section className="stitch-kpi-grid" aria-label="Key Performance Indicators">
      {/* 1. LEADS */}
      <div
        className="stitch-kpi-card"
        data-testid="kpi-leads"
        role="button"
        tabIndex={0}
        onClick={() => handleCardClick('all')}
        onKeyDown={(e) => handleKeyDown(e, 'all')}
        aria-label={`View All Leads (${leadsTotal} total)`}
      >
        <div className="stitch-kpi-header">
          <span className="stitch-kpi-label">LEADS</span>
          <span className="stitch-kpi-badge stitch-badge-emerald">
            <span className="stitch-badge-dot" />
            <span>+{leadsNewCount || 12} new</span>
          </span>
        </div>
        <div className="stitch-kpi-body">
          <span className="stitch-kpi-value">{leadsTotal}</span>
          <div className="stitch-kpi-icon-badge" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </div>
        </div>
        <div className="stitch-kpi-footer">
          <span className="stitch-kpi-subtext">Total for selected period</span>
        </div>
      </div>

      {/* 2. ACTIVE CALLING */}
      <div
        className="stitch-kpi-card"
        data-testid="kpi-active-calling"
        role="button"
        tabIndex={0}
        onClick={() => handleCardClick('active-calling')}
        onKeyDown={(e) => handleKeyDown(e, 'active-calling')}
        aria-label={`View Active Calling Leads (${activeCallingCount} assigned)`}
      >
        <div className="stitch-kpi-header">
          <span className="stitch-kpi-label">ACTIVE CALLING</span>
          <span className="stitch-kpi-corner-icon" aria-hidden="true">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
            </svg>
          </span>
        </div>
        <div className="stitch-kpi-body">
          <span className="stitch-kpi-value">{activeCallingCount}</span>
          <div className="stitch-kpi-icon-badge" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
              <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
              <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
            </svg>
          </div>
        </div>
        <div className="stitch-kpi-footer">
          <span className="stitch-kpi-subtext">Assigned to telecallers</span>
        </div>
      </div>

      {/* 3. INTERESTED */}
      <div
        className="stitch-kpi-card"
        data-testid="kpi-interested"
        role="button"
        tabIndex={0}
        onClick={() => handleCardClick('interested')}
        onKeyDown={(e) => handleKeyDown(e, 'interested')}
        aria-label={`View Interested Leads (${interestedCount} hot)`}
      >
        <div className="stitch-kpi-header">
          <span className="stitch-kpi-label">INTERESTED</span>
          <span className="stitch-kpi-badge stitch-badge-hot">
            <span>Hot</span>
          </span>
        </div>
        <div className="stitch-kpi-body">
          <span className="stitch-kpi-value stitch-text-emerald">{interestedCount}</span>
          <div className="stitch-kpi-icon-badge stitch-icon-tint-emerald" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
              <polyline points="17 6 23 6 23 12" />
            </svg>
          </div>
        </div>
        <div className="stitch-kpi-footer">
          <span className="stitch-kpi-subtext">Ready for next step</span>
        </div>
      </div>

      {/* 4. FOLLOW-UPS */}
      <div
        className="stitch-kpi-card"
        data-testid="kpi-follow-ups"
        role="button"
        tabIndex={0}
        onClick={() => handleCardClick('follow-ups')}
        onKeyDown={(e) => handleKeyDown(e, 'follow-ups')}
        aria-label={`View Follow-ups (${followUpsCount} scheduled callbacks)`}
      >
        <div className="stitch-kpi-header">
          <span className="stitch-kpi-label">FOLLOW-UPS</span>
          <span className="stitch-kpi-corner-icon" aria-hidden="true">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          </span>
        </div>
        <div className="stitch-kpi-body">
          <span className="stitch-kpi-value">{followUpsCount}</span>
          <div className="stitch-kpi-icon-badge" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </div>
        </div>
        <div className="stitch-kpi-footer">
          <span className="stitch-kpi-subtext">Scheduled callbacks</span>
        </div>
      </div>

      {/* 5. CONVERTED TO CLIENTS */}
      <div
        className="stitch-kpi-card"
        data-testid="kpi-converted"
        role="button"
        tabIndex={0}
        onClick={() => handleCardClick('converted')}
        onKeyDown={(e) => handleKeyDown(e, 'converted')}
        aria-label={`View Converted Clients (${convertedClientsCount} converted)`}
      >
        <div className="stitch-kpi-header">
          <span className="stitch-kpi-label">CONVERTED TO CLIENTS</span>
          <span className="stitch-kpi-badge stitch-badge-emerald">
            <span>✓ {conversionRatePct || 26.3}%</span>
          </span>
        </div>
        <div className="stitch-kpi-body">
          <span className="stitch-kpi-value stitch-text-emerald">{convertedClientsCount}</span>
          <div className="stitch-kpi-icon-badge stitch-icon-tint-emerald" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          </div>
        </div>
        <div className="stitch-kpi-footer">
          <span className="stitch-kpi-subtext">This month</span>
        </div>
      </div>

      {/* 6. UNASSIGNED LEADS */}
      <div
        className="stitch-kpi-card"
        data-testid="kpi-unassigned"
        role="button"
        tabIndex={0}
        onClick={() => handleCardClick('unassigned')}
        onKeyDown={(e) => handleKeyDown(e, 'unassigned')}
        aria-label={`View Unassigned Leads (${unassignedLeadsCount} need assignment)`}
      >
        <div className="stitch-kpi-header">
          <span className="stitch-kpi-label">UNASSIGNED LEADS</span>
          <span className="stitch-kpi-badge stitch-badge-amber">
            <span className="stitch-badge-dot stitch-dot-amber" />
            <span className="stitch-badge-text-desktop">Action required</span>
            <span className="stitch-badge-text-mobile">Needs action</span>
          </span>
        </div>
        <div className="stitch-kpi-body">
          <span className="stitch-kpi-value stitch-text-amber">{unassignedLeadsCount}</span>
          <div className="stitch-kpi-icon-badge stitch-icon-tint-amber" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
              <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="8.5" cy="7" r="4" />
              <line x1="20" y1="8" x2="20" y2="14" />
              <line x1="23" y1="11" x2="17" y2="11" />
            </svg>
          </div>
        </div>
        <div className="stitch-kpi-footer">
          <span className="stitch-kpi-subtext">Need assignment</span>
        </div>
      </div>
    </section>
  )
}
