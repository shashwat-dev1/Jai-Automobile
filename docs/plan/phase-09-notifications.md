# Phase 09 — Notifications

## Objective

Implement the notification engine: event-driven generation, in-app delivery (P0), channel abstraction for future email/SMS/WhatsApp, deduplication, and user preferences.

## Dependencies

- PH-04 through PH-07: status change, document, payout, and SLA events to notify on

## Requirements Covered

| Req ID | Requirement |
|---|---|
| FR-NTF-001 | Notifications for: doc missing/expiring, follow-up due/overdue, stuck, status change, query, sanction, disbursal, PDD due/overdue, payout held, short/missing, clawback ending |
| FR-NTF-002 | In-app (P0) and email (P1) through channel abstraction |
| FR-NTF-003 | Preferences, daily digest, quiet hours; deduplication |
| FR-NTF-004 | Delivery log per notification |

## Database Changes

### New Tables
- `notifications` — per-user notifications with status, RLS
- `notification_preferences` — per-user channel/event preferences, RLS

### Migrations
- `038_create_notifications.py`
- `039_create_notification_preferences.py`
- `040_rls_notifications.py`

## Backend Modules

### `app/modules/notifications/`
- `router.py` — List, read, read-all, preferences
- `engine.py` — Event-to-notification mapping: which events generate which notifications for which users
- `dispatcher.py` — Channel abstraction: in-app (P0), email adapter stub (P1)
- `dedup.py` — Suppress duplicate notifications (same event+entity+user within window)
- `service.py` — Notification CRUD, unread count, mark read

### `app/workers/notification_tasks.py`
- Process notification queue
- Daily digest job (P1): aggregate undelivered notifications
- SLA/due-date scanner: generate notifications for overdue items

### Event-to-Notification Mapping

| Event | Notify | Urgency |
|---|---|---|
| case.status_changed | Case owner, watchers | Normal |
| document.missing | Case owner | High |
| document.expiring (3 days) | Case owner | High |
| task.due_today | Task owner | Normal |
| task.overdue | Task owner, case owner | High |
| case.stuck | Case owner, manager | High |
| lender_application.query_raised | Processor, case owner | High |
| lender_application.sanctioned | Case owner | Normal |
| lender_application.disbursed | Case owner, accountant | Normal |
| pdd_item.overdue | PDD owner, case owner | High |
| payout.held | Accountant | Normal |
| payout.short | Accountant, owner | High |
| payout.missing | Accountant, owner | High |
| clawback.window_ending (7 days) | Accountant, owner | High |

## API Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/notifications` | List notifications with unread count |
| PATCH | `/api/v1/notifications/{id}/read` | Mark as read |
| POST | `/api/v1/notifications/read-all` | Mark all as read |
| GET | `/api/v1/notifications/preferences` | Get user preferences |
| PUT | `/api/v1/notifications/preferences` | Update preferences |

## Frontend Routes/Components

- **Notification bell** in top bar: unread count badge, dropdown panel
- **Notification panel**: list of notifications with deep links to relevant entity
- **Preferences page**: toggle notifications by event type (P1)

### Components
- `NotificationBell` — icon + unread count badge
- `NotificationPanel` — dropdown list of recent notifications
- `NotificationItem` — single notification with icon, title, time, deep link
- `NotificationPreferences` — settings page (P1)

## Business Rules

- Notifications are user-scoped — users only see their own
- Deduplication: same event+entity+user suppressed within 1 hour
- Deep links: clicking notification navigates to relevant case/document/task
- Customer-facing notifications NOT sent without consent (FR-NTF-005, P2)

## Security Implications

- Notifications are tenant-scoped via RLS
- Notification content does not include sensitive data (no amounts, no PAN)
- Deep links validate permission before displaying target

## Tests

- Status change generates notification for case owner
- Overdue task generates notification
- Stuck case generates notification
- Duplicate notification suppressed within window
- Unread count correct
- Mark-read works
- Mark-all-read works
- Cross-tenant notification isolation

## Acceptance Criteria

1. In-app notifications generated for all specified events
2. Notification bell shows unread count
3. Notifications link to relevant entity
4. Duplicate notifications suppressed
5. Notifications respect tenant isolation

## Definition of Done

- [ ] Notification engine generates notifications for all specified events
- [ ] In-app delivery working
- [ ] Notification bell with unread count
- [ ] Deep links to relevant entities
- [ ] Deduplication operational
- [ ] Periodic jobs for overdue/stuck/expiring checks
- [ ] Tests passing

## Risks

- Notification volume could overwhelm users — deduplication and digest critical
- Real-time delivery (WebSocket) deferred; polling acceptable for pilot

## Files Expected to Change/Create

```
backend/app/modules/notifications/
  __init__.py, router.py, engine.py, dispatcher.py, dedup.py, service.py, models.py, schemas.py
backend/app/workers/notification_tasks.py
backend/migrations/versions/038..040
backend/tests/test_notifications.py

frontend/src/features/notifications/
  NotificationBell.tsx, NotificationPanel.tsx, NotificationItem.tsx
```
