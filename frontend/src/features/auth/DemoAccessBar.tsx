/**
 * DSA OS — Demo Access Quick-Fill Bar
 *
 * Isolated, modular component for testing and demonstrations.
 * Can be unmounted or deleted with zero layout shift or impact
 * on the primary login card and form.
 */

import React from 'react'
import './DemoAccessBar.css'

export interface DemoCredential {
  role: string
  roleKey: 'owner' | 'telecaller'
  orgSlug: string
  identifier: string
  pass: string
  desktopLabel: string
  mobileLabel: string
}

export const DEMO_CREDENTIALS: DemoCredential[] = [
  {
    role: 'DSA Administrator',
    roleKey: 'owner',
    orgSlug: 'jai-automobiles',
    identifier: 'admin@jaiautomobiles.com',
    pass: 'JaiAuto@123',
    desktopLabel: 'Administrator',
    mobileLabel: 'Admin',
  },
  {
    role: 'Priya Sharma (Telecaller)',
    roleKey: 'telecaller',
    orgSlug: 'jai-automobiles',
    identifier: 'priya.sharma@jaiautomobiles.com',
    pass: 'JaiAuto@123',
    desktopLabel: 'Priya S.',
    mobileLabel: 'Priya',
  },
  {
    role: 'Rahul Verma (Telecaller)',
    roleKey: 'telecaller',
    orgSlug: 'jai-automobiles',
    identifier: 'rahul.verma@jaiautomobiles.com',
    pass: 'JaiAuto@123',
    desktopLabel: 'Rahul V.',
    mobileLabel: 'Rahul',
  },
]

interface DemoAccessBarProps {
  onSelectCredential: (credential: DemoCredential) => void
  activeIdentifier?: string
  className?: string
}

export const DemoAccessBar: React.FC<DemoAccessBarProps> = ({
  onSelectCredential,
  activeIdentifier,
  className = '',
}) => {
  return (
    <nav
      className={`demo-access-bar ${className}`}
      aria-label="Demo operator quick select"
    >
      {/* Desktop View Pill */}
      <div className="demo-access-desktop">
        <span className="demo-access-label">Demo Access:</span>
        <div className="demo-access-items">
          {DEMO_CREDENTIALS.map((cred, index) => {
            const isActive = activeIdentifier === cred.identifier
            return (
              <React.Fragment key={cred.identifier}>
                {index > 0 && <span className="demo-access-dot" aria-hidden="true">•</span>}
                <button
                  type="button"
                  className={`demo-access-btn ${isActive ? 'demo-access-btn--active' : ''}`}
                  onClick={() => onSelectCredential(cred)}
                  title={`Fill credentials for ${cred.role}`}
                  aria-pressed={isActive}
                >
                  {cred.desktopLabel}
                </button>
              </React.Fragment>
            )
          })}
        </div>
      </div>

      {/* Mobile View Pill */}
      <div className="demo-access-mobile">
        <span className="demo-mobile-label">DEMO:</span>
        <div className="demo-mobile-items">
          {DEMO_CREDENTIALS.map((cred, index) => {
            const isActive = activeIdentifier === cred.identifier
            return (
              <React.Fragment key={cred.identifier}>
                {index > 0 && <span className="demo-mobile-dot" aria-hidden="true">•</span>}
                <button
                  type="button"
                  className={`demo-mobile-chip ${isActive ? 'demo-mobile-chip--active' : ''}`}
                  onClick={() => onSelectCredential(cred)}
                  title={`Fill credentials for ${cred.role}`}
                  aria-pressed={isActive}
                >
                  {cred.mobileLabel}
                </button>
              </React.Fragment>
            )
          })}
        </div>
      </div>
    </nav>
  )
}

export default DemoAccessBar
