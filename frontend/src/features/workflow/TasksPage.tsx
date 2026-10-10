import React, { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { api, ApiError } from '../../shared/lib/api'
import Button from '../../shared/components/Button'
import { TaskFormModal } from './TaskFormModal'
import type { Task } from './types'
import './TasksPage.css'

export const TasksPage: React.FC = () => {
  const [tasks, setTasks] = useState<Task[]>([])
  const [filter, setFilter] = useState<'pending' | 'overdue' | 'completed'>('pending')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null)

  const loadTasks = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (filter === 'completed') params.set('status', 'completed')
      else if (filter === 'pending') params.set('status', 'pending')
      else if (filter === 'overdue') params.set('due_filter', 'overdue')
      const url = `/workflow/tasks${params.toString() ? `?${params.toString()}` : ''}`
      const data = await api.get<Task[]>(url)
      setTasks(Array.isArray(data) ? data : [])
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load tasks')
    } finally {
      setIsLoading(false)
    }
  }, [filter])

  useEffect(() => {
    loadTasks()
  }, [loadTasks])

  const handleToggleComplete = async (task: Task) => {
    const newStatus = task.status === 'completed' ? 'pending' : 'completed'
    let outcomeNotes: string | undefined = undefined

    if (newStatus === 'completed') {
      const notes = window.prompt('Outcome / Resolution Notes (Optional):')
      if (notes === null) return
      outcomeNotes = notes.trim() || undefined
    }

    setActionLoadingId(task.id)
    try {
      await api.patch(`/workflow/tasks/${task.id}`, {
        status: newStatus,
        outcome_notes: outcomeNotes,
      })
      await loadTasks()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update task')
    } finally {
      setActionLoadingId(null)
    }
  }

  const formatDue = (dateStr: string) => {
    const d = new Date(dateStr)
    return d.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <div className="tasks-page">
      <div className="tasks-header">
        <div>
          <h1 className="type-h1">Follow-up Tasks & Reminders</h1>
          <p className="type-body-md" style={{ color: 'var(--color-text-secondary)', marginTop: 4 }}>
            Action items across customer calls, document pickups, and credit query resolutions.
          </p>
        </div>
        <Button variant="primary" onClick={() => setShowAddModal(true)}>
          + Schedule Task
        </Button>
      </div>

      <div className="tasks-filters">
        <button
          type="button"
          className={`filter-btn ${filter === 'pending' ? 'active' : ''}`}
          onClick={() => setFilter('pending')}
        >
          Active Tasks
        </button>
        <button
          type="button"
          className={`filter-btn ${filter === 'overdue' ? 'active' : ''}`}
          onClick={() => setFilter('overdue')}
        >
          Overdue ⚠
        </button>
        <button
          type="button"
          className={`filter-btn ${filter === 'completed' ? 'active' : ''}`}
          onClick={() => setFilter('completed')}
        >
          Completed
        </button>
      </div>

      {error && <div className="alert-error" style={{ margin: '16px 0' }}>{error}</div>}

      {isLoading ? (
        <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
          Loading tasks...
        </div>
      ) : tasks.length === 0 ? (
        <div className="empty-tasks-box">
          <div style={{ fontSize: 32, marginBottom: 8 }}>✓</div>
          <div className="type-body-sm font-semibold">No tasks found for current filter</div>
          <div className="type-body-xs" style={{ color: 'var(--color-text-secondary)', marginTop: 4 }}>
            Keep your pipeline running smoothly by scheduling proactive follow-ups.
          </div>
        </div>
      ) : (
        <div className="tasks-table-container">
          <table className="tasks-table">
            <thead>
              <tr>
                <th style={{ width: 40 }}></th>
                <th>Task & Description</th>
                <th>Type</th>
                <th>Related Case</th>
                <th>Assignee</th>
                <th>Due Date</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => (
                <tr
                  key={task.id}
                  className={`${task.status === 'completed' ? 'is-completed-row' : ''} ${
                    task.is_overdue ? 'is-overdue-row' : ''
                  }`}
                >
                  <td style={{ textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={task.status === 'completed'}
                      disabled={actionLoadingId === task.id}
                      onChange={() => handleToggleComplete(task)}
                    />
                  </td>
                  <td>
                    <div className="task-title-text">{task.title}</div>
                    {task.description && <div className="task-desc-text">{task.description}</div>}
                    {task.notes && <div className="task-outcome-text">Outcome: {task.notes}</div>}
                  </td>
                  <td>
                    <span className="type-badge">{task.type.replace(/_/g, ' ')}</span>
                  </td>
                  <td>
                    {task.case_id ? (
                      <Link to={`/cases/${task.case_id}`} className="case-link font-semibold">
                        {task.case_no || 'View Case →'}
                      </Link>
                    ) : (
                      <span style={{ color: 'var(--color-text-tertiary)' }}>General</span>
                    )}
                  </td>
                  <td>
                    <span>{task.owner_name || 'Unassigned'}</span>
                  </td>
                  <td>
                    <div style={{ fontFamily: 'monospace', fontSize: 12 }}>
                      {formatDue(task.due_date)}
                    </div>
                  </td>
                  <td>
                    {task.is_overdue ? (
                      <span className="overdue-tag">OVERDUE</span>
                    ) : task.status === 'completed' ? (
                      <span className="completed-tag">DONE</span>
                    ) : (
                      <span className="pending-tag">PENDING</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <TaskFormModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSuccess={loadTasks}
      />
    </div>
  )
}
