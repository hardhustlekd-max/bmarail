# Payment Collection, Pro-Rata Engine, Monthly Matrix & RBAC Action Controls

Revamp the payment processing engine, pro-rata fee calculation rules, monthly matrix due-soon calculations, payment completion flow, and RBAC action button permissions in the members fee directory.

## User Review & Critical Decisions

> [!IMPORTANT]
> The following key product decisions have been confirmed through Phase 1 clarification:

- **Confirmed Decision 1 (Pro-Rated Initial Registration Fee)**: Calculate exact daily pro-rata fee based on remaining days in the month upon member registration (`(days_remaining / total_days_in_month) * monthly_rate`). If full month remains (registered on 1st or whole month left), charge full monthly fee. Allow advance payment selection for upcoming months during registration or renewal.
- **Confirmed Decision 2 (RBAC Member Fee Directory Actions)**: Include Record Payment, View Ledger, Print Receipt, and Edit Transaction action buttons in the Members Fee Directory under SuperAdmin RBAC control, with full permissions enabled by default for SuperAdmin.
- **Confirmed Decision 3 (Advance Payments in Monthly Matrix Ledger)**: Mark all advance paid months as `Paid` (`active` green status indicators) in the monthly matrix ledger grid for the member across all covered months.
- **Confirmed Decision 4 (Due Soon Threshold)**: Set the matrix "Due Soon" threshold to trigger for registrations that will expire within 5 days before the month ends or active term expiration date.

---

## 1. Overview & Core Concept

- **What It Does**: Standardizes fee collection, pro-rata calculation, advance month coverage, monthly matrix status tracking, payment receipt generation, and role-based action controls in compliance with association financial management standards.
- **Target Audience**: Association Administrators, Revenue Clerks, SuperAdmins, and Finance Officers in Bahir Dar Motorist Association.
- **Key Value**: Eliminates overcharging or undercharging for mid-month registrations, automates advance month tracking, provides accurate 5-day expiration warnings on the matrix dashboard, and gives SuperAdmin granular RBAC control over financial action buttons.

---

## 2. User Experience & Visual Design

- **Registration & Payment Entry Flow**:
  1. During new member registration or fee collection, selecting the registration date automatically calculates the exact daily pro-rated fee for the current month.
  2. The user can select additional advance months (1 to 12 months) with live subtotal breakdown (Pro-rated current month + Advance months total = Grand Total).
  3. Clicking "Complete Payment" generates a payment record, updates member term status to `CURRENT`, advances the `activeTermExpirationDate`, and emits a printable official bank payment receipt.
- **Monthly Matrix Ledger View**:
  1. Displays all 12 monthly periods per member.
  2. Paid months (current or advance) display solid green active status indicators (`paid`).
  3. Months expiring within 5 days before month-end show amber warning indicators (`pending` / Due Soon).
  4. Overdue/unpaid months show crimson status indicators (`unpaid`).
- **RBAC Action Controls in Fee Directory**:
  1. Action column in Members Fee Directory renders Record Payment, View Ledger, Print Receipt, and Edit Transaction buttons.
  2. Visibility and edit capabilities are governed by `getPermissionState(userRole, 'fee_directory_actions')` in `src/services/dbService.ts`.
  3. SuperAdmin role has full `allow` permissions by default, configurable via SuperAdmin RBAC controls.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Exact Daily Pro-Rata vs Flat Mid-Month Tier**:
  - *Chosen Approach*: `dailyRate = monthlyFee / daysInMonth`, `initialFee = Math.round(remainingDays * dailyRate)`.
  - *Why*: Provides exact mathematical fairness for members registering at any point in the month without artificial half-month jumps.
- **Decision 2: Direct Period Coverage vs Credit Balance Model**:
  - *Chosen Approach*: Advance months directly mark corresponding future month periods as `paid` in `periodStatusMap`.
  - *Why*: Ensures instantaneous alignment between payment receipts, ledger matrices, and scanner verification without complex balance reconciliations.

---

## 4. Technical Architecture & Data Strategy

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      PAYMENT & RBAC ARCHITECTURE                        │
└─────────────────────────────────────────────────────────────────────────┘
                                   │
      ┌────────────────────────────┼────────────────────────────┐
      ▼                            ▼                            ▼
┌──────────────┐          ┌──────────────────┐         ┌─────────────────┐
│ Payment Utils│          │ Matrix Calculator│         │ RBAC Permission │
│(Pro-Rata Calc│          │ (5-day Expiry    │         │  Controller     │
│ & Receipts)  │          │   Threshold)     │         │(Fee Dir Actions)│
└──────┬───────┘          └────────┬─────────┘         └────────┬────────┘
       │                           │                            │
       └───────────────────────────┼────────────────────────────┘
                                   ▼
                   ┌───────────────────────────────┐
                   │  Database & DataContext Store  │
                   │(PaymentReceipts & Reg Status) │
                   └───────────────┬───────────────┘
                                   │
       ┌───────────────────────────┼───────────────────────────┐
       ▼                           ▼                           ▼
┌──────────────┐          ┌──────────────────┐        ┌──────────────────┐
│  Multi-Step  │          │ Monthly Matrix   │        │   PaymentKPI &   │
│ Registration │          │  Ledger Sheet    │        │ Receipts Directory│
└──────────────┘          └──────────────────┘        └──────────────────┘
```

### Data Model Updates (`src/types.ts` & `src/utils/paymentUtils.ts`)

- `calculateProRatedFee(registrationDate: string, monthlyFee: number = 300)`: Returns remaining days, days in month, pro-rated amount, and breakdown string.
- `calculateAdvancePaymentTotal(proRatedAmount: number, advanceMonthsCount: number, monthlyFee: number)`: Computes total fee and coverage expiration date.
- `isExpiringInFiveDays(expirationDateStr: string)`: Checks if expiration date is within 5 days of current date or month-end.

---

## Implementation Steps

1. Update `src/utils/paymentUtils.ts` with daily pro-rata fee calculation and 5-day matrix due-soon calculation helper functions.
2. Update `src/components/MultiStepRegistrationForm.tsx` and payment collection modal to incorporate live pro-rated initial month calculations + advance month selectors.
3. Update `src/components/RevenuePage.tsx` / `PaymentReceiptsPage.tsx` / `MonthlyMatrixLedger` to render advance paid months as `paid` green dots, and mark terms expiring within 5 days as `pending` (amber due soon).
4. Update `src/services/dbService.ts` to ensure default RBAC permission for `clerkPaymentKPIPermission` and `clerkPaymentTablePermission` includes full SuperAdmin action rights for Fee Directory controls (`Record Payment`, `View Ledger`, `Print Receipt`, `Edit Transaction`).
