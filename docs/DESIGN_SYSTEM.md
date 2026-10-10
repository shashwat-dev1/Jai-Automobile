# DSA OS — Design System

> Derived from the Graphite Ledger reference (`Designs/graphite_ledger/DESIGN.md`) and the three screen mockups.
> This is a **specification for implementation**, not a pixel-perfect copy of the reference.
> The UI must feel like a purpose-built financial operations platform — not a generic SaaS dashboard.

---

## 1. Design Philosophy

### Identity

DSA OS is an **operational control room** for vehicle-loan DSAs. The interface communicates:

- **Reliability** — this is where money and compliance are tracked
- **Clarity** — dense information rendered without clutter
- **Authority** — a tool that earns trust from auditors and business owners
- **Purpose** — every element serves a workflow, not decoration

### Anti-Patterns (Do NOT)

- Neon gradients, glassmorphism, diffuse glows
- Playful rounded geometry or bubbly tags
- Generic blue/purple AI-SaaS color schemes
- Heavy drop shadows or floating cards
- Excessive whitespace at the expense of information density
- Placeholder illustrations or stock imagery

---

## 2. Color System

### Core Palette

| Token | Value | Usage |
|---|---|---|
| `--color-primary` | `#173F35` | Navigation active states, primary buttons, section headers |
| `--color-primary-dark` | `#102C27` | Sidebar, persistent navigation, executive panels |
| `--color-primary-hover` | `#0E2420` | Primary button hover |
| `--color-accent` | `#B58A4A` | Financial amounts, payout highlights, brass accents, rule dividers |
| `--color-accent-light` | `#FECC85` | Accent badge backgrounds |
| `--color-canvas` | `#F4F1EA` | Page background — warm paper |
| `--color-surface` | `#FBFAF6` | Cards, tables, inputs — surface ivory |
| `--color-text-primary` | `#202622` | Primary text — carbon |
| `--color-text-secondary` | `#69736C` | Metadata, timestamps, labels — slate olive |
| `--color-text-inverse` | `#FBFAF6` | Text on dark backgrounds |
| `--color-border` | `#D9D5CA` | Borders, table rules, input outlines — warm stone |
| `--color-border-light` | `#E8E5DD` | Subtle separators |

### Status Colors

| Token | Text | Background | Border | Usage |
|---|---|---|---|---|
| `--status-success` | `#3F765B` | `rgba(63,118,91,0.10)` | `rgba(63,118,91,0.30)` | Disbursed, Verified, Completed, Matched |
| `--status-warning` | `#C58A3A` | `rgba(197,138,58,0.10)` | `rgba(197,138,58,0.30)` | Under Review, Held, Pending, Query |
| `--status-error` | `#A94A42` | `rgba(169,74,66,0.10)` | `rgba(169,74,66,0.30)` | Rejected, Short, Overdue, Stuck, Error |
| `--status-neutral` | `#858A84` | `rgba(133,138,132,0.10)` | `rgba(133,138,132,0.30)` | Lead, Logged In, Draft, Archived |
| `--status-info` | `#3D6B8E` | `rgba(61,107,142,0.10)` | `rgba(61,107,142,0.30)` | Applied, In Progress, Processing |

### Status-to-Color Mapping

| Case Status | Color Token |
|---|---|
| Lead | neutral |
| Screening | neutral |
| Collecting Docs | warning |
| Docs Complete | info |
| Applied | info |
| Sanctioned | success |
| Pre-disbursal | warning |
| Disbursed | success |
| Post-disbursal | info |
| Payout Pending | warning |
| Payout Received | success |
| Closed | neutral |
| Customer Dropped | error |
| All Rejected | error |
| Rework | error |
| Cancelled | error |

---

## 3. Typography

### Font Family

**IBM Plex Sans** — loaded via Google Fonts or self-hosted.

Fallback: `system-ui, -apple-system, 'Segoe UI', sans-serif`

### Type Scale

| Token | Size | Weight | Line Height | Letter Spacing | Usage |
|---|---|---|---|---|---|
| `--type-display-lg` | 2.25rem | 600 | 2.75rem | -0.02em | Page hero numbers (pipeline total) |
| `--type-display-lg-mobile` | 1.75rem | 600 | 2.25rem | -0.01em | Mobile hero numbers |
| `--type-headline-lg` | 1.5rem | 600 | 2rem | -0.01em | Page titles |
| `--type-headline-md` | 1.25rem | 600 | 1.75rem | -0.005em | Section headers |
| `--type-headline-sm` | 1.125rem | 600 | 1.5rem | 0 | Card titles |
| `--type-title-md` | 1rem | 500 | 1.375rem | 0 | Table headers, form labels |
| `--type-body-lg` | 0.9375rem | 400 | 1.375rem | 0 | Primary body text |
| `--type-body-md` | 0.875rem | 400 | 1.25rem | 0 | Table cells, form values |
| `--type-body-sm` | 0.8125rem | 400 | 1.125rem | 0 | Secondary text, metadata |
| `--type-label-md` | 0.75rem | 600 | 1rem | 0.04em | Labels, badges, tags |
| `--type-label-sm` | 0.6875rem | 600 | 0.875rem | 0.06em | Small labels, timestamps |

### Typography Rules

- All currency values (`₹`) use `font-variant-numeric: tabular-nums`
- Labels use `text-transform: uppercase` with generous letter-spacing
- No font size below `0.6875rem` (11px)
- Line heights maintain vertical rhythm on 4px grid

---

## 4. Spacing System

| Token | Value | Usage |
|---|---|---|
| `--space-xs` | 0.25rem (4px) | Inline padding, icon gaps |
| `--space-sm` | 0.5rem (8px) | Compact component padding |
| `--space-md` | 0.75rem (12px) | Default component padding |
| `--space-lg` | 1.25rem (20px) | Section spacing |
| `--space-xl` | 1.75rem (28px) | Major section gaps |
| `--gutter` | 1rem (16px) | Grid gutter (mobile) |
| `--gutter-desktop` | 1.5rem (24px) | Grid gutter (desktop) |
| `--margin` | 1rem (16px) | Page margin (mobile) |
| `--margin-desktop` | 2rem (32px) | Page margin (desktop) |

---

## 5. Border Radius

| Token | Value | Usage |
|---|---|---|
| `--radius-sm` | 0.125rem (2px) | Checkboxes, radio controls |
| `--radius` | 0.25rem (4px) | Default: buttons, cards, inputs, badges, chips |
| `--radius-md` | 0.375rem (6px) | Modals, dropdowns |
| `--radius-lg` | 0.5rem (8px) | Large panels, dialogs |
| `--radius-full` | 9999px | Avatars only |

**Rule:** No pill-shaped buttons. No heavy organic curves. Geometry is firm and squared.

---

## 6. Elevation and Depth

No floating drop shadows. Depth is communicated through:

1. **Tonal stepping**: canvas → surface → dark surface
2. **1px solid borders** in `--color-border`
3. **Contact shadows** for overlays only: `0px 2px 4px rgba(16,44,39,0.08), 0px 8px 16px rgba(16,44,39,0.06)`

| Level | Application | Method |
|---|---|---|
| 0 | Page canvas | `--color-canvas` background |
| 1 | Cards, tables | `--color-surface` + 1px border |
| 2 | Sidebar, headers | `--color-primary-dark` |
| 3 | Modals, drawers, dropdowns | Surface + border + contact shadow |

---

## 7. Components

### 7.1 Buttons

**Primary:**
- Background: `--color-primary`
- Text: `--color-text-inverse`
- Border radius: `--radius`
- Hover: `--color-primary-hover` with 1px inner border
- Height: 36px (compact), 40px (default)

**Secondary (Brass Accent):**
- Background: `--color-accent`
- Text: `--color-primary-dark`
- Reserved for: payout actions, disbursal triggers, financial confirmations
- Never used for generic actions

**Outline:**
- Background: `--color-surface`
- Border: 1px `--color-border`
- Text: `--color-text-primary`
- Hover: background shifts to `--color-canvas`

**Danger:**
- Background: `--status-error`
- Text: white
- Reserved for: destructive or irreversible actions

### 7.2 Data Tables

The primary UI component. High-density ledger tables:

- Row height: 36px (fixed for density)
- Header: `--color-canvas` background, `--type-label-sm`, uppercase, `--color-text-secondary`
- Header border: 1px solid bottom `--color-border`
- Cells: `--type-body-md`
- Row hover: `--color-canvas` tint
- Row border: 1px solid bottom `--color-border-light`
- Money columns: right-aligned, tabular numerals
- Status columns: colored chips (see Status Chips)
- Sticky headers on scroll
- Alternating row colors NOT used (border rules provide structure)

### 7.3 Status Chips

Squared-off badges with muted backgrounds:

- Border radius: `--radius` (4px)
- Padding: 2px 8px
- Font: `--type-label-md`, uppercase
- Text color: status text color
- Background: status background color
- Border: 1px solid status border color

### 7.4 Inputs

- Background: `--color-surface`
- Border: 1px `--color-border`
- Focus: 1.5px `--color-primary` outline, no glow ring
- Border radius: `--radius`
- Height: 36px (default), 40px (large)
- Prefix adornments (₹, +91): `--color-canvas` background with 1px vertical separator
- Error state: border changes to `--status-error`, helper text below in error color
- Disabled: `--color-canvas` background, 50% opacity

### 7.5 Cards (Ledger Summary / Dossier Sheets)

- Background: `--color-surface`
- Border: 1px `--color-border`
- Border radius: `--radius`
- **Top accent border**: 2px solid
  - `--color-accent` for financial KPIs (Total Disbursed, Commission, Pipeline Value)
  - `--color-primary` for case count metrics
  - `--status-error` for attention/alert cards
- Padding: `--space-md` to `--space-lg`
- No drop shadow

### 7.6 Navigation (Sidebar)

- Width: 240px (desktop), 64px icon rail (tablet), hidden with hamburger (mobile)
- Background: `--color-primary-dark`
- Text: `--color-text-inverse` at 70% opacity, 100% on active
- Active indicator: left 3px border in `--color-accent`
- Section labels: `--type-label-sm`, uppercase, `--color-text-inverse` at 40%
- Icons: 20px, stroke style, matching text opacity

### 7.7 Modals and Drawers

- Overlay: `rgba(16,44,39,0.40)`
- Container: `--color-surface`, 1px `--color-border`, contact shadow
- Header: `--type-headline-md`, bottom border
- Footer: top border, right-aligned action buttons
- Max width: 560px (modal), 480px (drawer)
- Close: X button + Escape key

### 7.8 Kanban Board (Pipeline View)

- Column header: `--type-title-md`, count badge, aggregate value
- Column background: transparent (canvas shows through)
- Cards: surface with border, case details at `--type-body-sm`
- Drag handle: subtle grip dots (hidden until hover)
- Column scroll: independent vertical scroll

---

## 8. Layout

### Grid System

- 12-column fluid grid
- Desktop (1280px+): 240px sidebar + fluid content, 1.5rem gutters, 2rem margins
- Tablet (768px–1279px): 64px icon rail + content, 1rem gutters
- Mobile (<768px): full-width, 1rem margins, single column

### Page Structure

```
+-----------------------------------------------------------+
| Top Bar: breadcrumb, search, target badge, notifications  |
+-----------------------------------------------------------+
|         |                                                  |
| Sidebar | Page Header (title, subtitle, date filter,      |
| (nav)   |              primary action button)              |
|         |--------------------------------------------------|
|         | Summary Strip (4-6 KPI cards in a row)           |
|         |--------------------------------------------------|
|         | Primary Content (table, board, or form)           |
|         |                                                  |
|         | Secondary Content (charts, lists)                 |
|         |                                                  |
+-----------------------------------------------------------+
```

### Content Density

- **Desktop**: maximize records per viewport; multi-column layouts
- **Tables**: prefer tables over cards on desktop; tables degrade to card lists on mobile
- **Forms**: 2-column on desktop, single column on mobile
- **Detail pages**: 3-column layout (customer | loan | source), stacks on mobile

---

## 9. Responsive Rules

### Breakpoints

| Name | Width | Layout Changes |
|---|---|---|
| Mobile | <768px | Single column, bottom nav, card lists, hamburger menu |
| Tablet | 768px–1279px | 64px icon rail, 8-column grid, condensed tables |
| Desktop | 1280px+ | Full sidebar, 12-column grid, dense tables |

### Mobile Adaptations

- Tables → card-based key-value lists (no horizontal scrolling)
- Multi-column detail → stacked sections
- Sidebar → bottom tab bar or hamburger drawer
- Date range filters → single dropdown selector
- Side-by-side lender comparison → swipeable tabs
- Case creation → wizard steps (one section per screen)

---

## 10. Pattern Library

### Dashboard Patterns

- **KPI Strip**: horizontal row of 4-6 metric cards with label, value, trend indicator
- **Pipeline Chart**: horizontal bar or funnel showing cases by stage
- **Commission Chart**: bar chart showing monthly expected vs settled
- **Source Table**: ranked table with conversion metrics
- **Attention Panel**: right sidebar with action items, color-coded by urgency

### Empty States

- Icon (muted, outline style) + heading + description + primary action button
- Examples:
  - "No cases yet" + "Create your first case"
  - "No payout rules" + "Add a payout rule to start tracking commissions"
  - "All caught up" (today view when nothing is due)
- Never show a blank white page

### Loading States

- Skeleton screens matching the layout (shimmer animation on `--color-canvas`)
- No spinner-only loading pages
- Table loading: skeleton rows matching column structure
- Dashboard loading: skeleton KPI cards + skeleton chart

### Error States

- Inline form errors: below the field, `--status-error` color, icon + message
- Page-level errors: centered card with error icon, message, and retry button
- Network errors: toast notification at top with retry action
- 404: "Record not found" with back navigation
- 403: "You don't have permission" with description of required role

### Confirmation Patterns

- Destructive actions: modal confirmation with typed confirmation for critical operations
- Status changes: inline confirmation with note field
- Financial overrides: modal with reason field (mandatory) and warning text

---

## 11. Financial Display Rules

### Currency Formatting

- Symbol: `₹` prefix, no space
- Digit grouping: Indian format (12,50,000 not 1,250,000)
- Decimals: 2 places for exact amounts; omit for display-only (₹6.5L, ₹14.30 Cr)
- Large amounts: abbreviated with L (Lakhs), Cr (Crores) in summary cards
- Alignment: right-aligned in tables, tabular numerals

### Percentage Display

- One decimal place: `82.4%`, `1.15%`
- Always include `%` suffix
- Trend indicators: `▲` (up, success), `▼` (down, error) with delta value

### Date/Time Display

- Dates: `24 Oct 2024` (dd MMM yyyy)
- Relative time: `12m ago`, `2h ago`, `3d ago` for recent activity
- Timestamps: `24 Oct 2024, 14:00 IST`
- Durations: `4.2 Days`, `3d Stuck`
- SLA: `On Schedule (Green)`, `2 days overdue (Red)`

---

## 12. Mobile Capture Experience

Optimized for field executives capturing leads on low-end Android:

### Case Creation (Mobile)

- Maximum 6 mandatory fields (IF-2): customer name, mobile, product, source, vehicle condition, requested amount
- Single-screen form on mobile (scrollable, not multi-step for 6 fields)
- Large touch targets (44px minimum)
- Auto-save draft to localStorage
- Offline-resilient: queue submission if network drops

### Document Capture (Mobile)

- Direct camera access via `<input type="file" accept="image/*" capture="environment">`
- Upload progress bar with retry on failure
- Thumbnail preview after capture
- Multiple file selection supported
- Compressed preview, original uploaded

### Mobile Navigation

- Bottom tab bar with 5 items: Dashboard, Cases, Pipeline, Notifications, Menu
- Swipe gestures for tab switching
- Pull-to-refresh on list views
- Floating action button for "New Case" on case list

---

## 13. Scope Discipline & Future Concepts

Design references in `Designs/` represent aspirational vision and may contain future-state concepts that are **strictly excluded from Release 1**.

### Scope Rule
> Design references may contain future concepts. Only requirements mapped to Release 1 in the PRD/SRS and Requirements Traceability Matrix may be implemented.

### In-Scope UI Equivalents for Release 1
When implementing screens inspired by the designs, implementers must translate future concepts into Release 1 equivalents:

| Design Concept | Release 1 Implementation Equivalent | Notes |
|---|---|---|
| `94% Fit` / `91% Fit` / Vehicle Eligibility | **REMOVED** — not shown in R1 UI | No automated eligibility, fit scoring, or probability scoring |
| `Sanction Probability: High` | `Application Status: Active` | Manual tracking only |
| `Lender API Gateways: 7/7 Connected` | `Applications: 7 Active` | No direct lender APIs in R1 |
| `WhatsApp Bot Ingestion` | `Source: WhatsApp / Manual Intake` | Lead source tag only; no automated bots |
| `CIBIL Synchronization` / Bureau Pull | `Credit Details: Manually Recorded` | Staff manually enter credit scores if obtained |
| Automated AI recommendations | Rule-based checklist / manual notes | No AI loan decisioning |

### Explicitly Excluded from Release 1 Designs

The following concepts **MUST NOT appear** in any Release 1 screen, mockup, or component — even as placeholder or future-state badges:

| Excluded Concept | Reason |
|---|---|
| **E-mandate / NACH** | Physical or lender-managed signing workflows; no electronic mandate in R1 |
| **Vehicle eligibility / Lender fit scoring** | No automated lender matching, eligibility percentage, or probability scoring |
| **RBI compliance claims / Aadhaar OTP verification** | Cannot claim regulatory compliance without legal validation; Aadhaar OTP requires UIDAI integration (out of scope) |
| **SMS notifications** | No SMS gateway in R1; in-app notifications only (email is optional P1 stretch) |
| **Automatic TDS 5%** | TDS rate is configurable per payout rule, not hardcoded; no automatic tax computation claims |
| **Lender Match Matrix** | No automated lender recommendation or scoring grid |

If any future-state concept is displayed in mockups or preview components, it must be explicitly badged: `FUTURE / PHASE 2`.

---

## 14. Synthetic Demo Data Standards

All designs, screenshots, seed datasets, and test fixtures must strictly adhere to synthetic data rules. Under no circumstances may real or realistic-looking Indian personal identifiers be used.

### Demo Data Patterns
- **PAN**: `DEMO0000X` (never valid alphanumeric checksum patterns)
- **Aadhaar**: `XXXX XXXX 0000` (masked with obviously synthetic trailing digits)
- **Mobile Number**: `+91 90000 00000` or `+91 90000 00001`
- **Bank Account / UTR**: `DEMOBANK00001` / `UTR000000000`
- **Vehicle Registration**: `RJ-00-XX-0000` or `DL-00-XX-0000`

### Visual Annotation
Mockups and UI walkthroughs must visibly display:
> `SYNTHETIC DEMO DATA — NOT REAL CUSTOMER DATA`

