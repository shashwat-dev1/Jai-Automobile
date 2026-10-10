/**
 * DSA OS — Multi-Tenant White-Label Branding & Customization Store (Zustand)
 *
 * Manages:
 * - Dynamic organization branding (Name, Tagline, Logo URL, Colors)
 * - Live CSS theme token injection (:root variables)
 * - Module entitlements checking
 * - Multi-tenant workspace switching (Jai Auto, Apex Capital, BlueStar Finance)
 */

import { create } from 'zustand'
import { api } from '../../shared/lib/api'
import { JAI_MOCK_ORGANIZATIONS } from '../../shared/lib/mockDatabase'

export interface TenantBranding {
  name: string
  tagline: string
  logo_url: string
  theme_preset: 'gold_emerald' | 'navy_slate' | 'sapphire_royal' | 'obsidian_amber'
  primary_color: string
  accent_color: string
}

export interface TenantModules {
  cases: boolean
  documents: boolean
  lenders: boolean
  pdd: boolean
  payout: boolean
  reconciliation: boolean
  reports: boolean
  audit: boolean
  [key: string]: boolean
}

export interface TenantOrganization {
  id: string
  name: string
  slug: string
  plan: string
  region: string
  is_active: boolean
  settings: {
    branding: TenantBranding
    modules: TenantModules
  }
}

export const THEME_PRESETS: Record<string, { primary_color: string; accent_color: string; bg_navigation: string }> = {
  gold_emerald: {
    primary_color: '#10b981',
    accent_color: '#fbbf24',
    bg_navigation: '#064e3b',
  },
  navy_slate: {
    primary_color: '#2563eb',
    accent_color: '#94a3b8',
    bg_navigation: '#0f172a',
  },
  sapphire_royal: {
    primary_color: '#4f46e5',
    accent_color: '#38bdf8',
    bg_navigation: '#1e1b4b',
  },
  obsidian_amber: {
    primary_color: '#0f172a',
    accent_color: '#b45309',
    bg_navigation: '#020617',
  },
}

function applyThemeToDom(branding: TenantBranding) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  const preset = THEME_PRESETS[branding.theme_preset] || THEME_PRESETS.gold_emerald

  const primary = branding.primary_color || preset.primary_color
  const accent = branding.accent_color || preset.accent_color
  const navBg = preset.bg_navigation

  root.style.setProperty('--color-primary', primary)
  root.style.setProperty('--color-accent', accent)
  root.style.setProperty('--color-primary-subtle', `${primary}18`)
  root.style.setProperty('--color-accent-subtle', `${accent}18`)
  root.style.setProperty('--bg-navigation', navBg)
}

interface TenantState {
  currentTenant: TenantOrganization
  allTenants: TenantOrganization[]
  isLoading: boolean
  error: string | null

  // Actions
  loadTenant: () => Promise<void>
  switchTenant: (slug: string) => Promise<void>
  updateBranding: (branding: Partial<TenantBranding>) => Promise<void>
  isModuleEnabled: (moduleKey: string) => boolean
}

const DEFAULT_ORG: TenantOrganization = (JAI_MOCK_ORGANIZATIONS[0] as unknown as TenantOrganization) || {
  id: '11111111-1111-1111-1111-111111111111',
  name: 'Jai Automobiles',
  slug: 'jai-automobiles',
  plan: 'growth',
  region: 'in-west-1',
  is_active: true,
  settings: {
    branding: {
      name: 'Jai Automobiles',
      tagline: 'Vehicle Finance Operations',
      logo_url: '/jai_auto_logo.jpg',
      theme_preset: 'gold_emerald',
      primary_color: '#10b981',
      accent_color: '#fbbf24',
    },
    modules: {
      cases: true,
      documents: true,
      lenders: true,
      pdd: true,
      payout: true,
      reconciliation: true,
      reports: true,
      audit: true,
    },
  },
}

export const useTenantStore = create<TenantState>((set, get) => ({
  currentTenant: DEFAULT_ORG,
  allTenants: JAI_MOCK_ORGANIZATIONS as unknown as TenantOrganization[],
  isLoading: false,
  error: null,

  loadTenant: async () => {
    set({ isLoading: true, error: null })
    try {
      const org = await api.get<TenantOrganization>('/organizations/current')
      if (org && org.settings?.branding) {
        set({ currentTenant: org, isLoading: false })
        applyThemeToDom(org.settings.branding)
        return
      }
    } catch {
      // Fallback to local default org
    }
    const current = get().currentTenant
    applyThemeToDom(current.settings.branding)
    set({ isLoading: false })
  },

  switchTenant: async (slug: string) => {
    const found = get().allTenants.find((t) => t.slug === slug || t.id === slug)
    if (found) {
      set({ currentTenant: found })
      applyThemeToDom(found.settings.branding)
      return
    }
    try {
      const org = await api.get<TenantOrganization>(`/organizations/${slug}`)
      if (org && org.settings?.branding) {
        set({ currentTenant: org })
        applyThemeToDom(org.settings.branding)
      }
    } catch (err: unknown) {
      console.warn('Tenant switch error:', err)
    }
  },

  updateBranding: async (brandingUpdate: Partial<TenantBranding>) => {
    const current = get().currentTenant
    const updatedBranding = {
      ...current.settings.branding,
      ...brandingUpdate,
    }
    const updatedTenant: TenantOrganization = {
      ...current,
      settings: {
        ...current.settings,
        branding: updatedBranding,
      },
    }
    set({ currentTenant: updatedTenant })
    applyThemeToDom(updatedBranding)

    try {
      await api.patch('/organizations/current/branding', updatedBranding)
    } catch (e) {
      console.warn('Branding API patch notice:', e)
    }
  },

  isModuleEnabled: (moduleKey: string) => {
    const mods = get().currentTenant.settings?.modules
    if (!mods) return true
    return mods[moduleKey] !== false
  },
}))

// Auto-initialize theme on import
if (typeof window !== 'undefined') {
  applyThemeToDom(DEFAULT_ORG.settings.branding)
}
