/**
 * DSA OS — Authentication & RBAC Types
 */

export type Role =
  | 'owner'
  | 'manager'
  | 'processor'
  | 'field_executive'
  | 'accountant'
  | 'auditor'
  | 'telecaller'
  | 'platform_admin'

export interface User {
  id: string
  org_id: string
  name: string
  email: string
  phone?: string | null
  role: Role
  is_active: boolean
  created_at: string
  permissions?: string[]
}

export interface LoginPayload {
  organization_slug: string
  identifier: string
  password: string
}

export interface AuthTokens {
  access_token: string
  refresh_token: string
  token_type: string
  expires_in: number
}

export interface LoginResponseData extends AuthTokens {
  user: User
}

export interface MeResponseData extends User {
  permissions: string[]
}

export const PERMISSIONS = {
  USERS_MANAGE: 'users:manage',
  AUDIT_READ: 'audit:read',
  CASES_CREATE: 'cases:create',
  CASES_READ: 'cases:read',
  CASES_UPDATE: 'cases:update',
  CASES_DELETE: 'cases:delete',
  DOCS_UPLOAD: 'documents:upload',
  DOCS_READ: 'documents:read',
  DOCS_VERIFY: 'documents:verify',
  DOCS_ARCHIVE: 'documents:archive',
  PAYOUT_READ: 'payout:read',
  PAYOUT_UPDATE: 'payout:update',
  RECON_READ: 'recon:read',
  RECON_UPDATE: 'recon:update',
  DATA_EXPORT: 'data:export',
  ORG_SETTINGS: 'org:settings',
  REFERRALS_READ: 'referrals:read',
  REFERRALS_MANAGE: 'referrals:manage',
  SOURCES_MANAGE: 'sources:manage',
  PARTIES_READ: 'parties:read',
} as const

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS]
