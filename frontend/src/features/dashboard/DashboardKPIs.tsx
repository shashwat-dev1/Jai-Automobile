import React from 'react'
import { useNavigate } from 'react-router-dom'

interface DashboardKPIsProps {
  leadsTotal: number
  leadsNewCount?: number
  unassignedLeadsCount: number
  activeCallingCount: number
  interestedCount: number
  allocateToPartnersCount: number
  partnerAllocatedLeadsCount: number
  partnerAllocatedAllocationsCount: number
  sanctionedConvertedCount: number
  dateRange?: string
  // Backwards compatibility props
  followUpsCount?: number
  convertedClientsCount?: number
  conversionRatePct?: number
}

export const DashboardKPIs: React.FC<DashboardKPIsProps> = ({
  leadsTotal,
  leadsNewCount = 0,
  unassignedLeadsCount,
  activeCallingCount,
  interestedCount,
  allocateToPartnersCount,
  partnerAllocatedLeadsCount,
  partnerAllocatedAllocationsCount,
  sanctionedConvertedCount,
  dateRange = 'all',
}) => {
  const navigate = useNavigate()

  const handleCardClick = (destination: string) => {
    navigate(destination)
  }

  const handleKeyDown = (e: React.KeyboardEvent, destination: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      handleCardClick(destination)
    }
  }

  const rangeQuery = dateRange && dateRange !== 'all' ? `&range=${dateRange}` : ''

  return (
    <section className="stitch-kpi-grid stitch-kpi-grid-7" aria-label="Key Performance Indicators">
      {/* 1. TOTAL LEADS */}
      <div
        className="stitch-kpi-card"
        data-testid="kpi-leads"
        role="button"
        tabIndex={0}
        title="Total leads recorded in system for selected date range"
        onClick={() => handleCardClick(`/cases?view=all${rangeQuery}`)}
        onKeyDown={(e) => handleKeyDown(e, `/cases?view=all${rangeQuery}`)}
        aria-label={`View All Leads (${leadsTotal} total)`}
      >
        <div className="stitch-kpi-header">
          <span className="stitch-kpi-label">TOTAL LEADS</span>
          {leadsNewCount > 0 && (
            <span className="stitch-kpi-badge stitch-badge-emerald">
              <span className="stitch-badge-dot" />
              <span>+{leadsNewCount} new</span>
            </span>
          )}
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
          <span className="stitch-kpi-subtext" title="Total leads recorded in system for selected date range">
            Total for selected period
          </span>
        </div>
      </div>

      {/* 2. UNASSIGNED */}
      <div
        className="stitch-kpi-card"
        data-testid="kpi-unassigned"
        role="button"
        tabIndex={0}
        title="New unassigned leads awaiting telecaller allocation"
        onClick={() => handleCardClick(`/cases?view=unassigned${rangeQuery}`)}
        onKeyDown={(e) => handleKeyDown(e, `/cases?view=unassigned${rangeQuery}`)}
        aria-label={`View Unassigned Leads (${unassignedLeadsCount} need allocation)`}
      >
        <div className="stitch-kpi-header">
          <span className="stitch-kpi-label">UNASSIGNED</span>
          {unassignedLeadsCount > 0 && (
            <span className="stitch-kpi-badge stitch-badge-amber">
              <span className="stitch-badge-dot stitch-dot-amber" />
              <span>Allocate</span>
            </span>
          )}
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
          <span className="stitch-kpi-subtext" title="New unassigned leads awaiting telecaller allocation">
            Awaiting telecaller
          </span>
        </div>
      </div>

      {/* 3. ACTIVE CALLING */}
      <div
        className="stitch-kpi-card"
        data-testid="kpi-active-calling"
        role="button"
        tabIndex={0}
        title="Leads assigned to telecallers with active calling workflow"
        onClick={() => handleCardClick(`/cases?view=active-calling${rangeQuery}`)}
        onKeyDown={(e) => handleKeyDown(e, `/cases?view=active-calling${rangeQuery}`)}
        aria-label={`View Active Calling Leads (${activeCallingCount} assigned)`}
      >
        <div className="stitch-kpi-header">
          <span className="stitch-kpi-label">ACTIVE CALLING</span>
        </div>
        <div className="stitch-kpi-body">
          <span className="stitch-kpi-value">{activeCallingCount}</span>
          <div className="stitch-kpi-icon-badge" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
            </svg>
          </div>
        </div>
        <div className="stitch-kpi-footer">
          <span className="stitch-kpi-subtext" title="Leads assigned to telecallers with active calling workflow">
            Assigned to telecallers
          </span>
        </div>
      </div>

      {/* 4. INTERESTED */}
      <div
        className="stitch-kpi-card"
        data-testid="kpi-interested"
        role="button"
        tabIndex={0}
        title="Borrowers confirmed interested in vehicle finance"
        onClick={() => handleCardClick(`/cases?view=interested${rangeQuery}`)}
        onKeyDown={(e) => handleKeyDown(e, `/cases?view=interested${rangeQuery}`)}
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
          <span className="stitch-kpi-subtext" title="Borrowers confirmed interested in vehicle finance">
            Confirmed interest
          </span>
        </div>
      </div>

      {/* 5. ALLOCATE TO PARTNERS */}
      <div
        className="stitch-kpi-card"
        data-testid="kpi-allocate-partner"
        role="button"
        tabIndex={0}
        title="Interested leads awaiting first financing partner allocation"
        onClick={() => handleCardClick('/cases/allocate-partner')}
        onKeyDown={(e) => handleKeyDown(e, '/cases/allocate-partner')}
        aria-label={`View Leads Ready to Allocate to Partners (${allocateToPartnersCount} eligible)`}
      >
        <div className="stitch-kpi-header">
          <span className="stitch-kpi-label">ALLOCATE TO PARTNERS</span>
          {allocateToPartnersCount > 0 && (
            <span className="stitch-kpi-badge stitch-badge-hot">
              <span>Ready</span>
            </span>
          )}
        </div>
        <div className="stitch-kpi-body">
          <span className="stitch-kpi-value stitch-text-emerald">{allocateToPartnersCount}</span>
          <div className="stitch-kpi-icon-badge stitch-icon-tint-emerald" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M3 8l7-5 7 5M4 8v8m4-8v8m4-8v8m4-8v8M2 17h16" />
            </svg>
          </div>
        </div>
        <div className="stitch-kpi-footer">
          <span className="stitch-kpi-subtext" title="Interested leads awaiting first financing partner allocation">
            Awaiting partner allocation
          </span>
        </div>
      </div>

      {/* 6. PARTNER ALLOCATED / IN PROCESS */}
      <div
        className="stitch-kpi-card"
        data-testid="kpi-partner-allocated"
        role="button"
        tabIndex={0}
        title="Leads under active underwriting review with one or more financing partners"
        onClick={() => handleCardClick(`/cases?view=partner_allocated${rangeQuery}`)}
        onKeyDown={(e) => handleKeyDown(e, `/cases?view=partner_allocated${rangeQuery}`)}
        aria-label={`View Partner Allocated Leads (${partnerAllocatedLeadsCount} leads, ${partnerAllocatedAllocationsCount} allocations)`}
      >
        <div className="stitch-kpi-header">
          <span className="stitch-kpi-label">PARTNER ALLOCATED</span>
          <span className="stitch-kpi-badge" style={{ background: '#f1f5f9', color: '#475569', fontWeight: 600 }}>
            <span>{partnerAllocatedAllocationsCount} alloc.</span>
          </span>
        </div>
        <div className="stitch-kpi-body">
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
            <span className="stitch-kpi-value">{partnerAllocatedLeadsCount}</span>
            <span style={{ fontSize: '13px', color: '#64748b', fontWeight: 500 }}>leads</span>
          </div>
          <div className="stitch-kpi-icon-badge" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
              <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
              <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
            </svg>
          </div>
        </div>
        <div className="stitch-kpi-footer">
          <span className="stitch-kpi-subtext" title="Leads under active underwriting review with one or more financing partners">
            {partnerAllocatedAllocationsCount === 1 ? '1 allocation total' : `${partnerAllocatedAllocationsCount} allocations total`}
          </span>
        </div>
      </div>

      {/* 7. SANCTIONED / CONVERTED */}
      <div
        className="stitch-kpi-card"
        data-testid="kpi-converted"
        role="button"
        tabIndex={0}
        title="Leads with formal loan sanction issued or final conversion"
        onClick={() => handleCardClick(`/cases?view=converted${rangeQuery}`)}
        onKeyDown={(e) => handleKeyDown(e, `/cases?view=converted${rangeQuery}`)}
        aria-label={`View Sanctioned and Converted Leads (${sanctionedConvertedCount} completed)`}
      >
        <div className="stitch-kpi-header">
          <span className="stitch-kpi-label">SANCTIONED / CONVERTED</span>
          <span className="stitch-kpi-badge stitch-badge-emerald">
            <span>✓ Win</span>
          </span>
        </div>
        <div className="stitch-kpi-body">
          <span className="stitch-kpi-value stitch-text-emerald">{sanctionedConvertedCount}</span>
          <div className="stitch-kpi-icon-badge stitch-icon-tint-emerald" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          </div>
        </div>
        <div className="stitch-kpi-footer">
          <span className="stitch-kpi-subtext" title="Leads with formal loan sanction issued or final conversion">
            Sanctioned / Converted
          </span>
        </div>
      </div>
    </section>
  )
}
