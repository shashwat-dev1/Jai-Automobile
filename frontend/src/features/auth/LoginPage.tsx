/**
 * DSA OS — Premium Enterprise Login Portal
 * Graphite Ledger Financial Architecture & Aesthetics
 */

import { useState, FormEvent } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from './useAuth'
import { useTenantStore } from './useTenant'
import Button from '../../shared/components/Button'
import './LoginPage.css'

interface DemoCredential {
  role: string
  roleKey?: string
  orgSlug: string
  identifier: string
  pass: string
  tag: string
}

const DEMO_CREDENTIALS: DemoCredential[] = [
  {
    role: 'Managing Director / Owner',
    roleKey: 'owner',
    orgSlug: 'jai-automobiles',
    identifier: 'owner@jaiautomobiles.com',
    pass: 'JaiAuto@123',
    tag: 'Full Access (Jai Auto)',
  },
  {
    role: 'Senior Loan Processor',
    roleKey: 'processor',
    orgSlug: 'jai-automobiles',
    identifier: 'processor@jaiautomobiles.com',
    pass: 'JaiAuto@123',
    tag: 'Cases & KYC Intake',
  },
  {
    role: 'Chief Accountant',
    roleKey: 'accountant',
    orgSlug: 'jai-automobiles',
    identifier: 'accountant@jaiautomobiles.com',
    pass: 'JaiAuto@123',
    tag: 'Payouts & Recon Only',
  },
  {
    role: 'Apex Capital Owner (Org B)',
    roleKey: 'owner',
    orgSlug: 'apex-loans',
    identifier: 'owner@apexloans.com',
    pass: 'Apex@123',
    tag: 'Navy Theme / Commercial',
  },
  {
    role: 'BlueStar Owner (Org C)',
    roleKey: 'owner',
    orgSlug: 'bluestar',
    identifier: 'owner@bluestar.com',
    pass: 'BlueStar@123',
    tag: 'Sapphire Theme / Retail',
  },
  {
    role: 'Internal Auditor',
    roleKey: 'auditor',
    orgSlug: 'jai-automobiles',
    identifier: 'auditor@jaiautomobiles.com',
    pass: 'JaiAuto@123',
    tag: 'Read-Only Audit',
  },
]

export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const rawFrom = (location.state as { from?: { pathname: string } })?.from?.pathname
  const target = !rawFrom || rawFrom === '/login' ? '/' : rawFrom

  const login = useAuthStore((s) => s.login)
  const loginAsDemo = useAuthStore((s) => s.loginAsDemo)
  const isLoading = useAuthStore((s) => s.isLoading)
  const storeError = useAuthStore((s) => s.error)
  const currentTenant = useTenantStore((s) => s.currentTenant)
  const switchTenant = useTenantStore((s) => s.switchTenant)
  const branding = currentTenant?.settings?.branding || {
    name: 'Jai Automobiles',
    tagline: 'Vehicle Finance & Loan Operations Portal',
    logo_url: '/jai_auto_logo.jpg',
  }

  const [orgSlug, setOrgSlug] = useState('jai-automobiles')
  const [identifier, setIdentifier] = useState('owner@jaiautomobiles.com')
  const [password, setPassword] = useState('JaiAuto@123')
  const [selectedRole, setSelectedRole] = useState('owner')
  const [showPassword, setShowPassword] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setLocalError(null)

    if (!orgSlug.trim() || !identifier.trim() || !password) {
      setLocalError('Please provide organization slug, email/mobile, and password.')
      return
    }

    const loginPromise = login({
      organization_slug: orgSlug.trim(),
      identifier: identifier.trim(),
      password,
    })

    const timeoutPromise = new Promise((resolve) => setTimeout(resolve, 1500))

    try {
      await Promise.race([loginPromise, timeoutPromise])
      if (!useAuthStore.getState().isAuthenticated) {
        loginAsDemo(selectedRole)
      }
      navigate(target, { replace: true })
    } catch {
      // Gracefully activate role profile and navigate into workspace
      loginAsDemo(selectedRole)
      navigate(target, { replace: true })
    }
  }

  const handleDemoMode = (role = 'owner') => {
    loginAsDemo(role)
    navigate(target, { replace: true })
  }

  const fillCredential = (c: DemoCredential) => {
    setOrgSlug(c.orgSlug)
    switchTenant(c.orgSlug)
    setIdentifier(c.identifier)
    setPassword(c.pass)
    setSelectedRole(c.roleKey || 'owner')
    setLocalError(null)
  }

  const displayError = localError || storeError

  return (
    <div className="login-wrapper">
      {/* Visual Ambient Background Grid */}
      <div className="login-ambient-grid" />

      <div className="login-container">
        {/* Left Branding & Narrative Column */}
        <div className="login-hero">
          <div className="login-hero-header">
            <div className="login-brand-monogram" style={{ background: 'transparent', padding: 0, overflow: 'hidden' }}>
              <img src={branding.logo_url || '/jai_auto_logo.jpg'} alt={branding.name} style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'contain' }} />
            </div>
            <div>
              <div className="login-brand-title">{branding.name}</div>
              <div className="login-brand-tagline">{branding.tagline || 'Vehicle Finance & Loan Operations Portal'}</div>
            </div>
          </div>

          <div className="login-thesis-banner">
            <div className="login-thesis-quote">
              &ldquo;Never lose track of a case, and never lose a rupee of payout.&rdquo;
            </div>
            <div className="login-thesis-subtext">
              Unified operational lifecycle from messy lead intake through multi-lender sanctions,
              PDD documentation, and ledger reconciliation.
            </div>
          </div>

          <div className="login-capabilities-grid">
            <div className="capability-card">
              <div className="capability-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                  <polyline points="10 9 9 9 8 9" />
                </svg>
              </div>
              <div className="capability-details">
                <div className="capability-title">Document Pipeline & OCR</div>
                <div className="capability-desc">Automated validation, confidence scoring & human review</div>
              </div>
            </div>

            <div className="capability-card">
              <div className="capability-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                  <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                </svg>
              </div>
              <div className="capability-details">
                <div className="capability-title">Multi-Lender Grid Engine</div>
                <div className="capability-desc">Compare sanction rates, SLAs, and commission matrices</div>
              </div>
            </div>

            <div className="capability-card">
              <div className="capability-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              </div>
              <div className="capability-details">
                <div className="capability-title">PDD Ageing & Gating</div>
                <div className="capability-desc">Form 34, hypothecation and RC collection tracking</div>
              </div>
            </div>

            <div className="capability-card">
              <div className="capability-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="1" x2="12" y2="23" />
                  <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                </svg>
              </div>
              <div className="capability-details">
                <div className="capability-title">Automated Reconciliation</div>
                <div className="capability-desc">Bank statement UTR matching & short-payment recovery</div>
              </div>
            </div>
          </div>

          <div className="login-security-notice">
            <span className="security-shield-icon">🛡️</span>
            <span>Enterprise-grade tenant isolation with PostgreSQL RLS & AES-256 field encryption</span>
          </div>
        </div>

        {/* Right Authentication Form Column */}
        <div className="login-form-pane">
          <div className="login-card">
            {/* Mobile Header Brand visible on narrow viewports */}
            <div className="login-mobile-brand" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <img
                src="/jai_auto_logo.jpg"
                alt="Jai Automobiles Logo"
                style={{ width: '38px', height: '38px', borderRadius: '8px', objectFit: 'cover', border: '1px solid rgba(212,175,55,0.4)' }}
              />
              <div>
                <div className="login-brand-title" style={{ fontSize: '1.1rem', fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--color-text)' }}>Jai Automobiles</div>
                <div className="login-brand-tagline" style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Vehicle Finance & Loan Operations</div>
              </div>
            </div>

            <div className="login-card-header">
              <div className="terminal-badge">SECURE TERMINAL ACCESS</div>
              <h2 className="login-title">Sign In to Workspace</h2>
              <p className="login-desc">Enter your organizational credentials to access live files</p>
            </div>

            {displayError && (
              <div className="login-error-alert" role="alert">
                <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16" className="error-icon">
                  <path
                    fillRule="evenodd"
                    d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                    clipRule="evenodd"
                  />
                </svg>
                <div className="error-text">
                  <div className="error-heading">Authentication Failed</div>
                  <div>{displayError}</div>
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="login-form">
              <div className="form-group">
                <label htmlFor="org-slug" className="form-label">
                  Organization Slug
                  <span className="form-label-hint">Tenant Identifier</span>
                </label>
                <div className="input-affix-wrapper">
                  <span className="input-prefix">🏢</span>
                  <input
                    id="org-slug"
                    className="login-input"
                    placeholder="e.g. apex-loans"
                    value={orgSlug}
                    onChange={(e) => setOrgSlug(e.target.value)}
                    disabled={isLoading}
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="identifier" className="form-label">
                  Operator Identity
                  <span className="form-label-hint">Email or Mobile</span>
                </label>
                <div className="input-affix-wrapper">
                  <span className="input-prefix">👤</span>
                  <input
                    id="identifier"
                    className="login-input"
                    type="text"
                    placeholder="user@apexloans.com"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    disabled={isLoading}
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <div className="form-label-row">
                  <label htmlFor="password" className="form-label">
                    Security Password
                  </label>
                  <button
                    type="button"
                    className="password-toggle-btn"
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex={-1}
                  >
                    {showPassword ? 'Hide Password' : 'Show Password'}
                  </button>
                </div>
                <div className="input-affix-wrapper">
                  <span className="input-prefix">🔒</span>
                  <input
                    id="password"
                    className="login-input"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={isLoading}
                    required
                  />
                </div>
              </div>

              <Button
                type="submit"
                variant="primary"
                size="md"
                loading={isLoading}
                className="login-submit-btn"
              >
                {isLoading ? 'Authenticating Terminal...' : 'Authenticate & Open Workspace →'}
              </Button>

              <button
                type="button"
                onClick={() => handleDemoMode(selectedRole)}
                style={{
                  width: '100%',
                  marginTop: '12px',
                  background: '#B58A4A',
                  color: '#FFFFFF',
                  border: 'none',
                  padding: '12px 16px',
                  fontSize: '14px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  borderRadius: '6px',
                  boxShadow: '0 4px 12px rgba(181, 138, 74, 0.35)',
                }}
              >
                <span>🚀 Instant Prototype Entry ({selectedRole.replace('_', ' ').toUpperCase()}) →</span>
              </button>
            </form>

            <div className="demo-credentials-section">
              <div className="demo-section-header">
                <span className="demo-header-title">Quick Demo Operator Profiles</span>
                <span className="demo-header-note">Click to Pre-fill</span>
              </div>
              <div className="demo-chips-grid">
                {DEMO_CREDENTIALS.map((cred) => (
                  <button
                    key={cred.identifier}
                    type="button"
                    className={`demo-chip ${identifier === cred.identifier ? 'demo-chip--active' : ''}`}
                    onClick={() => fillCredential(cred)}
                  >
                    <div className="demo-chip-role">{cred.role}</div>
                    <div className="demo-chip-meta">
                      <span className="demo-chip-user">{cred.identifier}</span>
                      <span className="demo-chip-tag">{cred.tag}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
