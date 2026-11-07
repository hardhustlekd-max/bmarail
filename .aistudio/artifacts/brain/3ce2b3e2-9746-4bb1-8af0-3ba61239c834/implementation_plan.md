# Fix Database Backup Restore Persistence & Ensure Audit Log Clearance Only

## User Review & Critical Decisions

> [!IMPORTANT]
> - **Backup Restore Persistence**: Ensure imported records from backup JSON files (registrations, users, officers, payment receipts, unregistered reports, audit logs, and settings) are correctly saved and persisted to both in-memory state and the PostgreSQL database backend.
> - **Audit Log Clearance Scope**: Ensure clearing system audit logs (`clear_audit` action) ONLY deletes `system_audit_logs`, strictly preserving all membership registrations, payments, and operational records.

- **Confirmed Decision 1**: Merge and upsert restored records while keeping existing unaffected data.
- **Confirmed Decision 2**: Purge audit logs only when clicking "Clear System Audit Logs", preserving all motorcycle registrations and payment receipts.

---

## 1. Overview & Core Concept

- **What It Does**: Fixes backup restoration so that uploaded JSON backup files correctly populate and persist all records across database tables and local stores. Also fixes the audit log clearing endpoint so that it only truncates `system_audit_logs` without affecting motorcycle registrations, payments, or verifications.
- **Target Audience / Persona**: Super Administrators managing system backups and governance audits.
- **Key Value**: Reliable disaster recovery and precise security audit maintenance without accidental data loss.

---

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. Super Admin uploads a backup JSON file in Super Admin Settings. The system validates and persists all records to PostgreSQL and local state.
  2. Super Admin clicks "Clear System Audit Logs". A confirmation dialog appears, and upon confirmation, only audit logs are wiped while registrations and payments remain untouched.
- **Visual Identity & Theme**: Clean Tailwind semantic UI with clear confirmation modals and status toast notifications.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1**: Server-Side Import Handling
  - *Chosen Approach*: Ensure `/api/import-database` correctly maps and upserts all tables (`motorcycle_registrations`, `system_users`, `officer_assignments`, `payment_receipts`, `unregistered_vehicle_reports`, `system_audit_logs`, `system_settings`).
- **Decision 2**: Precise Table Wiping for Audit Logs
  - *Chosen Approach*: Update `/api/reset-data` or create a dedicated `/api/clear-audit` route that only targets `system_audit_logs`.

---

## 4. Technical Architecture & Data Strategy

```
┌─────────────────────────┐          ┌─────────────────────────┐
│ SuperAdminInterface.tsx │◄────────►│ dbService.ts / server.ts│
└─────────────────────────┘          └────────────┬────────────┘
                                                  │
                                                  ▼
                                     ┌─────────────────────────┐
                                     │ PostgreSQL Database     │
                                     │ - motorcycle_registrations│
                                     │ - payment_receipts      │
                                     │ - system_audit_logs     │
                                     └─────────────────────────┘
```

- **Data Model & State**:
  - `system_audit_logs`: Cleared independently.
  - `motorcycle_registrations`, `payment_receipts`, `system_users`: Preserved during audit clearing and properly restored during full backup imports.
- **Interactive Component & State Mapping**:
  - `handleImportBackupJsonFile`: Calls `importFullDatabaseBackup` which sends payload to `/api/import-database`.
  - `clearAllAuditLogs`: Calls `/api/clear-audit` (or targeted reset) to wipe only audit logs.
