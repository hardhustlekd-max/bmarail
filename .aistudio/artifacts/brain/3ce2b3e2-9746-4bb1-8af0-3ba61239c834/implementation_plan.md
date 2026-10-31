# Unified Space-Saving Table Filter Architecture

Consolidate and streamline the filter sections across all tables in the association portal into a space-efficient, two-tier system: a clean primary toolbar (search and status segmented pills) combined with an animated, collapsible secondary filter drawer (sub-city, category, sort order, and reset controls) that eliminates screen clutter on both mobile and desktop viewports.

### User Review & Critical Decisions

> [!IMPORTANT]
> The following user architectural decisions were confirmed and form the foundation of this implementation:
>
> - **Collapsible Expandable Filter Drawer**: Secondary filters (sub-city dropdown, sorting options, vehicle category selectors, and visibility toggles) are grouped into a dedicated collapsible drawer that opens/closes on demand, keeping the default table header ultra-compact and focused.
> - **Mobile Two-Tier Priority Layout**: On mobile screens, the search bar spans full-width with the filter toggle button at the top, directly accompanied by horizontally scrollable status pills below, preventing multi-line wrapping and accidental collisions.
> - **Minimalist Active Indicator**: Active filters are signaled cleanly via a subtle highlight on the filter toggle button (with an optional count dot) and an inline reset button inside the drawer, avoiding bulky filter tag chips to maximize vertical tabular view real estate.

---

### 1. Overview & Core Concept

- **What It Does**: Standardizes all 6 data tables across the application (`TablesPage`, `TodaySubmissionsPage`, `PaymentReceiptsPage`, `OfficerVerificationHistory`, `UnregisteredReportsList`, and `SuperAdminInterface`) to share a consistent, high-density filter architecture.
- **Target Audience / Persona**: Traffic officers, clerks, admins, and super-admins reviewing records on smartphones in the field or desktop widescreen displays in regional offices.
- **Key Value**: Saves up to 45% of vertical viewport space on mobile devices and prevents layout collisions on medium-sized screens, allowing users to view more table rows without repetitive vertical scrolling.

---

### 2. User Experience & Visual Design

#### Key User Flows
1. **Quick Search & Status Filtering (Default View)**:
   - User types in the always-visible search input to perform instant fuzzy matching on plate numbers, owner names, or phone numbers.
   - User taps/clicks a status pill tab (`All`, `Approved`, `Pending`, `Rejected`, `Verified`, etc.) to switch datasets without expanding any menus.
2. **Advanced Filtering (Collapsible Drawer)**:
   - When specific filtering is needed (e.g., filtering by sub-city "ዘንዘልማ" or sorting by date descending), the user taps the **"Filters" (`tune` / `filter_list`)** toggle button.
   - A sleek, compact drawer panel slides down with smooth transition, revealing dedicated inputs: Sub-City select, Vehicle Category select, Sort Field, and Sort Direction.
   - A single **"Reset / አጽዳ"** button in the drawer clears all secondary filters and collapses the drawer.

#### Visual Identity & Theme
- **Primary Toolbar Height**: Standardized `h-9` (36px) search bar and `h-8` (32px) action pills for rapid touch accuracy without visual bloat.
- **Color Tokens**:
  - Light mode: Surface `#FFFFFF` on canvas `#F7F9FC` with borders `#E2E8F0`.
  - Dark mode: Surface `#1C2434` on canvas `#24303F` with borders `#2E3A47`.
  - Accent: Association Blue (`#1E3A8A` / `--color-primary`) for active states and highlights.
- **Typography**: Single-line `whitespace-nowrap` text with `tabular-nums` for record counts and indexes.
- **Motion**: Subtle CSS max-height and opacity easing (`transition-all duration-200 ease-out`) for the collapsible filter drawer.

---

### 3. Key Product Decisions & Trade-Offs

- **Decision 1: Reusable Collapsible Filter Drawer vs Permanent Multi-Row Wrap**:
  - *Chosen Approach*: Group secondary dropdowns (Sub-City, Category, Sort by, Sort order) into a collapsible drawer activated by a unified toggle button.
  - *Why*: Permanent multi-row toolbars consume 120px+ of vertical space on mobile and wrap unpredictably into 3-4 broken lines on tablets. The drawer reduces the default header footprint to a single crisp row.
  - *Alternatives Considered*: Popover floating dropdowns were considered, but drawers provide superior keyboard navigation, full-width touch targets on mobile, and zero z-index clipping against table headers.

- **Decision 2: Mobile Stack (Search + Scrollable Pills) vs Hidden Search Modal**:
  - *Chosen Approach*: Full-width search bar paired with smooth horizontally scrollable status tabs (`overflow-x-auto scrollbar-none`).
  - *Why*: Search and status switching are the top 2 most frequent actions performed by clerks and traffic officers. Keeping them instantly accessible without extra modal clicks preserves high operational speed.

- **Decision 3: Minimal Indicators vs Multi-Chip Tag Clouds**:
  - *Chosen Approach*: Subtle active indicator dot on the filter toggle button with an instant clear button inside the drawer.
  - *Why*: Removable filter chip clouds consume an entire dedicated row (30-40px), defeating the purpose of space conservation.

---

### 4. Technical Architecture & Data Strategy

```
┌────────────────────────────────────────────────────────────────────────┐
│ UNIFIED WORKSPACE CARD / TABLE SHELL                                   │
│                                                                        │
│ ┌────────────────────────────────────────────────────────────────────┐ │
│ │ TIER 1: PRIMARY TOOLBAR (ALWAYS VISIBLE)                           │ │
│ │ [ Search Input (Full/Flexible) ]  [ Filter Toggle (Active Dot) ]   │ │
│ │ [ Status Pills: All (42) │ Paid (30) │ Due (8) │ Overdue (4)     ] │ │
│ └────────────────────────────────────────────────────────────────────┘ │
│                                  │ (Toggle Click)                      │
│                                  ▼                                     │
│ ┌────────────────────────────────────────────────────────────────────┐ │
│ │ TIER 2: COLLAPSIBLE FILTER DRAWER (ON-DEMAND)                      │ │
│ │ [ Sub-City Select ]  [ Category/Type ]  [ Sort Field ]  [ Dir ↕ ]  │ │
│ │                                                  [ Reset / Clear ] │ │
│ └────────────────────────────────────────────────────────────────────┘ │
│                                                                        │
│ ┌────────────────────────────────────────────────────────────────────┐ │
│ │ DATA TABLE / MOBILE CARDS VIEW                                     │ │
│ │ ────────────────────────────────────────────────────────────────── │ │
│ │ #1 │ Abebe Kebede  │ 0918... │ 3-AA-12345 │ Electric │ Kirkos      │ │
│ │ #2 │ Almaz Tesfaye │ 0911... │ 2-BA-98765 │ Gasoline │ Gish Abay   │ │
│ └────────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────┘
```

#### Affected Table Views & State Mapping

1. **`src/components/TablesPage.tsx` (Members Information Directory)**:
   - Primary: Search query input + Vehicle Type Segmented Pill + Status Tabs.
   - Drawer: Sub-City dropdown, Sort Field (`Date`, `Name`, `Plate`, `Category`), Sort Direction (`ASC`/`DESC`), and Company Vehicle toggle (SuperAdmin).
   - Drawer toggle state: `isFilterDrawerOpen` (boolean).

2. **`src/components/TodaySubmissionsPage.tsx` (Corrections & Submissions Table)**:
   - Primary: Search query input + Date toggle (`Today's Only` / `All Dates`) + Status Tabs (`Pending Approval` / `Referred for Correction`).
   - Drawer: Sub-City dropdown and sorting controls.
   - Drawer toggle state: `isFilterDrawerOpen` (boolean).

3. **`src/components/PaymentReceiptsPage.tsx` (Receipts & Matrix Ledger)**:
   - Primary: Search input + Status segmented pills (`All`, `Paid`, `Due Soon`, `Overdue`).
   - Drawer: Vehicle category filter, Month/Year selectors, and Quick Clear.
   - Status Legend: Compact inline placement directly adjacent to the matrix.

4. **`src/components/OfficerVerificationHistory.tsx` (Inspection Log Reports)**:
   - Primary: Search plate/name/phone + Status segmented pills (`All`, `Verified`, `Warning`, `Flagged`).
   - Drawer: Vehicle Category dropdown, Date filter, and Sort direction.

5. **`src/components/UnregisteredReportsList.tsx` (Unregistered Motors Registry)**:
   - Primary: Search query + Status filter tabs (`Pending Investigation`, `Impounded`, `Cleared`).
   - Drawer: Sub-City selector, Incident date range, and Quick Clear.

6. **`src/components/SuperAdminInterface.tsx` (User Management & Audit Logs)**:
   - Primary: Search input + Role/Severity pills.
   - Drawer: Action category, date range, and audit export shortcuts.
