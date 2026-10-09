import React, { useState, useEffect } from 'react'
import { api, ApiError } from '../../shared/lib/api'
import Button from '../../shared/components/Button'
import { TASK_TYPES } from './types'

interface UserOption {
  id: string
  name: string
  role: string
}

interface TaskFormModalProps {
  caseId?: string
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

export const TaskFormModal: React.FC<TaskFormModalProps> = ({
  caseId,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [title, setTitle] = useState('')
  const [type, setType] = useState('call')
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    return d.toISOString().slice(0, 16)
  })
  const [description, setDescription] = useState('')
  const [assignedToId, setAssignedToId] = useState('')
  const [users, setUsers] = useState<UserOption[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen) {
      api.get<UserOption[]>('/auth/users')
        .then((data) => {
          setUsers(data)
          if (data.length > 0 && !assignedToId) {
            setAssignedToId(data[0].id)
          }
        })
        .catch(() => {
          // Users list might not be accessible if non-manager, ignore
        })
    }
  }, [isOpen, assignedToId])

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) {
      setError('Task title is required')
      return
    }

    setError(null)
    setIsLoading(true)

    try {
      await api.post('/workflow/tasks', {
        case_id: caseId || undefined,
        type,
        title: title.trim(),
        description: description.trim() || undefined,
        due_date: new Date(dueDate).toISOString(),
        assigned_to_id: assignedToId || undefined,
      })
      onSuccess()
      onClose()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to schedule task')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: 480 }}>
        <div className="modal-header">
          <h2 className="type-h2">Schedule Follow-up Task</h2>
          <button type="button" className="close-btn" onClick={onClose}>×</button>
        </div>

        {error && <div className="alert-error" style={{ marginBottom: 16 }}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group" style={{ marginBottom: 16 }}>
            <label className="field-label">Task Title / Action *</label>
            <input
              type="text"
              className="form-control"
              placeholder="e.g. Call applicant for 6-month bank statement"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div className="form-group">
              <label className="field-label">Task Type</label>
              <select className="form-control" value={type} onChange={(e) => setType(e.target.value)}>
                {TASK_TYPES.map((t) => (
                  <option key={t.code} value={t.code}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="field-label">Due Date & Time *</label>
              <input
                type="datetime-local"
                className="form-control"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                required
              />
            </div>
          </div>

          {users.length > 0 && (
            <div className="form-group" style={{ marginBottom: 16 }}>
              <label className="field-label">Assignee</label>
              <select
                className="form-control"
                value={assignedToId}
                onChange={(e) => setAssignedToId(e.target.value)}
              >
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.role})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="form-group" style={{ marginBottom: 20 }}>
            <label className="field-label">Notes / Instructions (Optional)</label>
            <textarea
              className="form-control"
              rows={2}
              placeholder="Specific details for assignee..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="modal-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
            <Button variant="secondary" onClick={onClose} disabled={isLoading}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={isLoading}>
              {isLoading ? 'Scheduling...' : 'Save Task'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
