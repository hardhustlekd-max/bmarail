# Bahirdar Motorist Association — Design System & UI Guidelines

This document is the canonical reference for visual tokens, typography, surface architecture, component primitives, layout shells, and interaction governance across the **Bahirdar Motorist Association (`ባህር ዳር ሞተረኞች ማህበር`)** web application.

All rules below reflect the live implementation in `src/index.css`, `src/components/ui/AssocDesignSystem.tsx`, `src/components/ui/StreamlinedUI.tsx`, and the application's primary workspace views.

---

## 1. Brand & Aesthetic Philosophy

- **Design Archetype**: Executive Monochrome Slate paired with TailAdmin high-density administrative surfaces.
- **Core Principles**:
  1. **Zero Visual Noise**: Flat, un-embossed KPI metrics and hairline `1px` borders replace heavy drop shadows and 3D hover lift.
  2. **High-Density Legibility**: Structured master-detail tables, sticky table headers, contiguous workspace cards, and tabular monospace IDs keep dense municipal/association records scannable.
  3. **Bilingual Parity**: Seamless Amharic (Ethiopic script via `Abyssinica SIL`) and English (`Inter`) rendering without font-fallback collisions.
  4. **Explicit Theme Switching**: Dark mode is strictly class-driven (`html.dark` via Tailwind `@variant dark (&:where(.dark, .dark *))`), never auto-toggled by OS preference.
  5. **Persistent Dark Navigation Chrome**: Desktop sidebar and mobile topbar maintain dark slate authority chrome regardless of active canvas theme.

---

## 2. Design Token Architecture

Canonical tokens live in two synchronized places:
- **CSS Custom Properties & Tailwind `@theme`**: `src/index.css`
- **Typed JS Token Map**: `DESIGN_TOKENS` exported from `src/components/ui/AssocDesignSystem.tsx`

### 2.1 Brand & Action Tokens

| Token | Light Mode (`html.light`) | Dark Mode (`html.dark`) | Tailwind / CSS Usage |
| :--- | :--- | :--- | :--- |
| Primary Ink / Action | `#0F172A` | `#F8FAFC` | `--color-primary`, `bg-primary`, `text-primary` |
| Primary Hover | `#1E293B` | `#FFFFFF` | `--color-primary-hover`, `hover:bg-primary-hover` |
| On-Primary Contrast | `#FFFFFF` | `#0F172A` | `--color-on-primary`, `text-on-primary` |
| Accent Alias | `#0F172A` | `#F8FAFC` | `--assoc-accent`, `accent-color` |
| On-Accent Alias | `#FFFFFF` | `#0F172A` | `--assoc-on-accent` |

> **Dark-Mode Contrast Rule**: Because `--color-primary` flips from `#0F172A` (light) to `#F8FAFC` (dark), solid primary surfaces (`bg-primary`) **must** pair with `text-on-primary` instead of `text-white`. A CSS safeguard (`.dark .bg-primary.text-white`) also protects legacy buttons.

### 2.2 Surface, Border & Text Hierarchy

| Role | Light Hex | Dark Hex | CSS Token |
| :--- | :--- | :--- | :--- |
| App Canvas | `#F1F5F9` | `#1A222C` | `--assoc-bg-primary` / `--color-surface` |
| Deepest Recessed | `#E2E8F0` | `#0F172A` | `--color-surface-dim` |
| Primary Card / Modal | `#FFFFFF` | `#1C2434` | `--assoc-card-bg` / `--color-boxdark` |
| Subtle / Toolbar / Table Head / Input | `#F7F9FC` | `#24303F` | `--assoc-surface-subtle` / `--color-surface-container` |
| Elevated Tab Strip / Row Alt | `#F8FAFC` | `#1E293B` | `--color-surface-container-low` |
| Hover / Active Chip Fill | `#E2E8F0` | `#333A48` | `--color-surface-container-highest` |
| Hairline Border / Grid | `#E2E8F0` | `#2E3A47` | `--assoc-border` / `--color-outline-variant` |
| Text Primary | `#1C2434` (`#0F172A` headings) | `#DEE4EE` (`#FFFFFF` headings) | `--assoc-text-main` / `--color-text-primary` |
| Text Secondary | `#475569` | `#CBD5E1` | `--assoc-text-subtle` / `--color-text-secondary` |
| Text Muted / Labels / Placeholders | `#64748B` | `#8A99AD` | `--assoc-text-muted` / `--color-text-muted` |
| Modal Backdrop | `rgba(15, 23, 42, 0.6)` | `rgba(2, 6, 23, 0.85)` | `--assoc-backdrop` |

### 2.3 Persistent Dark Navigation Chrome (Both Light & Dark Modes)

- **Desktop Sidebar (`aside`)**: `#0F172A` (`bg-slate-900`), border `#1E293B` (`border-slate-800`), muted text `#CBD5E1`, active item `bg-slate-800 text-white border-l-2 border-primary`.
- **Mobile & Login Topbar (`header`)**: `#1E293B` (`bg-[#1e293b]`), active tablet navigation tab `#EAB308` (`bg-yellow-500 text-[#1e293b]`).
- **Sign-Out / Destructive Nav Control**: `#132A5E` background, hover `#1A387C`, border `#2A4E9B`.

### 2.4 Semantic Status Palette

| Status | Swatch / Light Surface | Dark Surface | Border / Text |
| :--- | :--- | :--- | :--- |
| Success / Paid / Approved | `#10B981` / `bg-emerald-50` | `bg-emerald-950/60` | `text-emerald-700 dark:text-emerald-300`, `border-emerald-200/80 dark:border-emerald-800/60` |
| Warning / Due Soon / Pending Review | `#F59E0B` / `bg-amber-500/10` | `bg-amber-500/10` | `text-amber-700 dark:text-amber-400`, `border-amber-500/20` |
| Danger / Overdue / Unpaid / Error | `#EF4444` (Coral `#FB5454` dark) / `bg-rose-50` | `bg-rose-950/60` | `text-rose-700 dark:text-rose-300`, `border-rose-200/80 dark:border-rose-800/60` |
| Neutral / Pending / Info | `#475569` / `bg-slate-100` | `bg-slate-800` | `text-slate-700 dark:text-slate-300`, `border-slate-200 dark:border-slate-700` |

### 2.5 QR Scanner Result Themes (`src/utils/scannerThemes.ts`)

Field inspection views support configurable result themes via `SCANNER_THEMES` with `warm_ivory_cream` (`#EEF2F6` canvas, `#FCF8EB` owner card, `#FFFFFF` spec chips, `#15803D` approved header) as `DEFAULT_SCANNER_THEME`. Additional themes (`deep_cobalt_navy`, `soft_ice_blue`, `classic_blue`, `emerald_law`, `tactical_dark`, `imperial_gold`, `modern_clean`) preserve uniform semantic verification headers (`headerApproved`, `headerPending`, `headerRejected`) and structured owner/vehicle cards.

---

## 3. Typography System

### 3.1 Font Stack & Ethiopic Isolation

```css
font-family: 'Abyssinica SIL', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
```

- **`Abyssinica SIL`** (`/AbyssinicaSIL-Regular.woff2`) is strictly bound via `unicode-range: U+1200-137F, U+1380-139F, U+2D80-2DDF, U+AB00-AB2F, U+1E7E0-1E7FE` across weights `100 900`.
- Latin text, numbers, punctuation, and currency never trigger `Abyssinica SIL` and render cleanly in **`Inter`**.
- **Monospace Tabular Rule**: `font-mono tabular-nums` (or `.app-mono-id`) is mandatory for plate numbers, receipt numbers, serial/badge IDs, table row indices, counts, Ethiopian/Gregorian dates, timestamps, and ETB currency amounts.

### 3.2 Standardized Utility Scale (`src/index.css`)

| Class | Size / Weight | Line Height / Tracking | Usage |
| :--- | :--- | :--- | :--- |
| `.app-display-title` | `clamp(1.5rem, 3vw, 2.25rem)` / `900` | `1.15` / `-0.025em` | Hero / Display headers |
| `.app-page-title` | `clamp(1.125rem, 2vw, 1.5rem)` / `900` | `1.25` / `-0.015em` | Primary page `H1` |
| `.app-section-title` | `clamp(0.9375rem, 1.5vw, 1.125rem)` / `800` | `1.3` / `-0.01em` | Section `H2` headings |
| `.app-card-title` | `0.875rem` (`14px`) / `700` | `1.35` | Card `H3` headers |
| `.app-subtitle` | `0.75rem` (`12px`) / `500` | `1.4` | Supporting descriptions |
| `.app-field-label` | `0.75rem` (`12px`) / `700` | `1.25` / `0.01em` | Form input labels |
| `.app-helper-text` | `0.6875rem` (`11px`) / `500` | `1.4` | Input guidance & hints |
| `.app-caption` | `0.6875rem` (`11px`) / `600` | `1.3` | Micro metadata |
| `.app-table-head` | `0.6875rem` (`11px`) / `800` | `1.2` / `0.05em` | Sticky `<th>` headers |
| `.app-badge` | `0.6875rem` (`11px`) / `800` | `1` | Compact inline status badges |
| `.app-mono-id` | `ui-monospace` / `800` | `0.025em` | Plates, receipts, badge IDs |

### 3.3 Mobile Form Typography Rule (`< 768px`)

On mobile viewports (`max-width: 767px`), text inputs, searches, `<select>`, and `<textarea>` scale cleanly to `0.8125rem` (`13px`) with `min-height: 34px` (`32px` for search inputs, `26px` for inline pagination/popover selects), and checkboxes/radios lock to `15px × 15px` with `12px` labels to preserve compact density without bloated touch targets.

### 3.4 Global UI Scale, Control Heights & Icon Size Tokens

- **Master Scale Variable (`--ui-scale`) & Adaptive Breakpoints**:
  - `data-ui-scale="auto"` (default):
    - Narrow Mobile (`<= 389px`): `15px` root / `--ui-scale: 0.96`
    - Mobile & Tablet (`390px – 1023px`): `16px` root / `--ui-scale: 1` (mobile touch controls keep `min-h-[44px]`)
    - Compact Laptop / Short Height (`1024px – 1366px` or `max-height: 780px` on desktop): `15px` root / `--ui-scale: 0.94` for sharper table density
    - Standard Desktop (`1367px – 1799px`): `16px` root / `--ui-scale: 1`
    - Large / Ultrawide (`>= 1800px`): `16.5px` root / `--ui-scale: 1.04`
  - **User Presets (`SettingsPage` -> Display Scale)**: `compact` (`14.5px` / `0.9`), `standard` (`16px` / `1`), `large` (`17px` / `1.08`), persisted via `bd_motor_ui_scale`.
  - **Print Isolation**: `@media print` locks `html` to `16px` and `--ui-scale: 1` so physical A4/PVC/sticker dimensions never drift.
- **Responsive Control Heights**:
  - `--ui-control-h-xs`: `calc(1.875rem * var(--ui-scale))` (`30px` at `1.0`)
  - `--ui-control-h-sm`: `calc(2.125rem * var(--ui-scale))` (`34px` at `1.0`)
  - `--ui-control-h-md`: `calc(2.5rem * var(--ui-scale))` (`40px` at `1.0`)
  - `--ui-control-h-lg`: `calc(2.875rem * var(--ui-scale))` (`46px` at `1.0`)
- **Scaled Text & Icon Classes (`@theme`)**: `text-2xs` (`10px`), `text-11` (`11px`), `text-13` (`13px`), `text-15` (`15px`), and `text-icon-xs` (`14px`), `text-icon-sm` (`16px`), `text-icon-md` (`18px`), `text-icon-lg` (`20px`), `text-icon-xl` (`24px`), `text-icon-2xl` (`30px`), `text-icon-3xl` (`36px`).

---

## 4. Elevation, Borders & Radius Discipline

### 4.1 Flat Elevation Hierarchy

- **KPI & Metric Cards (`.shadow-kpi`)**: Zero `box-shadow`, zero `translateY` hover lift, zero 3D active glow. Hover shifts surface background (`#F7F9FC` -> `#F1F5F9` in light; `#1C2434` -> `#24303F` in dark) or hairline border (`#64748B` / `#8A99AD`).
- **Primary & Secondary Buttons**: Flat (`border-0 shadow-none` on primary; `1px` `#E2E8F0` / `#2E3A47` hairline border with `shadow-none` on secondary).
- **Workspace Shells & Cards**: `border border-[#E2E8F0] dark:border-[#2E3A47]` with subtle `shadow-xs` only.
- **Popovers, Date Pickers & Modals**: `shadow-2xl` over `backdrop-blur-xs` / `backdrop-blur-md` (`bg-slate-950/65` or `bg-black/80`).

### 4.2 Border Radius Scale & Anti-Pill Discipline

- `rounded-sm` (`2px–4px`): Pagination buttons/page indicator, compact active pill-tab segment, inline plate chips.
- `rounded-md` (`6px`): Status badges (`StatusBadge`, `Badge`), compact small buttons (`size="sm"`), flush tab top corners (`rounded-t-md`).
- `rounded-lg` (`8px`): Standard buttons (`size="md"`/`lg`), form inputs, selects, search bars, `UnifiedWorkspaceCard`, `KpiCard`, `MetricStatCard`, `DataField`, `HistoryItem`.
- `rounded-xl` (`12px`): `SectionCard`, `TableContainer`, `FocusDetailPane`, `BaseModal`, `ModalFormDialog`, `EmptyStateView`.
- `rounded-full`: **Strictly reserved** for `StatusDot`, notification/tab count chips, user avatars, and circular close/zoom icon triggers—never for multi-word text badges or action buttons.

---

## 5. Layout Architecture & Component Primitives

### 5.1 Application Shell

1. **Desktop Sidebar**: Collapsible width (`w-52` expanded / `w-16` icon rail), persistent `#0F172A` background, top brand crest, scrollable role-filtered links, bottom theme/language/sign-out footer.
2. **Header Bar**: `h-14` (`56px`) with view title/breadcrumb, quick actions, language switcher (`አማርኛ` / `English`), theme toggle, and `MultiDeviceSyncIndicator`.
3. **Grounded Footer (`.app-grounded-footer`)**: Non-overlapping flex child (`flex-shrink: 0`) at bottom of main column.
4. **Loading States**: Centered `CentralPageSpinner` (never raw blocking splash text) and `Skeleton` rows for async queries.

### 5.2 `UnifiedWorkspaceCard` & Master-Detail Table Pattern

All primary administrative registries (`TablesPage`, `PaymentReceiptsPage`, `TodaySubmissionsPage`, `UnregisteredReportsList`, `MonthlyMatrixLedger`) follow a single contiguous shell:

1. **Header Slot** (`border-b`): Page/section title + primary actions.
2. **Flush Tabs (`TabList` variant=`flush` or `underline`)**: Placed directly inside `#F8FAFC` / `#1E293B/70` strip; active tab connects seamlessly (`top-[1px] border-b-0 bg-white dark:bg-[#1C2434] rounded-t-md`).
3. **2-Tier Toolbar**: `#F7F9FC` / `#24303F` filter strip containing `SearchInput` + compact `SelectField` / `EthiopianDateRangePicker` filters.
4. **Scrollable Data Viewport**: `min-h-[420px] max-h-[calc(100vh-270px)] [scrollbar-gutter:stable]` with sticky `thead` (`bg-[#F7F9FC] dark:bg-[#24303F]`) and `divide-y` rows.
   - **Desktop (`>= 768px`)**: Full columns + row click opens `FocusDetailPane` or detail modal.
   - **Mobile (`< 768px`)**: Rigid `<colgroup>` + accordion expansion drawer showing period grids (`grid-cols-3 min-[440px]:grid-cols-4`) and 2-column action toolbar.
5. **Sticky `PaginationFooter`**: Bottom-anchored inside card (`sticky bottom-0 z-10`), rows-per-page `<select>`, bilingual range counter, `Previous` / `[page / total]` (`bg-primary text-on-primary`) / `Next`.

### 5.3 Primitive Exports Reference

- **`AssocDesignSystem.tsx`**:
  - `DESIGN_TOKENS`
  - **Atoms**: `Button`, `ButtonPrimary`, `ButtonSecondary`, `ButtonDanger`, `StatusBadge`, `StatusDot`
  - **Form Molecules**: `FormInput`, `SearchInput`, `SelectField` (requires `id`), `RadioGroup`, `CheckboxField`, `TabList`
  - **Surface Molecules**: `KpiCard`, `KpiGrid`, `MetricStatCard`, `MetricGrid`, `TableContainer`, `UnifiedWorkspaceCard`, `PaginationFooter`
  - **Organisms**: `MonthlyMatrixLedger`, `HistoryItem`, `FocusDetailPane`, `ModalFormDialog`, `ResponsiveMasterDetailTable`, `WorkspaceSideDrawer`, `WorkspaceDrawerSection`
- **`StreamlinedUI.tsx`** (re-exports all of `AssocDesignSystem` plus streamlined form/modal primitives):
  - `PageTitle`, `SectionToggle`, `SectionContent`, `SectionCard`, `DataField`, `FieldLabel`, `HelperText`, `ActionTriggerPrimary`, `ActionTriggerSecondary`, `SelectField` (lightweight optional-`id` select for dense toolbars/forms), `Badge`, `EmptyStateView`.
- **Modals & Specialized Pickers**:
  - `BaseModal` (`src/components/ui/BaseModal.tsx`): Top-aligned (`pt-6 sm:pt-10 md:pt-14`) spring-animated modal shell (`max-w-3xl max-h-[92vh]`).
  - `EthiopianDatePickerPopover` / `EthiopianDateRangePicker`: Custom 13-month Ethiopian calendar (`Pagume` aware) anchored popover.
  - `ToastContext`: Right-aligned slide-in notification stack (`.animate-toast-in` / `.animate-toast-out`) with 4.5s countdown bar.

---

## 6. Iconography, Print & Governance Rules

### 6.1 Iconography Rules
- **Exclusively Material Symbols** via `<Icon name="..." size={...} />` (`src/components/ui/Icon.tsx`).
- **Zero Emojis**: Emojis are strictly prohibited in UI copy, badges, notifications, documentation, and status indicators.

### 6.2 Print Isolation (`@media print`)
- `.no-print`, buttons, navbars, sidebars, headers, footers, and `[data-no-print="true"]` are hidden automatically during print.
- Printable artifacts (`.printable-a4-document` / `#a4-permit-document` at `210mm × 297mm`, `.printable-id-card` / `#pvc-card-container` at `580px × 366px`, `.printable-sticker` / `#sticker-container` at `380px × 380px`) force clean `#FFFFFF` / `#E4F2F7` light ink and reset zoom transforms even when the app is in dark mode.

### 6.3 Accessibility & Copy Discipline
- **Keyboard Focus**: Mouse clicks suppress harsh outlines (`:focus:not(:focus-visible)`), while keyboard navigation enforces `2px` slate focus-visible rings (`rgba(15, 23, 42, 0.4)` light / `rgba(248, 250, 252, 0.45)` dark).
- **UI Copy**: Keep labels, headers, alerts, and empty states concise, punchy, and free of parenthetical explanations or system telemetry.
- **Do Not**:
  - Do not hardcode `#F8F9FA`, `#212529`, `#121212`, or `#0A0A0A` in new components—always use the synchronized TailAdmin/Executive Slate tokens (`#F1F5F9`/`#FFFFFF`/`#F7F9FC`/`#E2E8F0`/`#1C2434` light; `#1A222C`/`#1C2434`/`#24303F`/`#2E3A47`/`#DEE4EE` dark).
  - Do not use `bg-primary text-white` without `text-on-primary` (breaks dark-mode primary contrast).
  - Do not add `hover:-translate-y-*` or drop shadows to KPI/Metric cards.
  - Do not mix multi-word text pills (`rounded-full`) on badges or buttons.
