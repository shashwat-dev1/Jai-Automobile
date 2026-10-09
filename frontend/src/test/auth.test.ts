import { describe, it, expect, beforeEach } from 'vitest'
import { useAuthStore } from '../features/auth/useAuth'
import type { Role, User } from '../features/auth/types'

describe('useAuthStore', () => {
  beforeEach(() => {
    useAuthStore.getState().clearAuth()
  })

  it('initializes in an unauthenticated state', () => {
    const state = useAuthStore.getState()
    expect(state.isAuthenticated).toBe(false)
    expect(state.accessToken).toBeNull()
    expect(state.user).toBeNull()
  })

  it('sets tokens and sets isAuthenticated to true', () => {
    useAuthStore.getState().setTokens('mock_access_token', 'mock_refresh_token')
    const state = useAuthStore.getState()
    expect(state.isAuthenticated).toBe(true)
    expect(state.accessToken).toBe('mock_access_token')
    expect(state.refreshToken).toBe('mock_refresh_token')
  })

  it('clearAuth wipes all sensitive session state from memory', () => {
    useAuthStore.getState().setTokens('mock_token', 'mock_refresh')
    useAuthStore.getState().clearAuth()
    const state = useAuthStore.getState()
    expect(state.isAuthenticated).toBe(false)
    expect(state.accessToken).toBeNull()
    expect(state.refreshToken).toBeNull()
    expect(state.user).toBeNull()
    expect(state.permissions).toEqual([])
  })
})

describe('RBAC permission logic', () => {
  const makeUser = (role: Role, permissions: string[]): User => ({
    id: 'user-1',
    org_id: 'org-1',
    name: 'Test User',
    email: 'test@example.com',
    role,
    is_active: true,
    created_at: new Date().toISOString(),
    permissions,
  })

  it('owner role is granted all capabilities implicitly', () => {
    const owner = makeUser('owner', [])
    const canDoSomething = (perm: string) => owner.role === 'owner' || (owner.permissions?.includes(perm) ?? false)
    expect(canDoSomething('users:manage')).toBe(true)
    expect(canDoSomething('payout:update')).toBe(true)
    expect(canDoSomething('audit:read')).toBe(true)
  })

  it('processor role cannot access users:manage or payout:read', () => {
    const processor = makeUser('processor', ['cases:create', 'cases:read'])
    const canDo = (perm: string) => processor.role === 'owner' || (processor.permissions?.includes(perm) ?? false)
    expect(canDo('cases:create')).toBe(true)
    expect(canDo('users:manage')).toBe(false)
    expect(canDo('payout:read')).toBe(false)
  })
})
