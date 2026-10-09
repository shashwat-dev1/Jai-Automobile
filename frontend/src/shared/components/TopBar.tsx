import React from 'react'
import { useAuthStore } from '../../features/auth/useAuth'
import { useNavDrawer } from '../lib/useNavDrawer'
import { NotificationBell } from '../../features/notifications/NotificationBell'
import './TopBar.css'

export const TopBar: React.FC = () => {
  const user = useAuthStore((s) => s.user)
  const toggle = useNavDrawer((s) => s.toggle)

  return (
    <header className="topbar-header">
      <div className="topbar-left">
        <button
          type="button"
          className="topbar-menu-btn"
          onClick={toggle}
          aria-label="Open navigation menu"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>

        <span className="topbar-terminal-badge">
          Jai Automobiles
        </span>

        <span className="topbar-operator-text">
          {user ? `Operator: ${user.name}` : 'Operator: Field Terminal'}
        </span>
      </div>

      <div className="topbar-right">
        <div className="topbar-live-indicator">
          <span className="topbar-live-dot" />
          <span className="topbar-live-label">Live</span>
        </div>

        <NotificationBell />
      </div>
    </header>
  )
}
