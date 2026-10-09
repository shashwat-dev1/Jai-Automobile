import React, { useState, useEffect, useCallback } from 'react'
import { api, ApiError } from '../../shared/lib/api'
import Button from '../../shared/components/Button'
import { TaskFormModal } from './TaskFormModal'
import type { Task } from './types'
import './TaskListSection.css'

interface TaskListSectionProps {
  caseId: string
}

export const TaskListSection: React.FC<TaskListSectionProps> = ({ caseId }) => {
  const [tasks, setTasks] = useState<Task[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null)

  const loadTasks = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const data = await api.get<Task[]>(`/workflow/tasks?case_id=${caseId}`)
      setTasks(data)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load tasks')
    } finally {
      setIsLoading(false)
    }
  }, [caseId])

  useEffect(() => {
    loadTasks()
  }, [loadTasks])

  const handleToggleComplete = async (task: Task) => {
    const newStatus = task.status === 'completed' ? 'pending' : 'completed'
    let outcomeNotes: string | undefined = undefined

    if (newStatus === 'completed') {
      const notes = window.prompt('Outcome / Resolution Notes (Optional):')
      if (notes === null) return // cancelled
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
    <div className="task-section">
      <div className="task-section-header">
        <div>
          <h2 className="dossier-card-title">Follow-up Tasks & Reminders</h2>
          <p className="type-body-xs" style={{ color: 'var(--color-text-secondary)', marginTop: 2 }}>
            Field visits, telephonic queries, and SLA milestone tasks.
          </p>
        </div>
        <Button variant="secondary" onClick={() => setShowAddModal(true)}>
          + Add Task
        </Button>
      </div>

      {error && <div className="alert-error" style={{ margin: '12px 0' }}>{error}</div>}

      {isLoading ? (
        <div style={{ padding: '16px 0', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
          Loading tasks...
        </div>
      ) : tasks.length === 0 ? (
        <div className="empty-tasks-state">
          <span>✓ All follow-up tasks completed or none scheduled.</span>
        </div>
      ) : (
        <div className="task-items-list">
          {tasks.map((task) => (
            <div
              key={task.id}
              className={`task-item ${task.status === 'completed' ? 'is-completed' : ''} ${
                task.is_overdue ? 'is-overdue' : ''
              }`}
            >
              <div className="task-check-col">
                <input
                  type="checkbox"
                  checked={task.status === 'completed'}
                  disabled={actionLoadingId === task.id}
                  onChange={() => handleToggleComplete(task)}
                />
              </div>

              <div className="task-content-col">
                <div className="task-title-row">
                  <span className="task-title">{task.title}</span>
                  <span className="task-type-badge">{task.type.replace(/_/g, ' ')}</span>
                  {task.is_overdue && <span className="task-overdue-badge">⚠ OVERDUE</span>}
                </div>

                {task.description && <div className="task-desc">{task.description}</div>}
                {task.notes && <div className="task-outcome">Outcome: {task.notes}</div>}

                <div className="task-meta-row">
                  <span>Due: {formatDue(task.due_date)}</span>
                  {task.owner_name && <span>• Assignee: {task.owner_name}</span>}
                  {task.completed_at && <span>• Completed: {formatDue(task.completed_at)}</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <TaskFormModal
        caseId={caseId}
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSuccess={loadTasks}
      />
    </div>
  )
}
