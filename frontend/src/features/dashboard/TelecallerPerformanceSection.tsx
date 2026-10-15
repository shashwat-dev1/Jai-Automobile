import React from 'react'
import { Link } from 'react-router-dom'
import type { TelecallerPerformanceItem } from './dashboardDataService'

interface TelecallerPerformanceSectionProps {
  telecallers: TelecallerPerformanceItem[]
}

export const TelecallerPerformanceSection: React.FC<TelecallerPerformanceSectionProps> = ({
  telecallers,
}) => {
  return (
    <div className="stitch-panel-card stitch-telecaller-panel">
      <div className="stitch-panel-header">
        <div>
          <h2 className="stitch-panel-title">Telecaller Performance</h2>
          <p className="stitch-panel-subtitle">
            <span className="stitch-subtitle-desktop">Top active telecallers</span>
            <span className="stitch-subtitle-mobile">Conversion ratio this cycle</span>
          </p>
        </div>

        {/* Desktop Legend */}
        <div className="stitch-telecaller-legend">
          <div className="stitch-legend-item">
            <span className="stitch-legend-dot stitch-dot-assigned" aria-hidden="true" />
            <span>Assigned</span>
          </div>
          <div className="stitch-legend-item">
            <span className="stitch-legend-dot stitch-dot-interested" aria-hidden="true" />
            <span>Interested</span>
          </div>
        </div>

        {/* Mobile Corner Icon */}
        <div className="stitch-telecaller-mobile-icon" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
            <rect x="3" y="12" width="4" height="8" rx="1" />
            <rect x="10" y="8" width="4" height="12" rx="1" />
            <rect x="17" y="4" width="4" height="16" rx="1" />
          </svg>
        </div>
      </div>

      <div className="stitch-telecaller-list">
        {telecallers.slice(0, 3).map((t) => (
          <div key={t.id} className="stitch-telecaller-row">
            <div className="stitch-telecaller-meta">
              <div
                className={`stitch-telecaller-avatar ${
                  t.rank === 1 ? 'stitch-avatar-primary' : 'stitch-avatar-secondary'
                }`}
                aria-hidden="true"
              >
                {t.avatar_initials}
              </div>

              <div className="stitch-telecaller-info">
                <div className="stitch-telecaller-name-row">
                  <span className="stitch-telecaller-name">{t.name}</span>
                  <span className="stitch-telecaller-rank">Rank {t.rank}</span>
                </div>
                <div className="stitch-telecaller-counts">
                  <span className="stitch-counts-desktop">
                    Assigned: <strong>{t.assigned_count}</strong> &bull; Interested:{' '}
                    <strong>{t.interested_count}</strong>
                  </span>
                  <span className="stitch-counts-mobile">
                    <strong className="stitch-mobile-interested">{t.interested_count} interested</strong>{' '}
                    / {t.assigned_count} assigned
                  </span>
                </div>
              </div>

              <div className="stitch-telecaller-rate">
                <span className="stitch-telecaller-pct">{t.conversion_pct}%</span>
                <span className="stitch-telecaller-pct-label">Conversion</span>
              </div>
            </div>

            {/* Horizontal Dual Ratio Bar */}
            <div
              className="stitch-telecaller-track"
              role="progressbar"
              aria-valuenow={t.conversion_pct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${t.name} conversion rate`}
            >
              <div
                className="stitch-telecaller-fill"
                style={{ width: `${Math.min(100, Math.max(0, t.conversion_pct))}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="stitch-telecaller-footer">
        <Link to="/telecaller" className="stitch-telecaller-view-all">
          <span>View All Telecallers</span>
          <span aria-hidden="true">&rsaquo;</span>
        </Link>
      </div>
    </div>
  )
}
