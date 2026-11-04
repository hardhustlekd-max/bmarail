# Heavy Redesign of Detail Drawer for Mobile & Desktop

Refine and elevate the side-over detail drawer across `TablesPage.tsx` and `PaymentReceiptsPage.tsx` to provide a unified, responsive design for desktop and mobile viewports.

## User Requirements & Confirmed Decisions

- **Desktop Drawer Dimensions**: Standardized width of 520px–580px (`w-full sm:w-[540px] md:w-[560px] lg:w-[580px] max-w-full sm:max-w-[580px]`) with fixed right alignment.
- **Mobile Drawer Presentation**: Full-height slide-over panel spanning full viewport width (`w-full`) with touch-friendly touch targets, smooth backdrop dismiss (`backdrop-blur-sm bg-slate-950/60`), and seamless safe-area padding.
- **Navigation Structure**: Compact segmented control tabs (Info, Ledger/Payments, Documents) with badge counts, active state elevation, and material icon accents.
- **Data Organization**:
  - Distinctive card tiles with subtle contrast borders, icon accents, and clear hierarchy.
  - Quick-copy chips for key identifiers (Plate number, Phone, Chassis #, Engine #, Receipt #).
  - Tabular figures (`font-mono tabular-nums`) for currency amounts, phone numbers, and Ethiopian calendar dates.
  - Interactive documents grid with zoom affordances and preview carousel integration.
- **Sticky Action Footer**:
  - Pinned persistent footer at the bottom of the drawer (`sticky bottom-0 shrink-0`) containing all operational action buttons (`Approve`, `Reject`, `Edit`, `ID Card`, `Permit`, `Sticker`, `+ Receipt`), ensuring actions are accessible from any tab without scrolling.
- **Zero Emojis & Clean Iconography**: Exclusively using Material Symbols icons (`material-symbols-outlined`) across all drawer controls.

## 1. Unified Drawer Anatomy

```
┌──────────────────────────────────────────────────────────────────┐
│  DRAWER HEADER (Persistent, Elevation 1)                         │
│  [Avatar / Icon]  [Full Name / Entity]  [Plate Chip]   [✕ Close] │
├──────────────────────────────────────────────────────────────────┤
│  SEGMENTED TABS (Compact, Flush)                                 │
│  [ [i] Info ]  [ [≡] Payments (3) ]  [ [▤] Documents (5/5) ]     │
├──────────────────────────────────────────────────────────────────┤
│  SCROLLABLE CONTENT BODY (Card Tiles)                            │
│                                                                  │
│  ┌─ Profile & Identifiers ────────────────────────────────────┐  │
│  │ [Portrait Thumbnail (Zoom)]   Plate # / ID / Phone [Copy]  │  │
│  │                               Subcity / Status / Dates     │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌─ Vehicle Technical Specifications ─────────────────────────┐  │
│  │ Category / Motor Model / Chassis # [Copy] / Engine # [Copy]│  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
├──────────────────────────────────────────────────────────────────┤
│  STICKY ACTION FOOTER (Pinned at bottom, accessible from all tabs)│
│  [Edit] [ID Card] [Permit] [Sticker] [+ Receipt] [Approve/Reject]│
└──────────────────────────────────────────────────────────────────┘
```

## 2. Implementation Steps

1. **`TablesPage.tsx` Drawer Refactor**:
   - Modernize drawer container width to `w-full sm:w-[540px] md:w-[560px] lg:w-[580px]`.
   - Upgrade header with quick-copy plate chip, status badge, and large touch-friendly close button.
   - Refactor segmented tab bar into a high-contrast segmented control with icon accents and pill count badges.
   - Style Tab 1 (Info) with clean modular card tiles, copy-to-clipboard buttons on phone/chassis/engine, and tabular figure numbers.
   - Style Tab 2 (Payments & Ledger) with status banner, tabular figures, and clean receipt list.
   - Style Tab 3 (Documents) with responsive image tiles, zoom hover overlay, and empty state fallbacks.
   - Move operational actions out of Tab 1 body into a **persistent sticky footer** at the base of the drawer, accessible regardless of active tab.

2. **`PaymentReceiptsPage.tsx` Drawer Alignment**:
   - Align drawer styling with the same segmented tabs, card tile hierarchy, copy chips, and sticky footer.
   - Ensure mobile responsiveness matches `TablesPage.tsx`.

3. **Verification**:
   - Run `compile_applet` and `lint_applet` to ensure zero compilation or syntax errors.
   - Validate responsive drawer rendering on desktop and mobile viewports.
