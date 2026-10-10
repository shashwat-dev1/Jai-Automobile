import { useEffect } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
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

const LeadsIcon = () => (
  <svg className="sidebar-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5}>
    <circle cx="10" cy="7" r="3.5" />
    <path d="M3 17c0-3.314 3.134-6 7-6s7 2.686 7 6" />
  </svg>
)

const LendersIcon = () => (
  <svg className="sidebar-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5}>
    <path d="M3 8h14M3 12h14" />
    <rect x="3" y="5" width="14" height="10" rx="1" />
    <path d="M10 5v10" />
  </svg>
)

const PayoutsIcon = () => (
  <svg className="sidebar-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5}>
    <path d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h3" />
    <circle cx="14" cy="14" r="4" />
    <path d="M14 12v2l1 1" />
  </svg>
)

const UsersIcon = () => (
  <svg className="sidebar-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5}>
    <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
  </svg>
)

const AuditIcon = () => (
  <svg className="sidebar-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5}>
    <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
)

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', path: '/', icon: <DashboardIcon /> },
  { label: 'Today Console', path: '/today', icon: <DashboardIcon /> },
  {
    label: 'Active Loan Files',
    path: '/cases',
    icon: <CasesIcon />,
    section: 'Operations',
  },
  {
    label: '+ Case Intake',
    path: '/cases/new',
    icon: <LeadsIcon />,
    permission: PERMISSIONS.CASES_CREATE,
  },
  {
    label: 'PDD Board',
    path: '/pdd',
    icon: <CasesIcon />,
  },
  {
    label: 'Follow-ups',
    path: '/tasks',
    icon: <CasesIcon />,
  },
  {
    label: 'Customers',
    path: '/parties',
    icon: <LeadsIcon />,
  },
  {
    label: 'Lead Sources',
    path: '/sources',
    icon: <LendersIcon />,
  },
  {
    label: 'Source Analytics',
    path: '/reports/sources',
    icon: <LendersIcon />,
  },
  {
    label: 'Partner Lenders',
    path: '/lenders',
    icon: <LendersIcon />,
  },
  {
    label: 'Payouts',
    path: '/payouts',
    icon: <PayoutsIcon />,
    section: 'Finance',
    permission: PERMISSIONS.PAYOUT_READ,
  },
  {
    label: 'Commission Rules',
    path: '/payout/rules',
    icon: <PayoutsIcon />,
    permission: PERMISSIONS.PAYOUT_READ,
  },
  {
    label: 'Attention Queue',
    path: '/payout/attention',
    icon: <PayoutsIcon />,
    permission: PERMISSIONS.PAYOUT_READ,
  },
  {
    label: 'Reconciliation',
    path: '/payout/reconciliation',
    icon: <PayoutsIcon />,
    permission: PERMISSIONS.PAYOUT_READ,
  },
  {
    label: 'Receivables Ledger',
    path: '/payout/outstanding',
    icon: <PayoutsIcon />,
    permission: PERMISSIONS.PAYOUT_READ,
  },
  {
    label: 'Team Members',
    path: '/admin/users',
    icon: <UsersIcon />,
    section: 'Administration',
    permission: PERMISSIONS.USERS_MANAGE,
  },
  {
    label: 'Audit Trail',
    path: '/admin/audit',
    icon: <AuditIcon />,
    permission: PERMISSIONS.AUDIT_READ,
  },
  {
    label: 'Tenants & Branding',
    path: '/admin/organizations',
    icon: <UsersIcon />,
    permission: PERMISSIONS.USERS_MANAGE,
  },
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

  const visibleNavItems = NAV_ITEMS.filter((item) => {
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
                <NavLink
                  to={item.path}
                  end={item.path === '/'}
                  onClick={close}
                  className={({ isActive }) =>
                    ['sidebar-item', isActive ? 'active' : ''].filter(Boolean).join(' ')
                  }
                  aria-label={item.label}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </NavLink>
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
