import React from 'react'
import { useAuthStore } from '../../features/auth/useAuth'
import { useTenantStore } from '../../features/auth/useTenant'
import { useNavDrawer } from '../lib/useNavDrawer'
import { NotificationBell } from '../../features/notifications/NotificationBell'
import './TopBar.css'

export const TopBar: React.FC = () => {
  const user = useAuthStore((s) => s.user)
  const tenantName = useTenantStore(
    (s) => s.currentTenant.settings?.branding?.name || s.currentTenant.name || 'Jai Automobiles'
  )
  const toggle = useNavDrawer((s) => s.toggle)

  const userName = user?.name || 'Aarav Sharma'
  const userRole =
    user?.role === 'owner'
      ? 'HQ Administrator'
      : user?.role === 'telecaller'
      ? 'Telecaller Desk'
      : user?.role?.toUpperCase() || 'HQ Administrator'

  return (
    <header className="topbar-header">
      <div className="topbar-left">
        {/* Mobile Hamburger Menu Button */}
        <button
          type="button"
          className="topbar-menu-btn"
          onClick={toggle}
          aria-label="Open navigation menu"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>

        {/* Mobile Brand Identity (Shown only on narrow screens) */}
        <div className="topbar-mobile-brand">
          <div className="topbar-mobile-logo" aria-hidden="true">
            <span>JA</span>
          </div>
          <div className="topbar-mobile-text">
            <span className="topbar-mobile-title">{tenantName}</span>
            <span className="topbar-mobile-subtitle">FINANCE ADMIN</span>
          </div>
        </div>

        {/* Desktop Breadcrumb Navigation */}
        <nav className="topbar-breadcrumb" aria-label="Breadcrumb">
          <span className="topbar-breadcrumb-parent">Operations Console</span>
          <span className="topbar-breadcrumb-slash">/</span>
          <span className="topbar-breadcrumb-current">Executive Overview</span>
        </nav>
      </div>

      <div className="topbar-right">
        {/* Notification Bell */}
        <NotificationBell />

        {/* User Identity Profile Badge */}
        <div className="topbar-user-badge">
          <div className="topbar-user-avatar" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
            </svg>
          </div>
          <div className="topbar-user-details">
            <span className="topbar-user-name">{userName}</span>
            <span className="topbar-user-role">{userRole}</span>
          </div>
        </div>
      </div>
    </header>
  )
}
