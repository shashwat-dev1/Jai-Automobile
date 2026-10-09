/**
 * DSA OS — Notifications Feature Types
 *
 * Types for notifications, preferences, and delivery audit.
 */

export type Urgency = 'low' | 'normal' | 'high' | 'urgent'

export interface NotificationItem {
  id: string
  org_id: string
  user_id: string
  event_type: string
  title: string
  message: string
  urgency: Urgency
  entity_type: string
  entity_id: string | null
  deep_link: string | null
  is_read: boolean
  read_at: string | null
  payload: Record<string, unknown>
  created_at: string
}

export interface NotificationListResponse {
  items: NotificationItem[]
  total: number
  unread_count: number
  page: number
  page_size: number
}

export interface NotificationCountResponse {
  unread_count: number
  total_count: number
}

export interface NotificationPreference {
  id: string
  user_id: string
  in_app_enabled: boolean
  email_enabled: boolean
  digest_enabled: boolean
  quiet_hours_start: string | null
  quiet_hours_end: string | null
  disabled_event_types: string[]
  updated_at: string
}

export interface NotificationPreferenceUpdate {
  in_app_enabled?: boolean
  email_enabled?: boolean
  digest_enabled?: boolean
  quiet_hours_start?: string | null
  quiet_hours_end?: string | null
  disabled_event_types?: string[]
}
