# Implementation Plan - Unified UI Architecture for Connected Headers, Tabs, and Tables

Address the visual disconnection across the application where headers, tab bars, filter bars, and table bodies render as isolated floating boxes with awkward whitespace gaps. Establish a cohesive design system architecture where tabs sit flush without gaps against their content sections, table toolbars and filters live inside a single unified card shell, and page headers seamlessly anchor to workspace controls.

## User Review Required

> [!IMPORTANT]
> **Design Alignment Confirmations**:
> - **Unified Card Shell with Flush Tabs**: Tab headers are physically welded to the content body beneath them. Active tabs directly interface with the content surface using continuous interior divider lines rather than floating in an isolated island card above it.
> - **Single Unified Table Shell**: The date range picker, search input, status chips/tabs, matrix legend, data table, and pagination controls will be housed within one seamless card container with subtle interior dividing lines (`divide-y` or contiguous `border-b`) rather than 3–4 stacked separate cards.
> - **Integrated Page Header**: Page titles and actions will directly anchor to view switchers and filter toolbars, creating an intentional, compact, professional desktop and mobile enterprise feel.

---

## Proposed Changes

### Design System Foundation

#### [AssocDesignSystem.tsx](file:///src/components/ui/AssocDesignSystem.tsx)
- Enhance `TableContainer` and add `UnifiedWorkspaceCard`:
  - Support integrated header, flush tab headers, embedded filter bar, content slot, and footer/pagination slot in one contiguous container.
  - Eliminate disjointed margins, excessive padding, and separate floating cards between toolbar, filters, and tables.
- Update `TabList` (`variant="underline"` and `variant="pill"`):
  - Add `flush` prop to anchor tabs directly to the top edge of the card container below with zero bottom margin and continuous border flow.
  - Implement active tab indicators that seamlessly merge into the active panel.
- Ensure strict compliance with design tokens and MUI Icons (`Icon` component), avoiding raw emojis or inconsistent font styles.

---

### Core Page Implementations

#### [PaymentReceiptsPage.tsx](file:///src/components/PaymentReceiptsPage.tsx)
- **Problem**: 
  1. The page header banner is a standalone floating box.
  2. The view switcher (Receipts Table vs. Monthly Fee Statistics) is another standalone floating box with its own border and shadow.
  3. The date range picker floats in a third separate box.
  4. The search toolbar and status tabs float in a fourth card.
  5. The table and pagination sit in their own nested containers.
- **Solution**:
  - Unify into a single, cohesive **Workspace Shell**:
    - **Integrated Header Bar**: Houses the page title, description, user badge status, and the "New payment" primary button.
    - **Flush Tab Header**: Connected directly to the top of the main container (no gap). Active tab border flows seamlessly into the panel.
    - **Tab 1 (Receipts Table)**:
      - Integrated toolbar holding the Ethiopian Date Range Picker, Quick Presets, Search input, and Status filter tabs all within the unified card header.
      - Compact status legend docked right above the table matrix.
      - Monthly Matrix Ledger rendered directly inside the shell.
      - Pagination controls docked cleanly at the bottom border.
    - **Tab 2 (Monthly Fee Statistics)**:
      - Integrated Date Range Picker directly inside the container header.
      - 5-Column responsive Metric Cards and collection summary seamlessly embedded.

#### [VehiclesPage.tsx](file:///src/components/VehiclesPage.tsx)
- Review and consolidate the vehicle registry table layout:
  - Connect search, category filters, and action buttons directly into the table container header.
  - Remove detached intermediate filter boxes to align with the single unified card shell standard.

#### [MembersFeePage.tsx](file:///src/components/MembersFeePage.tsx)
- Unify the membership dues summary cards, tab navigation, and member fee table into contiguous container shells.

---

## Verification Plan

### Automated Build & Syntax Checks
- Run `compile_applet` to ensure TypeScript compilation passes with zero type errors.
- Run `lint_applet` to verify no lint warnings or missing imports.

### Manual Visual Verification
1. **Payment Receipts Page**:
   - Verify that switching between "Receipts Table" and "Monthly Fee Statistics" tabs feels like switching tabs inside an integrated card, with no gap or disjointed floating boxes.
   - Verify that Date Range Picker, Search, Status filter tabs, Ledger matrix, and Pagination render inside a single, beautifully bordered unified card.
   - Test responsive layout on mobile (< 640px) and desktop (>= 1024px) for horizontal overflow, smooth borders, and touch targets.
2. **Vehicles and Directory Pages**:
   - Verify table headers, filter bars, and table bodies form a single continuous visual unit.
3. **Dark Mode & Light Mode**:
   - Ensure continuous borders (`border-[#E2E8F0]` in light mode, `border-[#2E3A47]` in dark mode) render cleanly without double borders or clipped shadows.
