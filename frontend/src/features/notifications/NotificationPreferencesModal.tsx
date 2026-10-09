import React, { useState, useEffect } from 'react'
import { notificationsApi } from './api'
import type { NotificationPreference } from './types'

interface NotificationPreferencesModalProps {
  isOpen: boolean
  onClose: () => void
}

const CONFIGURABLE_EVENTS = [
  { type: 'task.due_today', label: 'Tasks Due Today Alerts' },
  { type: 'task.overdue', label: 'Overdue Task Backlog Warnings' },
  { type: 'document.expiring', label: 'Document Expiration Alerts' },
  { type: 'case.stuck', label: 'Stuck Case SLA Bottleneck Warnings' },
  { type: 'pdd_item.due', label: 'PDD Collection Deadline Alerts' },
  { type: 'payout.held', label: 'Payout Gate Hold Notices' },
]

export const NotificationPreferencesModal: React.FC<NotificationPreferencesModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [inApp, setInApp] = useState(true)
  const [email, setEmail] = useState(true)
  const [quietStart, setQuietStart] = useState<string>('')
  const [quietEnd, setQuietEnd] = useState<string>('')
  const [disabledEvents, setDisabledEvents] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setLoading(true)
      setError(null)
      setSuccess(false)
      notificationsApi
        .getPreferences()
        .then((prefs: NotificationPreference) => {
          setInApp(prefs.in_app_enabled)
          setEmail(prefs.email_enabled)
          setQuietStart(prefs.quiet_hours_start || '')
          setQuietEnd(prefs.quiet_hours_end || '')
          setDisabledEvents(prefs.disabled_event_types || [])
        })
        .catch((err: unknown) => {
          setError(err instanceof Error ? err.message : 'Failed to load preferences')
        })
        .finally(() => setLoading(false))
    }
  }, [isOpen])

  if (!isOpen) return null

  const handleToggleEvent = (type: string) => {
    setDisabledEvents((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    )
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    setSuccess(false)
    try {
      await notificationsApi.updatePreferences({
        in_app_enabled: inApp,
        email_enabled: email,
        quiet_hours_start: quietStart.trim() || null,
        quiet_hours_end: quietEnd.trim() || null,
        disabled_event_types: disabledEvents,
      })
      setSuccess(true)
      setTimeout(() => {
        onClose()
      }, 800)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save preferences')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1100,
      }}
    >
      <div
        style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          width: '100%',
          maxWidth: 480,
          boxShadow: 'var(--shadow-modal)',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '90vh',
        }}
      >
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--color-border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <h3 className="type-h3" style={{ margin: 0, fontSize: '16px' }}>
            Notification Preferences
          </h3>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--color-text-secondary)',
              cursor: 'pointer',
              fontSize: '18px',
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
          {error && (
            <div
              style={{
                background: 'rgba(217, 83, 79, 0.15)',
                color: '#d9534f',
                padding: '8px 12px',
                fontSize: '12px',
                marginBottom: '14px',
              }}
            >
              {error}
            </div>
          )}

          {success && (
            <div
              style={{
                background: 'rgba(46, 125, 50, 0.15)',
                color: '#4caf50',
                padding: '8px 12px',
                fontSize: '12px',
                marginBottom: '14px',
              }}
            >
              Preferences saved successfully!
            </div>
          )}

          {loading ? (
            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
              Loading preferences...
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Delivery Channels */}
              <div>
                <h4
                  style={{
                    fontSize: '12px',
                    textTransform: 'uppercase',
                    color: 'var(--color-text-muted)',
                    letterSpacing: '0.05em',
                    margin: '0 0 10px',
                  }}
                >
                  Delivery Channels (FR-NTF-002)
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px' }}>
                    <input
                      type="checkbox"
                      checked={inApp}
                      onChange={(e) => setInApp(e.target.checked)}
                    />
                    <span>In-App Terminal Notifications</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px' }}>
                    <input
                      type="checkbox"
                      checked={email}
                      onChange={(e) => setEmail(e.target.checked)}
                    />
                    <span>Transactional Email Notifications</span>
                  </label>
                </div>
              </div>

              {/* Quiet Hours */}
              <div>
                <h4
                  style={{
                    fontSize: '12px',
                    textTransform: 'uppercase',
                    color: 'var(--color-text-muted)',
                    letterSpacing: '0.05em',
                    margin: '0 0 10px',
                  }}
                >
                  Quiet Hours (FR-NTF-003)
                </h4>
                <p style={{ margin: '0 0 8px', fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                  Non-urgent emails will be suppressed during these hours (24h format, e.g. 22:00 to 07:00).
                </p>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: 'var(--color-text-muted)' }}>
                      Start Time
                    </label>
                    <input
                      type="text"
                      placeholder="22:00"
                      value={quietStart}
                      onChange={(e) => setQuietStart(e.target.value)}
                      style={{
                        padding: '6px 8px',
                        background: 'var(--color-surface-raised)',
                        border: '1px solid var(--color-border)',
                        color: 'var(--color-text-primary)',
                        width: '80px',
                        fontSize: '13px',
                      }}
                    />
                  </div>
                  <span style={{ marginTop: '16px', color: 'var(--color-text-muted)' }}>to</span>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: 'var(--color-text-muted)' }}>
                      End Time
                    </label>
                    <input
                      type="text"
                      placeholder="07:00"
                      value={quietEnd}
                      onChange={(e) => setQuietEnd(e.target.value)}
                      style={{
                        padding: '6px 8px',
                        background: 'var(--color-surface-raised)',
                        border: '1px solid var(--color-border)',
                        color: 'var(--color-text-primary)',
                        width: '80px',
                        fontSize: '13px',
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Event Opt-Out */}
              <div>
                <h4
                  style={{
                    fontSize: '12px',
                    textTransform: 'uppercase',
                    color: 'var(--color-text-muted)',
                    letterSpacing: '0.05em',
                    margin: '0 0 10px',
                  }}
                >
                  Event Alerts Opt-In
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {CONFIGURABLE_EVENTS.map((evt) => {
                    const isEnabled = !disabledEvents.includes(evt.type)
                    return (
                      <label
                        key={evt.type}
                        style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px' }}
                      >
                        <input
                          type="checkbox"
                          checked={isEnabled}
                          onChange={() => handleToggleEvent(evt.type)}
                        />
                        <span>{evt.label}</span>
                      </label>
                    )
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        <div
          style={{
            padding: '14px 20px',
            borderTop: '1px solid var(--color-border)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '10px',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            style={{
              background: 'transparent',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text-secondary)',
              padding: '6px 14px',
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || loading}
            style={{
              background: 'var(--color-primary)',
              border: '1px solid var(--color-primary)',
              color: 'var(--color-text-inverse)',
              padding: '6px 18px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  )
}
