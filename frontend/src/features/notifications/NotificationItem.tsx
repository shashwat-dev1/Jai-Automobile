import React from 'react'
import type { NotificationItem as NotificationItemType } from './types'

interface NotificationItemProps {
  item: NotificationItemType
  onMarkRead: (id: string) => void
  onSelect: (item: NotificationItemType) => void
}

function formatRelativeTime(dateStr: string): string {
  try {
    const diffMs = Date.now() - new Date(dateStr).getTime()
    const diffMins = Math.floor(diffMs / 60000)
    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    const diffHours = Math.floor(diffMins / 60)
    if (diffHours < 24) return `${diffHours}h ago`
    const diffDays = Math.floor(diffHours / 24)
    if (diffDays === 1) return 'Yesterday'
    return `${diffDays}d ago`
  } catch {
    return dateStr
  }
}

export const NotificationItemComponent: React.FC<NotificationItemProps> = ({
  item,
  onMarkRead,
  onSelect,
}) => {
  const isUrgent = item.urgency === 'urgent'
  const isHigh = item.urgency === 'high'

  const badgeColor = isUrgent
    ? '#e53e3e'
    : isHigh
      ? '#dd6b20'
      : 'var(--color-text-secondary)'

  const badgeBg = isUrgent
    ? 'rgba(229, 62, 62, 0.12)'
    : isHigh
      ? 'rgba(221, 107, 32, 0.12)'
      : 'var(--color-surface-raised)'

  return (
    <div
      onClick={() => onSelect(item)}
      style={{
        padding: '10px 14px',
        borderBottom: '1px solid var(--color-border)',
        background: item.is_read ? 'transparent' : 'rgba(255, 255, 255, 0.03)',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        position: 'relative',
        transition: 'background 0.15s ease',
      }}
      className="notification-item-row"
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {!item.is_read && (
            <span
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: 'var(--color-primary)',
                display: 'inline-block',
              }}
              aria-label="Unread"
            />
          )}
          <span
            style={{
              fontSize: '11px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: badgeColor,
              background: badgeBg,
              padding: '1px 6px',
              borderRadius: '2px',
            }}
          >
            {item.urgency}
          </span>
          <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
            {item.title}
          </span>
        </div>
        <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
          {formatRelativeTime(item.created_at)}
        </span>
      </div>

      <p
        style={{
          margin: 0,
          fontSize: '12px',
          color: 'var(--color-text-secondary)',
          lineHeight: '1.4',
        }}
      >
        {item.message}
      </p>

      {!item.is_read && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '2px' }}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onMarkRead(item.id)
            }}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--color-text-muted)',
              fontSize: '11px',
              cursor: 'pointer',
              padding: '2px 4px',
              textDecoration: 'underline',
            }}
          >
            Mark as read
          </button>
        </div>
      )}
    </div>
  )
}
