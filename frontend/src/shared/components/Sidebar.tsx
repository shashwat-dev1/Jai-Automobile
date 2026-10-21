import { useEffect } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../../features/auth/useAuth'
import { usePermission } from '../../features/auth/usePermission'
import { useTenantStore } from '../../features/auth/useTenant'
import { PERMISSIONS } from '../../features/auth/types'
import { useNavDrawer } from '../lib/useNavDrawer'
import './Sidebar.css'

interface NavItem {
  label: string
  path: string
  icon: React.ReactNode
  section?: string
  permission?: string
}

// Icons: simple SVG inline
const DashboardIcon = () => (
  <svg className="sidebar-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5}>
    <rect x="2" y="2" width="7" height="7" rx="1" />
    <rect x="11" y="2" width="7" height="7" rx="1" />
    <rect x="2" y="11" width="7" height="7" rx="1" />
    <rect x="11" y="11" width="7" height="7" rx="1" />
  </svg>
)

const CasesIcon = () => (
  <svg className="sidebar-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5}>
    <path d="M7 4H4a1 1 0 00-1 1v11a1 1 0 001 1h12a1 1 0 001-1V5a1 1 0 00-1-1h-3" />
    <rect x="7" y="2" width="6" height="4" rx="1" />
    <path d="M6 10h8M6 13h5" />
  </svg>
)

const TelecallerIcon = () => (
  <svg className="sidebar-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5}>
    <path d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V17a2 2 0 01-2 2h-1C9.716 19 3 12.284 3 4V5z" />
  </svg>
)

const ReferralsIcon = () => (
  <svg className="sidebar-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5}>
    <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM6 8a2 2 0 11-4 0 2 2 0 014 0zM13 15a4 4 0 00-6 0v2h6v-2zM16 17v-1a3 3 0 00-2-2.83M4 17v-1a3 3 0 012-2.83" />
  </svg>
)

const AllocateTelecallerIcon = () => (
  <svg className="sidebar-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5}>
    <path d="M13 14v-1a3 3 0 00-3-3H6a3 3 0 00-3 3v1" />
    <circle cx="8" cy="6" r="3" />
    <path d="M14 8l2 2 4-4" />
  </svg>
)

const AllocatePartnerIcon = () => (
  <svg className="sidebar-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5}>
    <path d="M3 8l7-5 7 5M4 8v8m4-8v8m4-8v8m4-8v8M2 17h16" />
  </svg>
)

const TelecallerPerformanceIcon = () => (
  <svg className="sidebar-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5}>
    <path d="M3 5a2 2 0 012-2h2.5l1 3-1.5 1.5a9 9 0 004 4L12.5 10l3 1V13.5a2 2 0 01-2 2H9a6.5 6.5 0 01-6.5-6.5V5z" />
    <path d="M12 4l2 2 4-4" />
  </svg>
)

const PartnerPerformanceIcon = () => (
  <svg className="sidebar-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5}>
    <path d="M3 17V10M8 17V6M13 17V3M18 17V8" />
  </svg>
)

const PayoutIcon = () => (
  <svg className="sidebar-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5}>
    <circle cx="10" cy="10" r="7.5" />
    <path d="M7.5 7.5h5M7.5 9.5h5M7.5 7.5h2.5a2 2 0 010 4H7.5l4 4" />
  </svg>
)

// Exact 8 admin items in order
const ADMIN_NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', path: '/', icon: <DashboardIcon /> },
  { label: 'Allocate to Telecaller', path: '/cases/allocate-telecaller', icon: <AllocateTelecallerIcon /> },
  { label: 'Allocate to Partner', path: '/cases/allocate-partner', icon: <AllocatePartnerIcon /> },
  { label: 'Leads', path: '/cases', icon: <CasesIcon /> },
  { label: 'Referral Partners', path: '/referrals', icon: <ReferralsIcon />, permission: PERMISSIONS.REFERRALS_READ },
  { label: 'Telecaller Performance', path: '/telecaller-performance', icon: <TelecallerPerformanceIcon /> },
  { label: 'Partner Performance', path: '/partner-performance', icon: <PartnerPerformanceIcon /> },
  { label: 'Payout Dashboard', path: '/payout-dashboard', icon: <PayoutIcon />, permission: PERMISSIONS.PAYOUT_READ },
]

// Telecaller-only view
const TELECALLER_NAV_ITEMS: NavItem[] = [
  { label: 'Telecaller Workspace', path: '/telecaller', icon: <TelecallerIcon /> },
]

function Sidebar() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, isAuthenticated, logout } = useAuthStore()
  const { can } = usePermission()
  const { isOpen, close } = useNavDrawer()
  const currentTenant = useTenantStore((s) => s.currentTenant)
  const branding = currentTenant?.settings?.branding || {
    name: 'Jai Automobiles',
    tagline: 'Vehicle Finance',
    logo_url: '/jai_auto_logo.jpg',
  }
  let lastSection: string | undefined

  useEffect(() => {
    close()
  }, [location.pathname, close])

  const handleLogout = async () => {
    close()
    await logout()
    navigate('/login')
  }

  const isTelecaller = user?.role === 'telecaller'
  const navItems = isTelecaller ? TELECALLER_NAV_ITEMS : ADMIN_NAV_ITEMS

  const visibleNavItems = navItems.filter((item) => {
    if (!item.permission) return true
    return can(item.permission)
  })

  return (
    <>
      <div
        className={`sidebar-backdrop ${isOpen ? 'is-open' : ''}`}
        onClick={close}
        aria-hidden="true"
      />

      <aside className={`sidebar ${isOpen ? 'is-open' : ''}`} aria-label="Main navigation">
        {/* Brand */}
        <div className="sidebar-brand">
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
            <div className="sidebar-brand-logo" aria-hidden="true" style={{ overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <img src={branding.logo_url || '/jai_auto_logo.jpg'} alt={branding.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
            <div>
              <div className="sidebar-brand-name">{branding.name}</div>
              <div className="sidebar-brand-tag">{branding.tagline || 'Vehicle Finance'}</div>
            </div>
          </div>
          <button
            type="button"
            className="sidebar-close-btn"
            onClick={close}
            aria-label="Close navigation menu"
          >
            ✕
          </button>
        </div>

        {/* Navigation */}
        <nav className="sidebar-nav">
          {visibleNavItems.map((item) => {
            const showSection = item.section && item.section !== lastSection
            if (item.section) lastSection = item.section

            return (
              <div key={item.path}>
                {showSection && (
                  <div className="sidebar-section-label" aria-hidden="true">
                    {item.section}
                  </div>
                )}
                {(() => {
                  const isActive = (() => {
                    if (item.path === '/') return location.pathname === '/'
                    if (item.path === '/cases') {
                      return (
                        location.pathname === '/cases' ||
                        (location.pathname.startsWith('/cases/') &&
                          !location.pathname.startsWith('/cases/allocate-') &&
                          location.pathname !== '/cases/new')
                      )
                    }
                    if (item.path === '/cases/allocate-telecaller') {
                      return location.pathname === '/cases/allocate-telecaller' || location.pathname === '/allocate-telecaller'
                    }
                    if (item.path === '/cases/allocate-partner') {
                      return location.pathname === '/cases/allocate-partner' || location.pathname === '/allocate-partner'
                    }
                    if (item.path === '/cases/new') {
                      return location.pathname === '/cases/new'
                    }
                    return location.pathname.startsWith(item.path)
                  })()

                  return (
                    <Link
                      to={item.path}
                      onClick={close}
                      className={['sidebar-item', isActive ? 'active' : ''].filter(Boolean).join(' ')}
                      aria-label={item.label}
                    >
                      {item.icon}
                      <span>{item.label}</span>
                    </Link>
                  )
                })()}
              </div>
            )
          })}
        </nav>

      {/* User footer */}
      <div className="sidebar-footer">
        <div className="sidebar-user">
          <div className="sidebar-user-avatar" aria-hidden="true">
            {user ? user.name.charAt(0).toUpperCase() : '?'}
          </div>
          <div className="sidebar-user-info">
            <div className="sidebar-user-name">{user ? user.name : 'Not signed in'}</div>
            <div className="sidebar-user-role">{user ? user.role.replace('_', ' ') : '—'}</div>
          </div>
          {isAuthenticated && (
            <button
              type="button"
              className="sidebar-logout-btn"
              onClick={handleLogout}
              title="Sign Out"
            >
              Sign out
            </button>
          )}
        </div>
      </div>
    </aside>
  </>
  )
}

export default Sidebar
