import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { NotificationItemComponent } from './NotificationItem'
import { NotificationPreferencesModal } from './NotificationPreferencesModal'
import { notificationsApi } from './api'
import type { NotificationItem } from './types'

interface NotificationPanelProps {
  isOpen: boolean
  onClose: () => void
  onUnreadCountChange?: (count: number) => void
}

export const NotificationPanel: React.FC<NotificationPanelProps> = ({
  isOpen,
  onClose,
  onUnreadCountChange,
}) => {
  const navigate = useNavigate()
  const [tab, setTab] = useState<'all' | 'unread'>('all')
  const [items, setItems] = useState<NotificationItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showPreferences, setShowPreferences] = useState(false)

  const loadNotifications = async () => {
    setLoading(true)
    setError(null)
    try {
      const isReadFilter = tab === 'unread' ? false : undefined
      const res = await notificationsApi.list(1, 30, isReadFilter)
      setItems(res.items)
      if (onUnreadCountChange) {
        onUnreadCountChange(res.unread_count)
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to fetch notifications')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isOpen) {
      loadNotifications()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, tab])

  if (!isOpen) return null

  const handleMarkRead = async (id: string) => {
    try {
      await notificationsApi.markAsRead(id)
      setItems((prev) =>
        prev.map((item) => (item.id === id ? { ...item, is_read: true } : item))
      )
      if (onUnreadCountChange) {
        const remainingUnread = items.filter((i) => !i.is_read && i.id !== id).length
        onUnreadCountChange(remainingUnread)
      }
    } catch {
      // Non-blocking
    }
  }

  const handleMarkAllRead = async () => {
    try {
      await notificationsApi.markAllAsRead()
      setItems((prev) => prev.map((item) => ({ ...item, is_read: true })))
      if (onUnreadCountChange) {
        onUnreadCountChange(0)
      }
    } catch {
      // Non-blocking
    }
  }

  const handleSelect = async (item: NotificationItem) => {
    if (!item.is_read) {
      await handleMarkRead(item.id)
    }
    onClose()
    if (item.deep_link) {
      navigate(item.deep_link)
    }
  }

  return (
    <>
      <div
        className="notification-panel-popover"
        style={{
          position: 'absolute',
          top: '46px',
          right: '16px',
          width: '380px',
          maxHeight: '520px',
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          boxShadow: 'var(--shadow-modal)',
          zIndex: 1050,
          display: 'flex',
          flexDirection: 'column',
          borderRadius: '2px',
        }}
      >
        {/* Panel Header */}
        <div
          style={{
            padding: '12px 14px',
            borderBottom: '1px solid var(--color-border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontWeight: 700, fontSize: '14px', color: 'var(--color-text-primary)' }}>
              Notifications
            </span>
            <button
              type="button"
              onClick={() => setShowPreferences(true)}
              title="Notification Settings"
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--color-text-secondary)',
                cursor: 'pointer',
                padding: '2px',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              type="button"
              onClick={handleMarkAllRead}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--color-primary)',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Mark all as read
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--color-text-secondary)',
                fontSize: '16px',
                cursor: 'pointer',
                lineHeight: 1,
              }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Filter Tabs */}
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid var(--color-border)',
            background: 'var(--color-surface-raised)',
          }}
        >
          <button
            type="button"
            onClick={() => setTab('all')}
            style={{
              flex: 1,
              padding: '8px',
              border: 'none',
              background: tab === 'all' ? 'var(--color-surface)' : 'transparent',
              color: tab === 'all' ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
              fontWeight: tab === 'all' ? 600 : 400,
              fontSize: '12px',
              cursor: 'pointer',
              borderBottom: tab === 'all' ? '2px solid var(--color-primary)' : 'none',
            }}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => setTab('unread')}
            style={{
              flex: 1,
              padding: '8px',
              border: 'none',
              background: tab === 'unread' ? 'var(--color-surface)' : 'transparent',
              color: tab === 'unread' ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
              fontWeight: tab === 'unread' ? 600 : 400,
              fontSize: '12px',
              cursor: 'pointer',
              borderBottom: tab === 'unread' ? '2px solid var(--color-primary)' : 'none',
            }}
          >
            Unread
          </button>
        </div>

        {/* List Content */}
        <div style={{ flex: 1, overflowY: 'auto', minHeight: '140px', maxHeight: '380px' }}>
          {loading && (
            <div style={{ padding: '24px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '13px' }}>
              Fetching alerts...
            </div>
          )}

          {error && (
            <div style={{ padding: '16px', color: '#d9534f', fontSize: '12px', textAlign: 'center' }}>
              {error}
            </div>
          )}

          {!loading && !error && items.length === 0 && (
            <div style={{ padding: '36px 20px', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
              <div style={{ fontSize: '24px', marginBottom: '8px' }}>🔔</div>
              <div style={{ fontSize: '13px', fontWeight: 600 }}>No notifications</div>
              <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                {tab === 'unread' ? 'You are all caught up!' : 'No alerts recorded yet.'}
              </div>
            </div>
          )}

          {!loading &&
            items.map((item) => (
              <NotificationItemComponent
                key={item.id}
                item={item}
                onMarkRead={handleMarkRead}
                onSelect={handleSelect}
              />
            ))}
        </div>
      </div>

      <NotificationPreferencesModal
        isOpen={showPreferences}
        onClose={() => setShowPreferences(false)}
      />
    </>
  )
}
