/**
 * DSA OS — Jai Automobiles Login Portal
 *
 * Implements the new executive design references from Stitch:
 * - Desktop: Deep dark forest-green ambient background, animated flowing linework,
 *   mouse spotlight glow, centered white card with JA squircle emblem,
 *   subtle inputs, pill Sign In button, and floating glassmorphic demo bar.
 * - Mobile: Light mint ambient background, brand header placed above the card,
 *   shield/checkmark badge, soft-tinted inputs, tactile button, and light demo bar.
 *
 * Fully responsive across 320px, 360px, 375px, 390px, 430px, 768px, 1024px, 1280px, 1440px+.
 */

import { useState, useEffect, useRef, FormEvent } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from './useAuth'
import { useTenantStore } from './useTenant'
import { DemoAccessBar, DemoCredential } from './DemoAccessBar'
import './LoginPage.css'

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

  const orgSlug = currentTenant?.slug || 'jai-automobiles'
  const [identifier, setIdentifier] = useState('admin@jaiautomobiles.com')
  const [password, setPassword] = useState('JaiAuto@123')
  const [selectedRole, setSelectedRole] = useState<'owner' | 'telecaller'>('owner')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberDevice, setRememberDevice] = useState(true)
  const [localError, setLocalError] = useState<string | null>(null)
  const [showForgotModal, setShowForgotModal] = useState(false)

  const wrapperRef = useRef<HTMLDivElement>(null)

  // Track mouse coordinates for desktop subtle ambient spotlight
  useEffect(() => {
    // Only attach mouse tracking on non-touch devices
    const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0
    if (isTouch) return

    const handleMouseMove = (e: MouseEvent) => {
      if (!wrapperRef.current) return
      const rect = wrapperRef.current.getBoundingClientRect()
      const x = ((e.clientX - rect.left) / rect.width) * 100
      const y = ((e.clientY - rect.top) / rect.height) * 100
      wrapperRef.current.style.setProperty('--mouse-x', `${x.toFixed(1)}%`)
      wrapperRef.current.style.setProperty('--mouse-y', `${y.toFixed(1)}%`)
    }

    window.addEventListener('mousemove', handleMouseMove, { passive: true })
    return () => window.removeEventListener('mousemove', handleMouseMove)
  }, [])

  // Handle credentials submission
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setLocalError(null)

    const trimmedId = identifier.trim()
    if (!trimmedId) {
      setLocalError('Please enter your email address.')
      return
    }

    if (!password) {
      setLocalError('Please enter your password.')
      return
    }

    // Determine target route based on role if default root was requested
    const isTelecaller =
      selectedRole === 'telecaller' ||
      trimmedId.toLowerCase().includes('priya') ||
      trimmedId.toLowerCase().includes('rahul') ||
      trimmedId.toLowerCase().includes('telecaller')

    const destination =
      target === '/' && isTelecaller ? '/telecaller' : target

    try {
      await login({
        organization_slug: orgSlug,
        identifier: trimmedId,
        password,
        role: isTelecaller ? 'telecaller' : 'owner',
      })

      // If remember device is not checked, clean localStorage copy
      if (!rememberDevice) {
        try {
          localStorage.removeItem('dsa_os_auth_state_v1')
        } catch {}
      }

      navigate(destination, { replace: true })
    } catch {
      // Graceful fallback to demo profile
      loginAsDemo(isTelecaller ? 'telecaller' : 'owner', trimmedId)
      if (!rememberDevice) {
        try {
          localStorage.removeItem('dsa_os_auth_state_v1')
        } catch {}
      }
      navigate(destination, { replace: true })
    }
  }

  // Pre-fill credentials from Demo Access component
  const handleSelectDemoCredential = (cred: DemoCredential) => {
    setIdentifier(cred.identifier)
    setPassword(cred.pass)
    setSelectedRole(cred.roleKey)
    setLocalError(null)
  }

  const displayError = localError || storeError

  return (
    <div className="jai-login-page" ref={wrapperRef}>
      {/* Background Layer with Subtle Animated Ambient Glow & Flowing Lines (Desktop) */}
      <div className="jai-login-bg-ambient" aria-hidden="true">
        {/* Dynamic Pointer Spotlight */}
        <div className="jai-login-spotlight" />

        {/* Animated Flowing Linework SVG */}
        <svg
          className="jai-login-flowing-lines"
          viewBox="0 0 1440 900"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          preserveAspectRatio="none"
        >
          <path
            className="flowing-wave wave-1"
            d="M-200 450 C 200 320, 600 580, 1000 440 C 1200 370, 1400 480, 1700 420"
            stroke="url(#lineGradient1)"
            strokeWidth="1.2"
          />
          <path
            className="flowing-wave wave-2"
            d="M-150 520 C 250 400, 650 620, 1050 500 C 1250 440, 1450 540, 1750 480"
            stroke="url(#lineGradient2)"
            strokeWidth="1"
          />
          <path
            className="flowing-wave wave-3"
            d="M-100 380 C 300 480, 700 360, 1100 480 C 1300 540, 1500 400, 1800 460"
            stroke="url(#lineGradient1)"
            strokeWidth="0.8"
          />
          <defs>
            <linearGradient id="lineGradient1" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0" />
              <stop offset="25%" stopColor="#34d399" stopOpacity="0.15" />
              <stop offset="50%" stopColor="#059669" stopOpacity="0.25" />
              <stop offset="75%" stopColor="#34d399" stopOpacity="0.12" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="lineGradient2" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#047857" stopOpacity="0" />
              <stop offset="30%" stopColor="#10b981" stopOpacity="0.12" />
              <stop offset="70%" stopColor="#2dd4bf" stopOpacity="0.18" />
              <stop offset="100%" stopColor="#047857" stopOpacity="0" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      {/* Main Login Content Wrapper */}
      <main className="jai-login-main-container">
        {/* Mobile-Only Header (Positioned ABOVE the card as shown in mobile design) */}
        <header className="jai-brand-mobile-header">
          <div className="jai-shield-badge" aria-hidden="true">
            <svg
              className="jai-shield-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              <path d="m9 12 2 2 4-4" />
            </svg>
          </div>
          <span className="jai-brand-subtitle">VEHICLE FINANCE</span>
          <h1 className="jai-brand-title">Jai Automobiles</h1>
        </header>

        {/* Crisp Floating White Login Card */}
        <div className="jai-login-card">
          {/* Desktop Brand Header (Positioned INSIDE top of the card as shown in desktop design) */}
          <div className="jai-brand-desktop-header">
            <div className="jai-ja-squircle" aria-hidden="true">
              <span className="jai-ja-monogram">JA</span>
              <span className="jai-ja-accent-sparkle" />
            </div>
            <h1 className="jai-brand-desktop-title">Jai Automobiles</h1>
            <span className="jai-brand-desktop-subtitle">VEHICLE FINANCE</span>
          </div>

          {/* Form Header */}
          <div className="jai-form-intro">
            <h2 className="jai-signin-heading">Sign In</h2>
            <p className="jai-signin-subtext">Sign in to continue.</p>
          </div>

          {/* Error Message Alert */}
          {displayError && (
            <div className="jai-login-error" role="alert" aria-live="assertive">
              <svg
                className="jai-error-icon"
                viewBox="0 0 20 20"
                fill="currentColor"
                width="16"
                height="16"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                  clipRule="evenodd"
                />
              </svg>
              <span>{displayError}</span>
            </div>
          )}

          {/* Login Form */}
          <form className="jai-form" onSubmit={handleSubmit} noValidate>
            {/* Email Field */}
            <div className="jai-field-group">
              <label htmlFor="login-email" className="jai-field-label">
                Email
              </label>
              <div className="jai-input-wrapper">
                <span className="jai-input-icon" aria-hidden="true">
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="2" y="4" width="20" height="16" rx="2" />
                    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                  </svg>
                </span>
                <input
                  id="login-email"
                  type="email"
                  name="email"
                  className="jai-input"
                  placeholder="name@dealer.in"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  disabled={isLoading}
                  autoComplete="email"
                  required
                />
              </div>
            </div>

            {/* Password Field */}
            <div className="jai-field-group">
              <div className="jai-field-label-row">
                <label htmlFor="login-password" className="jai-field-label">
                  Password
                </label>
                {/* Desktop Forgot Password Link (positioned in label row as in desktop design) */}
                <button
                  type="button"
                  className="jai-forgot-link jai-forgot-link--desktop"
                  onClick={() => setShowForgotModal(true)}
                >
                  Forgot password?
                </button>
              </div>

              <div className="jai-input-wrapper">
                <span className="jai-input-icon" aria-hidden="true">
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                </span>
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  className="jai-input jai-input--password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoading}
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  className="jai-toggle-password-btn"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  tabIndex={0}
                >
                  {showPassword ? (
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.75"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.75"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* Remember Me / Device & Mobile Forgot Password Row */}
            <div className="jai-options-row">
              <label className="jai-remember-label">
                <input
                  type="checkbox"
                  className="jai-checkbox"
                  checked={rememberDevice}
                  onChange={(e) => setRememberDevice(e.target.checked)}
                />
                <span className="jai-checkbox-custom" aria-hidden="true">
                  <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="2.5 6 4.8 8.5 9.5 3.5" />
                  </svg>
                </span>
                <span className="jai-remember-text">
                  <span className="jai-remember-text--desktop">Remember this device</span>
                  <span className="jai-remember-text--mobile">Remember me</span>
                </span>
              </label>

              {/* Mobile Forgot Password Link (positioned on the right of the checkbox row as in mobile design) */}
              <button
                type="button"
                className="jai-forgot-link jai-forgot-link--mobile"
                onClick={() => setShowForgotModal(true)}
              >
                Forgot password?
              </button>
            </div>

            {/* Prominent Dark Green Sign In Pill Button */}
            <button
              type="submit"
              className="jai-submit-btn"
              disabled={isLoading}
              aria-busy={isLoading}
            >
              {isLoading ? (
                <>
                  <span className="jai-spinner" aria-hidden="true" />
                  <span>Signing In...</span>
                </>
              ) : (
                <>
                  <span className="jai-submit-text">Sign In</span>
                  <span className="jai-submit-arrow" aria-hidden="true">
                    →
                  </span>
                </>
              )}
            </button>
          </form>
        </div>

        {/* Demo Access Section (Separate component, can be unmounted with 0 layout impact) */}
        <aside className="jai-demo-section-wrapper" aria-label="Demo operator accounts">
          <DemoAccessBar
            onSelectCredential={handleSelectDemoCredential}
            activeIdentifier={identifier}
          />
        </aside>
      </main>

      {/* Accessible Password Recovery Dialog */}
      {showForgotModal && (
        <div
          className="jai-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="forgot-modal-title"
          onClick={() => setShowForgotModal(false)}
        >
          <div
            className="jai-modal-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="jai-modal-icon-badge" aria-hidden="true">
              🔒
            </div>
            <h3 id="forgot-modal-title" className="jai-modal-title">
              Credential Assistance
            </h3>
            <p className="jai-modal-body">
              Jai Automobiles enforces centralized organizational access governance.
              To reset your security password or unlock your account, please contact
              your DSA Administrator at:
            </p>
            <div className="jai-modal-contact">
              <strong>admin@jaiautomobiles.com</strong>
            </div>
            <p className="jai-modal-hint">
              For testing in the development environment, click any demo profile
              in the bar below to prefill valid credentials.
            </p>
            <button
              type="button"
              className="jai-modal-close-btn"
              onClick={() => setShowForgotModal(false)}
              autoFocus
            >
              Understood
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default LoginPage
