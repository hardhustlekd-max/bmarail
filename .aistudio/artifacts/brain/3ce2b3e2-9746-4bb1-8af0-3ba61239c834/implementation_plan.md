# Revised Implementation Plan: 100% Local Cache Preservation & Multi-Device Online DB Sync

## 1. Scope & Core Directive
**100% Zero-Loss Protection for All Local IndexedDB Records:**
Under no circumstances should opening or refreshing the app on any device delete, overwrite, or clear records stored in the browser's local `bma_offline_db` IndexedDB, even if those records:
- Were deleted from the online PostgreSQL database
- Differ in status (pending, approved, rejected, printed, expired)
- Were modified on another device

When discrepancies or locally cached records are detected, the app must preserve them in IndexedDB, display clear indicators of local vs. server status, and provide an explicit **"Upload to Online Database"** option.

---

## 2. Technical Architecture & Modifications

### A. Total Elimination of Destructive `store.clear()` (`src/utils/indexedDbStorage.ts`)
1. **Permanent Removal of `await store.clear()`:**
   - Modify `asyncSaveRegistrations()` to use non-destructive key-by-key upserts (`store.put(record)`).
   - Local records absent from the server payload are **never removed** during startup or background sync.
2. **Local Archive & Reconciliation Store (`archived_local_records`):**
   - Ensure every record written locally is retained with a local modification timestamp.
   - Introduce `asyncDetectLocalDiscrepancies(serverRegistrations)`:
     - Returns records that exist locally but are completely missing on the online server (e.g. deleted seed/accidental bulk delete).
     - Returns records that have local edits differing from the online server.

### B. Startup Sync Shield (`src/services/dbService.ts`)
1. **Non-Destructive Hydration in `syncCriticalStartup()` & `syncRegistrations()`:**
   - Before applying server data to in-memory state or saving back to storage, read existing IndexedDB records.
   - Merge strategy:
     - Server records update matching IDs.
     - Any local record not present on the server is preserved in memory as `isLocalOnly: true` (or retained in IndexedDB) without being discarded.
   - Detect total local-only/discrepant records and emit an event to the UI (`onLocalDiscrepanciesDetected`).

### C. Enhanced Navbar & Top Banner Notification (`src/components/HomePage.tsx`)
1. **Navbar "Fetch" Button Notification Badge:**
   - Display a distinct badge count on the **Fetch** navbar button (e.g., `3 Offline Records Available`) if any records exist in IndexedDB that are missing from PostgreSQL.
2. **Prominent Safety Alert:**
   - If missing/discrepant records are detected when loading the app on a secondary device, display a top alert banner:
     - *"Local records detected that are missing from the online database. Click Fetch to inspect and upload them."*

### D. Upgraded Recovery & Upload Console (`src/components/OfflineFetchModal.tsx`)
1. **Comprehensive Scope (All Record Statuses):**
   - Display all records found in local IndexedDB: `pending_approval`, `approved`, `rejected`, `printed`, etc.
   - Visual status badges:
     - **"Missing from Online DB"** (exists locally in IndexedDB, not found on server)
     - **"Synced with Online DB"** (matches server record)
     - **"Modified Locally"** (local version has updates not reflected on server)
2. **Batch & Individual Upload Controls:**
   - Single-click **"Upload to Online DB"** for each individual row.
   - **"Upload All Missing to Online DB"** button to batch restore all deleted/lost records into PostgreSQL with a single click.
   - Real-time progress bar and success/failure feedback for each record uploaded.

---

## 3. Step-by-Step Implementation Sequence

1. **Step 1: Update `src/utils/indexedDbStorage.ts`**
   - Remove `await store.clear()` in `asyncSaveRegistrations`.
   - Implement `asyncSaveRegistrationsNonDestructive` which preserves all existing records and performs non-destructive union.
   - Add `asyncCompareWithServerRecords(serverRecords)` to label records as `missing_from_server`, `synced`, or `local_only`.

2. **Step 2: Update Sync Flow in `src/services/dbService.ts`**
   - Adjust `mergeRegistrationsPreservingPhotos()` and `syncRegistrations()` so records existing locally in IndexedDB are never dropped when the server sends a smaller or truncated dataset.
   - Expose `getUnsyncedLocalRecordsCount()` and a listener for real-time banner/badge updates.

3. **Step 3: Revamp `src/components/OfflineFetchModal.tsx`**
   - Add status comparison chips (`Missing on Server`, `Synced`).
   - Add filtering tabs (`All Local Records`, `Missing from Server`, `Pending Approval`).
   - Implement robust `Upload to Online DB` action that handles photo/data preparation and executes `POST /api/registrations`.

4. **Step 4: Update `src/components/HomePage.tsx`**
   - Add badge counter to the desktop and mobile **Fetch** buttons.
   - Add dismissible notification banner when local-only records are detected on device boot.

5. **Step 5: Verification & Compilation**
   - Verify that restarting or syncing the app with a local record does not wipe `bma_offline_db`.
   - Verify that the Fetch modal lists the record with the "Missing on Server" tag.
   - Verify that clicking "Upload to Online DB" writes the record into PostgreSQL and increments the live server counter.
   - Run `compile_applet` to confirm clean compilation.

---

## 4. Verification Plan
- **Zero-Wipe Guarantee Test:** Simulate local records on device and trigger full sync; ensure `store.count()` does not drop.
- **Upload to DB Test:** Confirm that deleted records uploaded from the modal successfully persist in PostgreSQL and appear in the server dashboard.
- **App Compilation:** Verify `compile_applet` succeeds with 0 errors.
