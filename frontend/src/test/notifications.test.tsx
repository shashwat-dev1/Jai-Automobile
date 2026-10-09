import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { NotificationBell } from '../features/notifications/NotificationBell'
import { NotificationPanel } from '../features/notifications/NotificationPanel'
import { NotificationItemComponent } from '../features/notifications/NotificationItem'
import { NotificationPreferencesModal } from '../features/notifications/NotificationPreferencesModal'
import { notificationsApi } from '../features/notifications/api'
import type { NotificationItem } from '../features/notifications/types'

vi.mock('../features/notifications/api', () => ({
  notificationsApi: {
    getUnreadCount: vi.fn(),
    list: vi.fn(),
    markAsRead: vi.fn(),
    markAllAsRead: vi.fn(),
    getPreferences: vi.fn(),
    updatePreferences: vi.fn(),
  },
}))

describe('Notifications Feature Suite (Phase 09 - Gate PH-09)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('NotificationBell renders unread badge when count > 0', async () => {
    vi.mocked(notificationsApi.getUnreadCount).mockResolvedValue({
      unread_count: 5,
      total_count: 12,
    })

    render(
      <MemoryRouter>
        <NotificationBell />
      </MemoryRouter>
    )

    await waitFor(() => {
      const badge = screen.getByTestId('unread-badge')
      expect(badge).toBeInTheDocument()
      expect(badge).toHaveTextContent('5')
    })
  })

  it('NotificationBell toggles NotificationPanel on click', async () => {
    vi.mocked(notificationsApi.getUnreadCount).mockResolvedValue({
      unread_count: 2,
      total_count: 4,
    })
    vi.mocked(notificationsApi.list).mockResolvedValue({
      items: [
        {
          id: 'n-1',
          org_id: 'org-1',
          user_id: 'u-1',
          event_type: 'task.overdue',
          title: 'Overdue Follow-up',
          message: 'Collect PAN card',
          urgency: 'high',
          entity_type: 'task',
          entity_id: 't-1',
          deep_link: '/cases/1',
          is_read: false,
          read_at: null,
          payload: {},
          created_at: new Date().toISOString(),
        },
      ],
      total: 1,
      unread_count: 1,
      page: 1,
      page_size: 20,
    })

    render(
      <MemoryRouter>
        <NotificationBell />
      </MemoryRouter>
    )

    const bellBtn = screen.getByRole('button', { name: /notifications/i })
    fireEvent.click(bellBtn)

    await waitFor(() => {
      expect(screen.getByText('Notifications')).toBeInTheDocument()
      expect(screen.getByText('Overdue Follow-up')).toBeInTheDocument()
    })
  })

  it('NotificationItemComponent renders urgency badge and marks as read', () => {
    const item: NotificationItem = {
      id: 'n-urgent-1',
      org_id: 'org-1',
      user_id: 'u-1',
      event_type: 'case.stuck',
      title: 'Bottleneck Alert',
      message: 'Case exceeded 48h SLA in underwriting.',
      urgency: 'urgent',
      entity_type: 'case',
      entity_id: 'c-1',
      deep_link: '/cases/c-1',
      is_read: false,
      read_at: null,
      payload: {},
      created_at: new Date().toISOString(),
    }

    const onMarkRead = vi.fn()
    const onSelect = vi.fn()

    render(
      <NotificationItemComponent
        item={item}
        onMarkRead={onMarkRead}
        onSelect={onSelect}
      />
    )

    expect(screen.getByText('urgent')).toBeInTheDocument()
    expect(screen.getByText('Bottleneck Alert')).toBeInTheDocument()
    expect(screen.getByText(/exceeded 48h SLA/)).toBeInTheDocument()

    const markBtn = screen.getByRole('button', { name: /mark as read/i })
    fireEvent.click(markBtn)

    expect(onMarkRead).toHaveBeenCalledWith('n-urgent-1')
  })

  it('NotificationPanel allows switching tabs and marking all as read', async () => {
    vi.mocked(notificationsApi.list).mockResolvedValue({
      items: [
        {
          id: 'n-2',
          org_id: 'org-1',
          user_id: 'u-1',
          event_type: 'document.expiring',
          title: 'Expiring Document',
          message: 'Insurance expires soon',
          urgency: 'high',
          entity_type: 'document',
          entity_id: 'd-1',
          deep_link: '/cases/c-1',
          is_read: false,
          read_at: null,
          payload: {},
          created_at: new Date().toISOString(),
        },
      ],
      total: 1,
      unread_count: 1,
      page: 1,
      page_size: 20,
    })
    vi.mocked(notificationsApi.markAllAsRead).mockResolvedValue({ marked_read: 1 })

    render(
      <MemoryRouter>
        <NotificationPanel isOpen={true} onClose={vi.fn()} />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Expiring Document')).toBeInTheDocument()
    })

    const markAllBtn = screen.getByRole('button', { name: /mark all as read/i })
    fireEvent.click(markAllBtn)

    await waitFor(() => {
      expect(notificationsApi.markAllAsRead).toHaveBeenCalled()
    })
  })

  it('NotificationPreferencesModal loads and updates user preferences', async () => {
    vi.mocked(notificationsApi.getPreferences).mockResolvedValue({
      id: 'pref-1',
      user_id: 'u-1',
      in_app_enabled: true,
      email_enabled: true,
      digest_enabled: false,
      quiet_hours_start: '22:00',
      quiet_hours_end: '07:00',
      disabled_event_types: [],
      updated_at: new Date().toISOString(),
    })
    vi.mocked(notificationsApi.updatePreferences).mockResolvedValue({
      id: 'pref-1',
      user_id: 'u-1',
      in_app_enabled: true,
      email_enabled: false,
      digest_enabled: false,
      quiet_hours_start: '23:00',
      quiet_hours_end: '06:00',
      disabled_event_types: ['task.due_today'],
      updated_at: new Date().toISOString(),
    })

    const onClose = vi.fn()
    render(<NotificationPreferencesModal isOpen={true} onClose={onClose} />)

    await waitFor(() => {
      expect(screen.getByText('Notification Preferences')).toBeInTheDocument()
      expect(screen.getByDisplayValue('22:00')).toBeInTheDocument()
    })

    const saveBtn = screen.getByRole('button', { name: /save settings/i })
    fireEvent.click(saveBtn)

    await waitFor(() => {
      expect(notificationsApi.updatePreferences).toHaveBeenCalled()
    })
  })
})
