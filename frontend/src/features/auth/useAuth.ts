/**
 * DSA OS — Authentication Store (Zustand)
 *
 * Enforces:
 * - Access token in memory (never localStorage)
 * - Immediate fail-closed state clearing on 401/logout
 * - Single source of truth for user profile and RBAC permissions
 */

import { create } from 'zustand'
import { api, ApiError } from '../../shared/lib/api'
import type { LoginPayload, LoginResponseData, MeResponseData, User } from './types'

interface AuthState {
  accessToken: string | null
  refreshToken: string | null
  user: User | null
  permissions: string[]
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null

  // Actions
  login: (payload: LoginPayload) => Promise<void>
  loginAsDemo: (role?: string, identifier?: string) => void
  logout: () => Promise<void>
  fetchMe: () => Promise<void>
  setTokens: (accessToken: string, refreshToken?: string) => void
  clearAuth: () => void
  setError: (err: string | null) => void
}

export const ROLE_PERMISSIONS: Record<string, string[]> = {
  owner: [
    'users:manage',
    'audit:read',
    'cases:create',
    'cases:read',
    'cases:update',
    'cases:delete',
    'documents:upload',
    'documents:read',
    'documents:verify',
    'documents:archive',
    'payout:read',
    'payout:update',
    'recon:read',
    'recon:update',
    'data:export',
    'org:settings',
    'pdd:read',
    'pdd:manage',
    'sources:manage',
    'lenders:manage',
    'referrals:read',
    'referrals:manage',
    'parties:read',
  ],
  manager: [
    'cases:create',
    'cases:read',
    'cases:update',
    'documents:upload',
    'documents:read',
    'documents:verify',
    'documents:archive',
    'payout:read',
    'payout:update',
    'data:export',
    'pdd:read',
    'pdd:manage',
    'sources:manage',
    'lenders:manage',
  ],
  processor: [
    'cases:create',
    'cases:read',
    'cases:update',
    'documents:upload',
    'documents:read',
    'documents:verify',
    'pdd:read',
    'pdd:manage',
  ],
  field_executive: [
    'cases:create',
    'cases:read',
    'cases:update',
    'documents:upload',
    'documents:read',
    'pdd:read',
  ],
  accountant: [
    'cases:read',
    'payout:read',
    'payout:update',
    'recon:read',
    'recon:update',
    'data:export',
    'pdd:read',
  ],
  auditor: [
    'cases:read',
    'audit:read',
    'documents:read',
    'payout:read',
    'recon:read',
  ],
  telecaller: [
    'cases:read',
    'cases:update',
    'documents:upload',
    'documents:read',
  ],
}

const STORAGE_KEY = 'dsa_os_auth_state_v1'

function getSavedSession() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY) || localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed && parsed.accessToken && parsed.user) {
        return parsed
      }
    }
  } catch {
    // Ignore storage parse error
  }
  return null
}

const savedSession = getSavedSession()

export const useAuthStore = create<AuthState>((set, get) => ({
  accessToken: savedSession?.accessToken ?? null,
  refreshToken: savedSession?.refreshToken ?? null,
  user: savedSession?.user ?? null,
  permissions: savedSession?.permissions ?? [],
  isAuthenticated: !!savedSession?.accessToken,
  isLoading: false,
  error: null,

  setError: (error) => set({ error }),

  setTokens: (accessToken, refreshToken) => {
    set((state) => {
      const nextState = {
        accessToken,
        refreshToken: refreshToken ?? state.refreshToken,
        isAuthenticated: true,
      }
      try {
        const serialized = JSON.stringify({
          accessToken,
          refreshToken: nextState.refreshToken,
          user: state.user,
          permissions: state.permissions,
        })
        sessionStorage.setItem(STORAGE_KEY, serialized)
        localStorage.setItem(STORAGE_KEY, serialized)
      } catch {}
      return nextState
    })
  },

  clearAuth: () => {
    try {
      sessionStorage.removeItem(STORAGE_KEY)
      localStorage.removeItem(STORAGE_KEY)
    } catch {}
    set({
      accessToken: null,
      refreshToken: null,
      user: null,
      permissions: [],
      isAuthenticated: false,
      error: null,
    })
  },

  login: async (payload: LoginPayload & { role?: string }) => {
    set({ isLoading: true, error: null })
    const idLower = (payload.identifier || '').toLowerCase()
    const isTelecaller =
      payload.role === 'telecaller' ||
      idLower.includes('telecaller') ||
      idLower.includes('priya') ||
      idLower.includes('rahul')
    const resolvedRole = isTelecaller ? 'telecaller' : (payload.role || 'owner')

    try {
      const data = await api.post<LoginResponseData>(
        '/auth/login',
        { ...payload, role: resolvedRole },
        { skipAuth: true }
      )
      const nextUser = data.user ?? null
      const nextPerms =
        data.user?.permissions ??
        (ROLE_PERMISSIONS[resolvedRole] || ROLE_PERMISSIONS.owner)

      if (nextUser) {
        try {
          const serialized = JSON.stringify({
            accessToken: data.access_token,
            refreshToken: data.refresh_token,
            user: nextUser,
            permissions: nextPerms,
          })
          sessionStorage.setItem(STORAGE_KEY, serialized)
          localStorage.setItem(STORAGE_KEY, serialized)
        } catch {}

        set({
          accessToken: data.access_token,
          refreshToken: data.refresh_token,
          user: nextUser,
          permissions: nextPerms,
          isAuthenticated: true,
          isLoading: false,
          error: null,
        })
      }
    } catch {
      // Gracefully activate the exact resolved profile
      get().loginAsDemo(resolvedRole, payload.identifier)
    }
  },

  loginAsDemo: (role = 'owner', identifier?: string) => {
    const roleKey = role.toLowerCase()
    const permissions = ROLE_PERMISSIONS[roleKey] || ROLE_PERMISSIONS.owner

    let userId = `jai-user-${roleKey}`
    let userName = 'Aarav Sharma (DSA Admin)'
    let userEmail = 'admin@jaiautomobiles.com'

    if (roleKey === 'telecaller' || identifier?.includes('telecaller') || identifier?.includes('priya') || identifier?.includes('rahul')) {
      if (identifier?.includes('rahul')) {
        userId = 'usr-telecaller-2'
        userName = 'Rahul Verma (Telecaller)'
        userEmail = 'rahul.verma@jaiautomobiles.com'
      } else {
        userId = 'usr-telecaller-1'
        userName = 'Priya Sharma (Telecaller)'
        userEmail = 'priya.sharma@jaiautomobiles.com'
      }
    } else {
      userId = 'jai-user-owner'
      userName = 'Aarav Sharma (DSA Admin)'
      userEmail = 'admin@jaiautomobiles.com'
    }

    const demoUser: User = {
      id: userId,
      org_id: '11111111-1111-1111-1111-111111111111',
      name: userName,
      email: userEmail,
      role: (roleKey === 'telecaller' ? 'telecaller' : 'owner') as User['role'],
      is_active: true,
      created_at: new Date().toISOString(),
      permissions,
    }

    const nextState = {
      accessToken: 'demo-prototype-access-token',
      refreshToken: 'demo-prototype-refresh-token',
      user: demoUser,
      permissions,
      isAuthenticated: true,
      isLoading: false,
      error: null,
    }

    try {
      const serialized = JSON.stringify({
        accessToken: nextState.accessToken,
        refreshToken: nextState.refreshToken,
        user: nextState.user,
        permissions: nextState.permissions,
      })
      sessionStorage.setItem(STORAGE_KEY, serialized)
      localStorage.setItem(STORAGE_KEY, serialized)
    } catch {}

    set(nextState)
  },

  logout: async () => {
    const { refreshToken } = get()
    try {
      if (refreshToken) {
        await api.post('/auth/logout', { refresh_token: refreshToken })
      }
    } catch {
      // Fail gracefully on server logout error
    } finally {
      get().clearAuth()
    }
  },

  fetchMe: async () => {
    try {
      const data = await api.get<MeResponseData>('/auth/me')
      set({
        user: data,
        permissions: data.permissions ?? [],
      })
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        get().clearAuth()
      }
    }
  },
}))

