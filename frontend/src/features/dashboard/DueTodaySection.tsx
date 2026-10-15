import React from 'react'
import { Link } from 'react-router-dom'

interface DueTodaySectionProps {
  unassignedCount: number
  followUpsCount: number
  interestedCount: number
}

export const DueTodaySection: React.FC<DueTodaySectionProps> = ({
  unassignedCount,
  followUpsCount,
  interestedCount,
}) => {
  return (
    <div className="stitch-panel-card stitch-due-today-panel">
      <div className="stitch-panel-header">
        <div className="stitch-panel-title-group">
          <span className="stitch-panel-icon" aria-hidden="true">
            📅
          </span>
          <h2 className="stitch-panel-title">Due Today</h2>
        </div>
        <span className="stitch-panel-badge">
          <span className="stitch-panel-badge-desktop">Immediate actions</span>
          <span className="stitch-panel-badge-mobile">PRIORITY TASKS</span>
        </span>
      </div>

      <div className="stitch-due-today-list">
        {/* Row 1: Unassigned leads */}
        <div className="stitch-due-row">
          <div className="stitch-due-label-group">
            <span className="stitch-due-bullet stitch-bullet-dark" aria-hidden="true" />
            <span className="stitch-due-label">Unassigned leads</span>
          </div>
          <span className="stitch-due-count-pill stitch-count-pill-neutral">
            {unassignedCount}
          </span>
        </div>

        {/* Row 2: Follow-ups due today */}
        <div className="stitch-due-row">
          <div className="stitch-due-label-group">
            <span className="stitch-due-bullet stitch-bullet-teal" aria-hidden="true" />
            <span className="stitch-due-label">Follow-ups due today</span>
          </div>
          <span className="stitch-due-count-pill stitch-count-pill-teal">
            {followUpsCount}
          </span>
        </div>

        {/* Row 3: Interested leads awaiting next step */}
        <div className="stitch-due-row">
          <div className="stitch-due-label-group">
            <span className="stitch-due-bullet stitch-bullet-green" aria-hidden="true" />
            <span className="stitch-due-label">Interested leads awaiting next step</span>
          </div>
          <span className="stitch-due-count-pill stitch-count-pill-green">
            {interestedCount}
          </span>
        </div>
      </div>

      <div className="stitch-due-today-actions">
        <Link to="/today" className="stitch-btn-open-today">
          <span>Open Today's Console</span>
          <span className="stitch-btn-arrow" aria-hidden="true">
            →
          </span>
        </Link>
      </div>
    </div>
  )
}
