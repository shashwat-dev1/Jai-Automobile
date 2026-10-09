/**
 * DSA OS — Protected Route Guard
 *
 * Enforces authentication and authorization boundaries for routes.
 */

import { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from './useAuth'
import { usePermission } from './usePermission'
import type { Permission, Role } from './types'

interface ProtectedRouteProps {
  children: ReactNode
  requiredPermission?: Permission | string
  requiredRole?: Role | Role[]
}

export function ProtectedRoute({
  children,
  requiredPermission,
  requiredRole,
}: ProtectedRouteProps) {
  const location = useLocation()
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const { can, hasRole, user } = usePermission()

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (requiredPermission && !can(requiredPermission)) {
    return (
      <div style={{ padding: 'var(--spacing-8)', textAlign: 'center' }}>
        <h2 style={{ color: 'var(--color-danger)', marginBottom: 'var(--spacing-2)' }}>
          403 — Access Restricted
        </h2>
        <p className="type-body-md" style={{ color: 'var(--color-text-secondary)' }}>
          Your role ({user?.role}) does not have permission ({requiredPermission}) to access this page.
        </p>
      </div>
    )
  }

  if (requiredRole && !hasRole(requiredRole)) {
    return (
      <div style={{ padding: 'var(--spacing-8)', textAlign: 'center' }}>
        <h2 style={{ color: 'var(--color-danger)', marginBottom: 'var(--spacing-2)' }}>
          403 — Role Unauthorized
        </h2>
        <p className="type-body-md" style={{ color: 'var(--color-text-secondary)' }}>
          This section is restricted to specific organization roles.
        </p>
      </div>
    )
  }

  return <>{children}</>
}
