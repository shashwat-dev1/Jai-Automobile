/**
 * DSA OS — User Management (Owner Only)
 *
 * Implements PERM_USERS_MANAGE:
 * - View tenant organization users
 * - Create new user with role assignment
 * - Deactivate / reactivate user (instant session invalidation via auth_version)
 */

import { useState, useEffect, useCallback, FormEvent } from 'react'
import { api, ApiError } from '../../shared/lib/api'
import Button from '../../shared/components/Button'
import Input from '../../shared/components/Input'
import type { Role, User } from '../auth/types'
import './UsersPage.css'

const ROLES: { value: Role; label: string }[] = [
  { value: 'owner', label: 'Owner (Full Access)' },
  { value: 'manager', label: 'Manager (Operations & Approval)' },
  { value: 'processor', label: 'Loan Processor (Files & Docs)' },
  { value: 'field_executive', label: 'Field Executive (Lead & Docs)' },
  { value: 'accountant', label: 'Accountant (Payout & Recon)' },
  { value: 'auditor', label: 'Auditor (Read-Only Compliance)' },
]

export function UsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Create User Modal State
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [role, setRole] = useState<Role>('processor')
  const [password, setPassword] = useState('')
  const [createError, setCreateError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const loadUsers = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const data = await api.get<User[]>('/users')
      setUsers(Array.isArray(data) ? data : [])
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load organization users')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadUsers()
  }, [loadUsers])

  const handleCreateUser = async (e: FormEvent) => {
    e.preventDefault()
    setCreateError(null)

    if (!name.trim() || !email.trim() || !password) {
      setCreateError('Name, email, and initial password are required.')
      return
    }

    setIsSubmitting(true)
    try {
      await api.post<User>('/users', {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim() || null,
        role,
        password,
      })
      setShowCreateModal(false)
      setName('')
      setEmail('')
      setPhone('')
      setPassword('')
      await loadUsers()
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : 'Failed to create user')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleToggleActive = async (user: User) => {
    const nextState = !user.is_active
    const confirmMsg = nextState
      ? `Reactivate user ${user.name}?`
      : `Deactivate user ${user.name}? Their sessions will be invalidated immediately.`

    if (!window.confirm(confirmMsg)) return

    try {
      await api.patch<User>(`/users/${user.id}`, { is_active: nextState })
      await loadUsers()
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Failed to update user status')
    }
  }

  return (
    <div className="users-page">
      <div className="users-page-header">
        <div>
          <h1 className="type-h1">Team & Access Control</h1>
          <p className="type-body-md" style={{ color: 'var(--color-text-secondary)' }}>
            Manage organization members, assign operational roles, and enforce session security.
          </p>
        </div>
        <Button variant="primary" onClick={() => setShowCreateModal(true)}>
          + Add Team Member
        </Button>
      </div>

      {error && (
        <div className="users-error-alert" role="alert">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="users-loading-state">Loading team roster...</div>
      ) : users.length === 0 ? (
        <div className="users-empty-state">
          <h3>No team members found</h3>
          <p>Click "Add Team Member" to invite staff.</p>
        </div>
      ) : (
        <div className="users-table-container">
          <table className="users-table">
            <thead>
              <tr>
                <th>Member</th>
                <th>Contact</th>
                <th>Role</th>
                <th>Status</th>
                <th>Created</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>
                    <div className="user-name-cell">
                      <span className="user-avatar-badge">{u.name.charAt(0).toUpperCase()}</span>
                      <div>
                        <div className="user-name">{u.name}</div>
                        <div className="user-email">{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className="type-mono-sm">{u.phone || '—'}</span>
                  </td>
                  <td>
                    <span className={`role-badge role-${u.role}`}>{u.role.replace('_', ' ')}</span>
                  </td>
                  <td>
                    <span className={`status-pill ${u.is_active ? 'active' : 'inactive'}`}>
                      {u.is_active ? 'Active' : 'Deactivated'}
                    </span>
                  </td>
                  <td>
                    <span className="type-mono-sm">
                      {new Date(u.created_at).toLocaleDateString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <Button
                      variant={u.is_active ? 'secondary' : 'primary'}
                      size="sm"
                      onClick={() => handleToggleActive(u)}
                    >
                      {u.is_active ? 'Deactivate' : 'Reactivate'}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create User Modal */}
      {showCreateModal && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-header">
              <h2 className="type-h2">Add Team Member</h2>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setShowCreateModal(false)}
              >
                ✕
              </button>
            </div>

            {createError && <div className="users-error-alert">{createError}</div>}

            <form onSubmit={handleCreateUser} className="modal-form">
              <Input
                id="user-name"
                label="Full Name"
                placeholder="e.g. Ramesh Kumar"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />

              <Input
                id="user-email"
                label="Email Address"
                type="email"
                placeholder="ramesh@apexcapital.in"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />

              <Input
                id="user-phone"
                label="Mobile Number (Optional)"
                type="tel"
                placeholder="+91 98765 43210"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />

              <div className="input-group">
                <label htmlFor="user-role" className="input-label">
                  Assigned Role
                </label>
                <select
                  id="user-role"
                  className="role-select"
                  value={role}
                  onChange={(e) => setRole(e.target.value as Role)}
                >
                  {ROLES.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>

              <Input
                id="user-password"
                label="Temporary Password"
                type="password"
                placeholder="Minimum 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />

              <div className="modal-actions">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setShowCreateModal(false)}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button type="submit" variant="primary" loading={isSubmitting}>
                  Create Member
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
