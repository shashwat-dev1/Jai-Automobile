/**
 * DSA OS — Platform Administration & Multi-Tenant White-Label Workspace
 *
 * Implements Platform & Multi-Tenant Administration:
 * - Multi-tenant directory with active workspace switcher
 * - Tenant Onboarding Wizard (Identity -> Branding/Theme -> Modules -> Initial Owner)
 * - White-label branding customization with live visual preview
 * - Organization activation & suspension controls
 * - Real-time CSS theme token injection across the application
 */

import React, { useState, useEffect, useCallback, FormEvent } from 'react'
import { api, ApiError } from '../../shared/lib/api'
import Button from '../../shared/components/Button'
import Input from '../../shared/components/Input'
import {
  useTenantStore,
  TenantOrganization,
  TenantBranding,
  THEME_PRESETS,
} from '../auth/useTenant'
import './TenantsPage.css'

export const TenantsPage: React.FC = () => {
  const { currentTenant, allTenants, switchTenant, updateBranding } = useTenantStore()
  const [organizations, setOrganizations] = useState<TenantOrganization[]>(allTenants)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  // Onboarding Wizard Modal
  const [showWizardModal, setShowWizardModal] = useState(false)
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3 | 4>(1)

  // Wizard Form State
  const [orgName, setOrgName] = useState('')
  const [orgSlug, setOrgSlug] = useState('')
  const [orgPlan, setOrgPlan] = useState<'starter' | 'growth' | 'enterprise'>('growth')
  const [orgTagline, setOrgTagline] = useState('Vehicle Finance Operations')
  const [themePreset, setThemePreset] = useState<'gold_emerald' | 'navy_slate' | 'sapphire_royal' | 'obsidian_amber'>('navy_slate')
  const [primaryColor, setPrimaryColor] = useState('#2563eb')
  const [accentColor, setAccentColor] = useState('#94a3b8')
  const logoUrl = '/jai_auto_logo.jpg'

  // Modules State
  const [modules, setModules] = useState({
    cases: true,
    documents: true,
    lenders: true,
    pdd: true,
    payout: true,
    reconciliation: true,
    reports: true,
    audit: true,
  })

  // Owner State
  const [ownerName, setOwnerName] = useState('')
  const [ownerEmail, setOwnerEmail] = useState('')
  const [ownerMobile, setOwnerMobile] = useState('')
  const [ownerPassword, setOwnerPassword] = useState('Demo@1234')

  const [isSubmitting, setIsSubmitting] = useState(false)

  // Edit Branding Modal State
  const [showBrandingModal, setShowBrandingModal] = useState(false)
  const [editBrandName, setEditBrandName] = useState(currentTenant?.settings?.branding?.name || '')
  const [editBrandTagline, setEditBrandTagline] = useState(currentTenant?.settings?.branding?.tagline || '')
  const [editBrandPreset, setEditBrandPreset] = useState(currentTenant?.settings?.branding?.theme_preset || 'gold_emerald')
  const [editBrandPrimary, setEditBrandPrimary] = useState(currentTenant?.settings?.branding?.primary_color || '#10b981')
  const [editBrandAccent, setEditBrandAccent] = useState(currentTenant?.settings?.branding?.accent_color || '#fbbf24')

  const loadOrganizations = useCallback(async () => {
    setError(null)
    try {
      const data = await api.get<TenantOrganization[]>('/organizations')
      if (Array.isArray(data) && data.length > 0) {
        setOrganizations(data)
      } else {
        setOrganizations(allTenants)
      }
    } catch {
      setOrganizations(allTenants)
    }
  }, [allTenants])

  useEffect(() => {
    loadOrganizations()
  }, [loadOrganizations])

  const handleSwitchTenant = async (slug: string) => {
    setError(null)
    setSuccessMessage(`Switching active organization to ${slug}...`)
    await switchTenant(slug)
    setSuccessMessage(`Active tenant switched successfully to ${slug}! Branding updated live.`)
    setTimeout(() => setSuccessMessage(null), 3000)
  }

  const handleToggleActive = (orgId: string) => {
    setOrganizations((prev) =>
      prev.map((org) => {
        if (org.id === orgId) {
          const updated = { ...org, is_active: !org.is_active }
          return updated
        }
        return org
      })
    )
  }

  const handleThemePresetSelect = (presetKey: 'gold_emerald' | 'navy_slate' | 'sapphire_royal' | 'obsidian_amber') => {
    setThemePreset(presetKey)
    const preset = THEME_PRESETS[presetKey]
    if (preset) {
      setPrimaryColor(preset.primary_color)
      setAccentColor(preset.accent_color)
    }
  }

  const handleCreateTenant = async (e: FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setError(null)

    const newOrgPayload = {
      name: orgName.trim(),
      slug: orgSlug.trim() || orgName.toLowerCase().replace(/[^a-z0-9]/g, '-'),
      plan: orgPlan,
      region: 'in-west-1',
      is_active: true,
      settings: {
        branding: {
          name: orgName.trim(),
          tagline: orgTagline.trim(),
          logo_url: logoUrl || '/jai_auto_logo.jpg',
          theme_preset: themePreset,
          primary_color: primaryColor,
          accent_color: accentColor,
        },
        modules,
      },
      initial_owner: {
        name: ownerName.trim() || 'Tenant Administrator',
        email: ownerEmail.trim() || `admin@${orgSlug}.com`,
        mobile: ownerMobile.trim() || '9820098200',
        password: ownerPassword,
      },
    }

    try {
      const created = await api.post<TenantOrganization>('/organizations', newOrgPayload)
      setOrganizations((prev) => [created, ...prev])
      setShowWizardModal(false)
      setSuccessMessage(`Tenant "${created.name}" onboarded successfully! Activating workspace...`)
      await switchTenant(created.slug)
      setTimeout(() => setSuccessMessage(null), 4000)
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : 'Failed to create organization')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSaveBranding = async (e: FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    try {
      const updatedBranding: TenantBranding = {
        name: editBrandName.trim(),
        tagline: editBrandTagline.trim(),
        logo_url: currentTenant.settings?.branding?.logo_url || '/jai_auto_logo.jpg',
        theme_preset: editBrandPreset,
        primary_color: editBrandPrimary,
        accent_color: editBrandAccent,
      }
      await updateBranding(updatedBranding)
      setShowBrandingModal(false)
      setSuccessMessage('Tenant branding and colors saved successfully! Live theme applied.')
      setTimeout(() => setSuccessMessage(null), 3000)
    } catch {
      setError('Failed to update tenant branding.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="tenants-page-container">
      {/* Header */}
      <div className="tenants-header">
        <div>
          <h1 className="type-h1" style={{ margin: 0 }}>
            Platform Administration &amp; Multi-Tenant Workspaces
          </h1>
          <p className="type-body-md" style={{ color: 'var(--color-text-secondary)', margin: '6px 0 0' }}>
            White-label SaaS organization management, tenant isolation, dynamic theme presets, and module entitlement governance.
          </p>
        </div>

        <div className="tenants-header-actions">
          <Button variant="secondary" onClick={() => setShowBrandingModal(true)}>
            🎨 Brand &amp; Theme Studio
          </Button>
          <Button variant="primary" onClick={() => { setWizardStep(1); setShowWizardModal(true); }}>
            + Onboard New Tenant
          </Button>
        </div>
      </div>

      {successMessage && (
        <div className="tenants-banner-success">
          ✓ {successMessage}
        </div>
      )}

      {error && (
        <div className="tenants-banner-error">
          ✕ {error}
        </div>
      )}

      {/* Active Tenant Summary Strip */}
      <div className="active-tenant-banner">
        <div className="active-tenant-badge">
          ACTIVE WORKSPACE
        </div>
        <div className="active-tenant-details">
          <div className="active-tenant-logo">
            <img
              src={currentTenant.settings?.branding?.logo_url || '/jai_auto_logo.jpg'}
              alt={currentTenant.name}
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            />
          </div>
          <div>
            <div className="active-tenant-name">
              {currentTenant.settings?.branding?.name || currentTenant.name}
              <span className="tenant-slug-pill">slug: {currentTenant.slug}</span>
            </div>
            <div className="active-tenant-tagline">
              {currentTenant.settings?.branding?.tagline || 'Multi-Tenant Lending Workspace'}
            </div>
          </div>
        </div>

        <div className="active-tenant-colors">
          <div className="color-indicator">
            <span
              className="color-swatch"
              style={{ backgroundColor: currentTenant.settings?.branding?.primary_color || 'var(--color-primary)' }}
            />
            <span className="color-label">Primary</span>
          </div>
          <div className="color-indicator">
            <span
              className="color-swatch"
              style={{ backgroundColor: currentTenant.settings?.branding?.accent_color || 'var(--color-accent)' }}
            />
            <span className="color-label">Accent</span>
          </div>
          <div className="color-indicator">
            <span className="preset-pill">
              Preset: {currentTenant.settings?.branding?.theme_preset || 'gold_emerald'}
            </span>
          </div>
        </div>
      </div>

      {/* Tenants Table */}
      <div className="tenants-table-card">
        <div className="tenants-table-header">
          <h2 className="type-h3" style={{ margin: 0 }}>Empanelled DSA Organizations ({organizations.length})</h2>
          <span className="type-body-xs" style={{ color: 'var(--color-text-secondary)' }}>
            Strict tenant isolation enforced via PostgreSQL Row-Level Security (RLS) &amp; sub-domain slugs.
          </span>
        </div>

        <div className="table-responsive-wrapper">
          <table className="tenants-table">
            <thead>
              <tr>
                <th>Organization &amp; Brand</th>
                <th>Slug &amp; Region</th>
                <th>SaaS Plan</th>
                <th>Theme &amp; Colors</th>
                <th>Enabled Modules</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {organizations.map((org) => {
                const isActiveWorkspace = currentTenant.id === org.id || currentTenant.slug === org.slug
                const branding = org.settings?.branding || {
                  name: org.name,
                  tagline: 'Lending Operations',
                  logo_url: '/jai_auto_logo.jpg',
                  theme_preset: 'navy_slate',
                  primary_color: '#2563eb',
                  accent_color: '#94a3b8',
                }
                const mods = org.settings?.modules || {}

                return (
                  <tr key={org.id} className={isActiveWorkspace ? 'is-active-row' : ''}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div className="table-org-logo">
                          <img src={branding.logo_url} alt={branding.name} />
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>
                            {branding.name}
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>
                            {branding.tagline}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td>
                      <code className="slug-code">{org.slug}</code>
                      <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', marginTop: 2 }}>
                        {org.region || 'in-west-1'}
                      </div>
                    </td>

                    <td>
                      <span className={`plan-badge plan-${org.plan || 'growth'}`}>
                        {(org.plan || 'growth').toUpperCase()}
                      </span>
                    </td>

                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span
                          className="table-color-dot"
                          style={{ backgroundColor: branding.primary_color }}
                          title={`Primary: ${branding.primary_color}`}
                        />
                        <span
                          className="table-color-dot"
                          style={{ backgroundColor: branding.accent_color }}
                          title={`Accent: ${branding.accent_color}`}
                        />
                        <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                          {branding.theme_preset?.replace('_', ' ')}
                        </span>
                      </div>
                    </td>

                    <td>
                      <div className="module-chips-list">
                        {Object.entries(mods)
                          .filter(([, val]) => val)
                          .slice(0, 4)
                          .map(([key]) => (
                            <span key={key} className="mod-chip">
                              {key}
                            </span>
                          ))}
                        {Object.values(mods).filter(Boolean).length > 4 && (
                          <span className="mod-chip-more">
                            +{Object.values(mods).filter(Boolean).length - 4} more
                          </span>
                        )}
                      </div>
                    </td>

                    <td>
                      <button
                        type="button"
                        onClick={() => handleToggleActive(org.id)}
                        className={`status-toggle-btn ${org.is_active ? 'is-active' : 'is-suspended'}`}
                        title="Click to toggle activation status"
                      >
                        {org.is_active ? '● Active' : '○ Suspended'}
                      </button>
                    </td>

                    <td style={{ textAlign: 'right' }}>
                      {isActiveWorkspace ? (
                        <span className="current-workspace-tag">
                          ✓ Current Workspace
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleSwitchTenant(org.slug)}
                          className="switch-workspace-btn"
                        >
                          Switch Workspace →
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Onboarding Wizard Modal */}
      {showWizardModal && (
        <div className="modal-backdrop">
          <div className="modal-content-card wizard-modal">
            <div className="modal-header">
              <div>
                <h3 className="type-h2" style={{ margin: 0 }}>
                  Tenant Onboarding Wizard
                </h3>
                <div className="wizard-step-indicator">
                  Step {wizardStep} of 4: {
                    wizardStep === 1 ? 'Organization Identity' :
                    wizardStep === 2 ? 'White-Label Branding & Theme' :
                    wizardStep === 3 ? 'Module Entitlements' :
                    'Initial Owner Credentials'
                  }
                </div>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setShowWizardModal(false)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={wizardStep === 4 ? handleCreateTenant : (e) => { e.preventDefault(); setWizardStep((prev) => (prev + 1) as any); }}>
              {wizardStep === 1 && (
                <div className="wizard-step-body">
                  <div className="form-group">
                    <label className="type-label-sm" htmlFor="wizard-org-name">DSA / Partner Legal Entity Name *</label>
                    <Input
                      id="wizard-org-name"
                      value={orgName}
                      onChange={(e) => {
                        setOrgName(e.target.value)
                        if (!orgSlug) {
                          setOrgSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '-'))
                        }
                      }}
                      placeholder="e.g. Apex Capital Advisors LLP"
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="type-label-sm" htmlFor="wizard-org-slug">Sub-domain / Slug Identifier *</label>
                    <Input
                      id="wizard-org-slug"
                      value={orgSlug}
                      onChange={(e) => setOrgSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                      placeholder="e.g. apex-loans"
                      required
                    />
                    <span className="form-help-text">Used for tenant URL routing (e.g. apex-loans.dsa-os.com)</span>
                  </div>

                  <div className="form-group">
                    <label className="type-label-sm">Subscription Tier</label>
                    <select
                      value={orgPlan}
                      onChange={(e) => setOrgPlan(e.target.value as any)}
                      className="form-select"
                    >
                      <option value="growth">Growth (Up to 25 Users, Full Payouts & PDD)</option>
                      <option value="starter">Starter (Up to 5 Users, Core Operations)</option>
                      <option value="enterprise">Enterprise (Unlimited, Multi-Branch & Dedicated Audit)</option>
                    </select>
                  </div>
                </div>
              )}

              {wizardStep === 2 && (
                <div className="wizard-step-body">
                  <div className="form-group">
                    <label className="type-label-sm" htmlFor="wizard-tagline">Operational Tagline</label>
                    <Input
                      id="wizard-tagline"
                      value={orgTagline}
                      onChange={(e) => setOrgTagline(e.target.value)}
                      placeholder="e.g. Commercial Vehicle & Machinery Lending"
                    />
                  </div>

                  <div className="form-group">
                    <label className="type-label-sm">Choose Theme Preset</label>
                    <div className="preset-selector-grid">
                      {(Object.keys(THEME_PRESETS) as Array<keyof typeof THEME_PRESETS>).map((presetKey) => {
                        const p = THEME_PRESETS[presetKey]
                        const isSelected = themePreset === presetKey

                        return (
                          <div
                            key={presetKey}
                            onClick={() => handleThemePresetSelect(presetKey as any)}
                            className={`preset-card ${isSelected ? 'is-selected' : ''}`}
                          >
                            <div className="preset-color-strip">
                              <span style={{ backgroundColor: p.primary_color }} />
                              <span style={{ backgroundColor: p.accent_color }} />
                            </div>
                            <div className="preset-name">{presetKey.replace('_', ' ')}</div>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  <div className="form-row">
                    <div className="form-group flex-1">
                      <label className="type-label-sm" htmlFor="wizard-primary-color">Primary Brand Color</label>
                      <div className="color-picker-input">
                        <input
                          type="color"
                          value={primaryColor}
                          onChange={(e) => setPrimaryColor(e.target.value)}
                        />
                        <Input
                          id="wizard-primary-color"
                          value={primaryColor}
                          onChange={(e) => setPrimaryColor(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="form-group flex-1">
                      <label className="type-label-sm" htmlFor="wizard-accent-color">Accent Highlight Color</label>
                      <div className="color-picker-input">
                        <input
                          type="color"
                          value={accentColor}
                          onChange={(e) => setAccentColor(e.target.value)}
                        />
                        <Input
                          id="wizard-accent-color"
                          value={accentColor}
                          onChange={(e) => setAccentColor(e.target.value)}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Live Visual Theme Preview */}
                  <div className="theme-live-preview">
                    <div className="preview-label">LIVE PORTAL PREVIEW</div>
                    <div className="preview-mock-bar" style={{ backgroundColor: primaryColor }}>
                      <span style={{ fontWeight: 700, color: '#fff' }}>{orgName || 'Tenant Portal'}</span>
                      <span className="preview-mock-chip" style={{ backgroundColor: accentColor, color: '#000' }}>Live</span>
                    </div>
                    <div className="preview-mock-content">
                      <button
                        type="button"
                        style={{ backgroundColor: primaryColor, color: '#fff', border: 'none', padding: '6px 12px', borderRadius: 4, fontSize: 12, fontWeight: 600 }}
                      >
                        Sample Primary Action
                      </button>
                      <span style={{ color: accentColor, fontSize: 12, fontWeight: 600, marginLeft: 12 }}>
                        ₹ 15,20,000 Accrued
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {wizardStep === 3 && (
                <div className="wizard-step-body">
                  <p className="type-body-sm" style={{ color: 'var(--color-text-secondary)', marginBottom: 16 }}>
                    Configure enabled feature modules for this tenant organization. Disabled modules will fail-closed at API authorization.
                  </p>

                  <div className="modules-toggle-list">
                    {Object.entries(modules).map(([modKey, isEnabled]) => (
                      <label key={modKey} className="module-toggle-row">
                        <div>
                          <div className="module-title">{modKey.toUpperCase()} MODULE</div>
                          <div className="module-desc">Enable {modKey} capabilities and workflow routes</div>
                        </div>
                        <input
                          type="checkbox"
                          checked={isEnabled}
                          onChange={(e) => setModules((prev) => ({ ...prev, [modKey]: e.target.checked }))}
                          className="module-checkbox"
                        />
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {wizardStep === 4 && (
                <div className="wizard-step-body">
                  <p className="type-body-sm" style={{ color: 'var(--color-text-secondary)', marginBottom: 16 }}>
                    Create the initial Managing Director / Owner account for this organization.
                  </p>

                  <div className="form-group">
                    <label className="type-label-sm" htmlFor="wizard-owner-name">Owner Full Name *</label>
                    <Input
                      id="wizard-owner-name"
                      value={ownerName}
                      onChange={(e) => setOwnerName(e.target.value)}
                      placeholder="e.g. Vikramaditya Singhania"
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="type-label-sm" htmlFor="wizard-owner-email">Owner Work Email *</label>
                    <Input
                      id="wizard-owner-email"
                      type="email"
                      value={ownerEmail}
                      onChange={(e) => setOwnerEmail(e.target.value)}
                      placeholder="e.g. vikram@apexloans.com"
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="type-label-sm" htmlFor="wizard-owner-mobile">Owner Mobile Number *</label>
                    <Input
                      id="wizard-owner-mobile"
                      value={ownerMobile}
                      onChange={(e) => setOwnerMobile(e.target.value)}
                      placeholder="e.g. 9820011223"
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="type-label-sm" htmlFor="wizard-owner-pass">Initial Password</label>
                    <Input
                      id="wizard-owner-pass"
                      type="password"
                      value={ownerPassword}
                      onChange={(e) => setOwnerPassword(e.target.value)}
                      required
                    />
                  </div>
                </div>
              )}

              <div className="wizard-modal-footer">
                {wizardStep > 1 && (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setWizardStep((prev) => (prev - 1) as any)}
                  >
                    ← Back
                  </Button>
                )}

                <div style={{ flex: 1 }} />

                {wizardStep < 4 ? (
                  <Button type="submit" variant="primary">
                    Next Step →
                  </Button>
                ) : (
                  <Button type="submit" variant="primary" disabled={isSubmitting}>
                    {isSubmitting ? 'Creating Tenant...' : 'Complete Onboarding & Launch'}
                  </Button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Quick Brand & Theme Studio Modal */}
      {showBrandingModal && (
        <div className="modal-backdrop">
          <div className="modal-content-card">
            <div className="modal-header">
              <h3 className="type-h2" style={{ margin: 0 }}>
                White-Label Branding Studio
              </h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setShowBrandingModal(false)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveBranding}>
              <div className="form-group">
                <label className="type-label-sm" htmlFor="edit-brand-name">Brand Organization Name</label>
                <Input
                  id="edit-brand-name"
                  value={editBrandName}
                  onChange={(e) => setEditBrandName(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="type-label-sm" htmlFor="edit-brand-tagline">Tagline</label>
                <Input
                  id="edit-brand-tagline"
                  value={editBrandTagline}
                  onChange={(e) => setEditBrandTagline(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="type-label-sm">Theme Preset</label>
                <select
                  value={editBrandPreset}
                  onChange={(e) => {
                    const val = e.target.value as any
                    setEditBrandPreset(val)
                    const p = THEME_PRESETS[val]
                    if (p) {
                      setEditBrandPrimary(p.primary_color)
                      setEditBrandAccent(p.accent_color)
                    }
                  }}
                  className="form-select"
                >
                  <option value="gold_emerald">Gold / Emerald (Jai Automobiles)</option>
                  <option value="navy_slate">Navy / Slate (Apex Capital)</option>
                  <option value="sapphire_royal">Sapphire / Royal (BlueStar Finance)</option>
                  <option value="obsidian_amber">Obsidian / Amber (Graphite Ledger)</option>
                </select>
              </div>

              <div className="form-row">
                <div className="form-group flex-1">
                  <label className="type-label-sm" htmlFor="edit-primary-color">Primary Color</label>
                  <div className="color-picker-input">
                    <input
                      type="color"
                      value={editBrandPrimary}
                      onChange={(e) => setEditBrandPrimary(e.target.value)}
                    />
                    <Input
                      id="edit-primary-color"
                      value={editBrandPrimary}
                      onChange={(e) => setEditBrandPrimary(e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-group flex-1">
                  <label className="type-label-sm" htmlFor="edit-accent-color">Accent Color</label>
                  <div className="color-picker-input">
                    <input
                      type="color"
                      value={editBrandAccent}
                      onChange={(e) => setEditBrandAccent(e.target.value)}
                    />
                    <Input
                      id="edit-accent-color"
                      value={editBrandAccent}
                      onChange={(e) => setEditBrandAccent(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <div className="wizard-modal-footer">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setShowBrandingModal(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" variant="primary" disabled={isSubmitting}>
                  {isSubmitting ? 'Saving...' : 'Apply Live Theme'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
