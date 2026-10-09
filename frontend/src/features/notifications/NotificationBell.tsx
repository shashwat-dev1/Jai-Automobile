import React, { useState, useEffect, useRef } from 'react'
import { notificationsApi } from './api'
import { NotificationPanel } from './NotificationPanel'

export const NotificationBell: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState<number>(0)
  const containerRef = useRef<HTMLDivElement>(null)

  const fetchCount = async () => {
    try {
      const res = await notificationsApi.getUnreadCount()
      setUnreadCount(res.unread_count)
    } catch {
      // Non-blocking on network errors
    }
  }

  useEffect(() => {
    fetchCount()
    // Poll every 30s
    const timer = setInterval(fetchCount, 30000)
    return () => clearInterval(timer)
  }, [])

  // Close panel on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick)
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick)
    }
  }, [isOpen])

  return (
    <div ref={containerRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label="Notifications"
        aria-expanded={isOpen}
        title="Notifications"
        style={{
          background: 'transparent',
          border: '1px solid var(--color-border)',
          borderRadius: '2px',
          color: 'var(--color-text-primary)',
          padding: '6px 10px',
          cursor: 'pointer',
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '6px',
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>

        {unreadCount > 0 && (
          <span
            data-testid="unread-badge"
            style={{
              background: '#e53e3e',
              color: '#ffffff',
              fontSize: '10px',
              fontWeight: 700,
              padding: '1px 5px',
              borderRadius: '8px',
              minWidth: '16px',
              textAlign: 'center',
              lineHeight: '1.2',
            }}
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      <NotificationPanel
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        onUnreadCountChange={(newCount) => setUnreadCount(newCount)}
      />
    </div>
  )
}
