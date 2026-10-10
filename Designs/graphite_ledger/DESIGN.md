---
name: Graphite Ledger
colors:
  surface: '#f5fbf4'
  surface-dim: '#d6dcd5'
  surface-bright: '#f5fbf4'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff5ee'
  surface-container: '#eaefe9'
  surface-container-high: '#e4eae3'
  surface-container-highest: '#dee4de'
  on-surface: '#171d19'
  on-surface-variant: '#414845'
  inverse-surface: '#2c322e'
  inverse-on-surface: '#ecf2ec'
  outline: '#717975'
  outline-variant: '#c0c8c4'
  surface-tint: '#3f665a'
  primary: '#002920'
  on-primary: '#ffffff'
  primary-container: '#173f35'
  on-primary-container: '#82aa9d'
  inverse-primary: '#a6cfc1'
  secondary: '#7c571c'
  on-secondary: '#ffffff'
  secondary-container: '#fecc85'
  on-secondary-container: '#795519'
  tertiary: '#0b2722'
  on-tertiary: '#ffffff'
  tertiary-container: '#223d38'
  on-tertiary-container: '#8aa8a0'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#c1ecdd'
  primary-fixed-dim: '#a6cfc1'
  on-primary-fixed: '#002019'
  on-primary-fixed-variant: '#274e43'
  secondary-fixed: '#ffddb1'
  secondary-fixed-dim: '#efbe79'
  on-secondary-fixed: '#291800'
  on-secondary-fixed-variant: '#614004'
  tertiary-fixed: '#cae9e1'
  tertiary-fixed-dim: '#afcdc5'
  on-tertiary-fixed: '#03201b'
  on-tertiary-fixed-variant: '#314c46'
  background: '#f5fbf4'
  on-background: '#171d19'
  surface-variant: '#dee4de'
typography:
  display-lg:
    fontFamily: IBM Plex Sans
    fontSize: 2.25rem
    fontWeight: '600'
    lineHeight: 2.75rem
    letterSpacing: -0.02em
  display-lg-mobile:
    fontFamily: IBM Plex Sans
    fontSize: 1.75rem
    fontWeight: '600'
    lineHeight: 2.25rem
    letterSpacing: -0.01em
  headline-lg:
    fontFamily: IBM Plex Sans
    fontSize: 1.5rem
    fontWeight: '600'
    lineHeight: 2rem
    letterSpacing: -0.01em
  headline-md:
    fontFamily: IBM Plex Sans
    fontSize: 1.25rem
    fontWeight: '600'
    lineHeight: 1.75rem
    letterSpacing: -0.005em
  headline-sm:
    fontFamily: IBM Plex Sans
    fontSize: 1.125rem
    fontWeight: '600'
    lineHeight: 1.5rem
  title-md:
    fontFamily: IBM Plex Sans
    fontSize: 1rem
    fontWeight: '500'
    lineHeight: 1.375rem
  body-lg:
    fontFamily: IBM Plex Sans
    fontSize: 0.9375rem
    fontWeight: '400'
    lineHeight: 1.375rem
  body-md:
    fontFamily: IBM Plex Sans
    fontSize: 0.875rem
    fontWeight: '400'
    lineHeight: 1.25rem
  body-sm:
    fontFamily: IBM Plex Sans
    fontSize: 0.8125rem
    fontWeight: '400'
    lineHeight: 1.125rem
  label-md:
    fontFamily: IBM Plex Sans
    fontSize: 0.75rem
    fontWeight: '600'
    lineHeight: 1rem
    letterSpacing: 0.04em
  label-sm:
    fontFamily: IBM Plex Sans
    fontSize: 0.6875rem
    fontWeight: '600'
    lineHeight: 0.875rem
    letterSpacing: 0.06em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-desktop: 1.5rem
  margin: 1rem
  margin-desktop: 2rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.75rem
  space-lg: 1.25rem
  space-xl: 1.75rem
---

## Brand & Style

This design system serves as an authoritative operational control room tailored for Indian Direct Selling Agents (DSAs), loan distribution networks, and financial syndicates. The interface rejects consumer-facing SaaS aesthetics—dispensing entirely with neon gradients, playful rounded geometry, and glassmorphic blurs—in favor of a high-density, tactile ledger aesthetic reminiscent of archival registry ledgers, bound banking records, and classic trading desks.

The emotional signature is unyielding reliability, regulatory rigor, and operational clarity. It commands respect from financial auditors and operators managing multi-crore disbursement pipelines across housing, MSME, and personal loans. The structural rhythm pairs the permanence of deep forest and dark iron surfaces with the warmth of aged archival paper, yielding an experience that feels disciplined, structured, and impervious to distraction.

## Colors

The palette derives its core strength from historical administrative stationery and banking instruments:

- **Primary Forest Ink (`#173F35`)**: The core brand anchor, applied to dominant actions, navigation states, critical interactive touchpoints, and prominent section banners.
- **Dark Surface (`#102C27`)**: Used across persistent vertical sidebars, primary module headers, and executive summary panels to establish an anchor of absolute stability.
- **Secondary Oxide Brass (`#B58A4A`)**: A restrained, authoritative metallic accent reserved exclusively for ledger balances, payout splits, commission settlements, critical financial deltas, and subtle rule dividers.
- **Main Canvas Warm Paper (`#F4F1EA`)**: Replaces sterile white canvas with a natural, low-glare tone that preserves legibility under sustained audit conditions.
- **Surface Ivory (`#FBFAF6`)**: Applied to cards, sheets, data tables, and input containers to lift content off the canvas through subtle tonal contrast.
- **Text Carbon (`#202622`) & Slate Olive (`#69736C`)**: Primary data and labels are rendered in carbon, while metadata, timestamps, and secondary references utilize slate olive to prevent visual exhaustion.
- **Borders Warm Stone (`#D9D5CA`)**: Provides structured grid definition with low-contrast structural rules.
- **Operational Indicators**: Muted Success (`#3F765B`), Ledger Warning (`#C58A3A`), Rejection Error (`#A94A42`), and Slate Neutral (`#858A84`). These maintain muted saturation to integrate cleanly with the paper-and-ink foundation without flashing garish neon alerts.

## Typography

IBM Plex Sans provides the foundational mechanical discipline for this operational OS. Its grotesque construction and engineering pedigree offer clear readability across high-density tables and intricate multi-step loan workflows.

All currency denominations (`₹`), account IDs, loan sanction amounts, and payout splits must enforce OpenType tabular figures (`font-variant-numeric: tabular-nums;`) to guarantee absolute character alignment across vertical columns. Display headings maintain controlled line heights to maximize vertical efficiency. Metadata and ledger labels use small uppercase styling with generous tracking to deliver clarity at reduced scales.

## Layout & Spacing

The layout is built upon a dense, structured ledger framework designed to handle high data throughput across a 12-column grid system. Content density takes precedence over excessive negative space:

- **Desktop (1280px+)**: A persistent 240px wide sidebar rendered in Dark Surface (`#102C27`) anchors global navigation. The workspace utilizes a 12-column fluid grid with 1.5rem gutters and 2rem outer canvas margins. Multi-column financial tables and side-by-side verification panels dominate the primary viewport.
- **Tablet (768px - 1279px)**: The navigation collapses into a rigid 64px icon rail. The primary grid transitions to 8 columns with 1rem gutters, allowing case files and borrower dossiers to stack logically without horizontal truncation.
- **Mobile (< 768px)**: The workspace reflows into a single-column linear feed with 1rem outer margins and minimal internal component padding. Complex financial tables switch dynamically to card-based ledger key-value lists to prevent destructive horizontal scrolling.

Spacing increments step strictly through compact values (`0.25rem` to `1.75rem`) to maximize on-screen records per viewport while maintaining crisp vertical rhythms.

## Elevation & Depth

Visual hierarchy relies on structural tonal zoning and crisp rule borders rather than floating drop shadows or diffused glows:

- **Tonal Stepping**: The canvas sits on Warm Paper (`#F4F1EA`). Cards, workspace panels, and ledger grids are cut directly from Surface Ivory (`#FBFAF6`). High-importance summary bars, case status indicators, and global sidebars pull forward using Dark Surface (`#102C27`).
- **Low-Contrast Outlines**: Every component, cell container, and status card is bound by a solid 1px border rendered in Warm Stone (`#D9D5CA`). Structural column dividers within tables and dossiers use 1px vertical borders to replicate tabular ruling.
- **Subtle Layering**: When contextual flyouts, underwriting filters, or loan drawer sheets overlap active workspaces, elevation is conveyed through a crisp 1px hairline border (`#D9D5CA`) accompanied by a flat, architectural contact shadow: `0px 2px 4px rgba(16, 44, 39, 0.08), 0px 8px 16px rgba(16, 44, 39, 0.06)`. Heavy diffuse blurs are prohibited.

## Shapes

The shape vocabulary communicates precision, permanence, and regulatory discipline. Geometry is grounded in firm, near-square corners (`0.25rem` / `roundedness: 1`), evoking physical ledger tags, index cards, and registry sheets.

Curved pills, round bubbly tags, and heavy organic contours are forbidden. Subtle chamfered corner logic may be applied to pinned document attachments and status badges to echo physical file jackets. Inputs, buttons, data cells, and nested dialogs share this cohesive, crisp corner structure.

## Components

### Buttons
- **Primary**: Solid Forest Ink (`#173F35`) container, Surface Ivory (`#FBFAF6`) text, 0.25rem corner radius. Hover shifts to Dark Surface (`#102C27`) with a 1px inner border.
- **Secondary (Brass Accent)**: Oxide Brass (`#B58A4A`) fill with deep Forest Ink (`#102C27`) typography, reserved exclusively for payout settlement actions, disbursement triggers, and tranche approvals.
- **Outline / Operational**: Surface Ivory background, 1px Warm Stone (`#D9D5CA`) border, Text Carbon (`#202622`) label. Active state triggers a subtle Warm Paper tint (`#F4F1EA`).

### Data Ledger Tables (Core System Component)
- High-density rows with a fixed 36px height. Header cells feature Warm Paper backgrounds with uppercase Slate Olive (`#69736C`) `label-sm` typography and a 1px solid bottom rule in Warm Stone (`#D9D5CA`).
- Every monetary amount (`₹`) aligns strictly right, rendered with tabular numerals. Commission percentages and status codes feature dedicated monospaced alignment rules. Row hover triggers a subtle Warm Paper tint (`#F4F1EA`).

### Financial Status Chips & Badges
- Squared-off labels (0.25rem radius) with low-saturation backgrounds and solid borders:
  - *Disbursed / Approved*: `#3F765B` text on `rgba(63, 118, 91, 0.1)` surface, bordered in `rgba(63, 118, 91, 0.3)`.
  - *Underwriting Review*: `#C58A3A` text on `rgba(197, 138, 58, 0.1)` surface, bordered in `rgba(197, 138, 58, 0.3)`.
  - *Rejected / Defaulted*: `#A94A42` text on `rgba(169, 74, 66, 0.1)` surface, bordered in `rgba(169, 74, 66, 0.3)`.
  - *Logged*: `#858A84` text on `rgba(133, 138, 132, 0.1)` surface.

### Inputs & Verification Fields
- Crisp Surface Ivory boxes framed by a 1px Warm Stone (`#D9D5CA`) border. Focused states render a 1.5px Forest Ink (`#173F35`) outline with zero exterior glow rings. Prefix adornments (e.g., standard `₹` currency indicators or Indian phone `+91`) feature a distinct Warm Paper background separated by a 1px vertical hairline rule.

### Checkboxes & Radio Controls
- Firm 0.125rem rounded check squares and circular radios with a 1.5px Warm Stone border. Checked states feature solid Forest Ink (`#173F35`) fill with a crisp Ivory check mark.

### Ledger Summary Cards & Dossier Sheets
- Surface Ivory (`#FBFAF6`) container with a 1px Warm Stone (`#D9D5CA`) border. Cards feature a mandatory 2px accent top border rendered in Oxide Brass (`#B58A4A`) for financial KPI metric totals (e.g., Total Disbursed, Commission Accrued, Pipeline Volume) or Forest Ink (`#173F35`) for case count metrics.