/**
 * DSA OS — RBAC Permission Hook
 *
 * Checks user permissions and roles according to SRS Appendix B.
 */

import { useAuthStore } from './useAuth'
import type { Permission, Role } from './types'

export function usePermission() {
  const user = useAuthStore((s) => s.user)
  const permissions = useAuthStore((s) => s.permissions)

  const can = (permission: Permission | string): boolean => {
    if (!user) return false
    if (user.role === 'owner') return true
    return permissions.includes(permission)
  }

  const hasRole = (roles: Role | Role[]): boolean => {
    if (!user) return false
    const allowed = Array.isArray(roles) ? roles : [roles]
    return allowed.includes(user.role)
  }

  return { can, hasRole, user, role: user?.role }
}
