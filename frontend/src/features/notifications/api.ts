/**
 * DSA OS — Notifications API Client
 */

import { api } from '../../shared/lib/api'
import type {
  NotificationCountResponse,
  NotificationItem,
  NotificationListResponse,
  NotificationPreference,
  NotificationPreferenceUpdate,
} from './types'

export const notificationsApi = {
  list: async (page = 1, pageSize = 20, isRead?: boolean): Promise<NotificationListResponse> => {
    let query = `?page=${page}&page_size=${pageSize}`
    if (isRead !== undefined) {
      query += `&is_read=${isRead}`
    }
    return api.get<NotificationListResponse>(`/notifications${query}`)
  },

  getUnreadCount: async (): Promise<NotificationCountResponse> => {
    return api.get<NotificationCountResponse>('/notifications/unread-count')
  },

  markAsRead: async (id: string): Promise<NotificationItem> => {
    return api.patch<NotificationItem>(`/notifications/${id}/read`)
  },

  markAllAsRead: async (): Promise<{ marked_read: number }> => {
    return api.post<{ marked_read: number }>('/notifications/read-all')
  },

  getPreferences: async (): Promise<NotificationPreference> => {
    return api.get<NotificationPreference>('/notifications/preferences')
  },

  updatePreferences: async (data: NotificationPreferenceUpdate): Promise<NotificationPreference> => {
    return api.put<NotificationPreference>('/notifications/preferences', data)
  },
}
