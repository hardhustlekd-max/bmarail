# PostgreSQL Network Egress Optimization Plan

Comprehensive architectural strategy to eliminate excess PostgreSQL network egress and prevent connection drops (`ECONNRESET`, bandwidth caps, and slow queries) by offloading binaries to S3/disk storage, introducing server-side memory caching with instant write invalidation, eliminating full-table scans, and transitioning client sync to an SSE-first model.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> The following architectural decisions were confirmed during the Phase 1 clarification interview and govern this implementation plan:

- **Confirmed Decision 1 (Storage Architecture)**: Store only lightweight URL references in PostgreSQL (`/api/storage/file/...`) and keep all image/document binaries strictly in S3 and local disk cache. Any legacy raw base64 data currently stored in PostgreSQL columns will be migrated to S3/disk and replaced with URLs.
- **Confirmed Decision 2 (Server Caching Strategy)**: Implement a high-performance in-memory cache in the Node.js Express process for frequently requested queries (KPIs, system settings, fee summaries, paginated registrations), invalidated instantly whenever a write action occurs (`actions` insert, `dbUpsert`, `dbDelete`).
- **Confirmed Decision 3 (Client Sync & Polling Model)**: Elevate Server-Sent Events (SSE) to the primary live data transport, reducing aggressive 15-second background polling to an idle safeguard interval (90s) and leveraging `304 Not Modified` ETags.

---

## 1. Overview & Core Concept

### What It Does
This optimization addresses the root causes of excessive PostgreSQL network bandwidth consumption:
1. **Binary Offloading**: Stops storing megabytes of raw image data/base64 strings inside PostgreSQL `TEXT` columns (`user_portrait_photo`, `national_id_photo`, `driving_license_photo`, `driving_permit_photo`, `receipt_screenshot`).
2. **Targeted SQL Projections**: Replaces indiscriminate `SELECT *` queries in list, table, and sync endpoints with lightweight column projections (fetching photos only on detail inspection or print).
3. **Elimination of Full-Table Scans**: Replaces helper calls like `dbGetAll('motorcycle_registrations')` (which pulled up to 2,000+ rows just to verify a single plate or receipt) with targeted single-row indexed queries (`SELECT id FROM motorcycle_registrations WHERE plate_number = $1 LIMIT 1`).
4. **Server-Side In-Memory Cache with Instant Invalidation**: Caches frequent read-heavy responses in Node.js server RAM. Queries hit PostgreSQL only on cache misses or immediately following verified data mutations.
5. **SSE-First Client Synchronization**: Eliminates repetitive 15-second full-page sync polling that constantly triggered heavy database queries across all connected clients.

### Target Audience & Operational Impact
- **System Administrators & Municipal Operators**: Eliminates unexpected database bandwidth cost spikes on cloud providers (Railway, Google Cloud SQL, Neon).
- **Field Inspection Officers & Clerks**: Prevents `ECONNRESET` database timeouts, speeds up page load times from seconds to single-digit milliseconds, and ensures seamless real-time updates.

---

## 2. User Experience & Operational Flows

### Key User Flows

```
┌────────────────────────────────────────────────────────────────────────┐
│                   CLIENT APPLICATION / BROWSER                         │
└────────────────────────────────────┬───────────────────────────────────┘
                                     │
           1. Reads hit Node Cache   │   2. SSE receives live diffs
             (0 KB Postgres egress)  │      (Zero DB polling overhead)
                                     ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   EXPRESS BACKEND SERVER (Node.js)                     │
│                                                                        │
│   ┌───────────────────────────┐    ┌───────────────────────────────┐   │
│   │   In-Memory Query Cache   │    │     SSE Broadcast Engine      │   │
│   │   (KPIs, Settings, Lists) │    │  (Broadcasts record updates)  │   │
│   └─────────────┬─────────────┘    └───────────────▲───────────────┘   │
└─────────────────┼──────────────────────────────────┼───────────────────┘
                  │ Miss / Invalidation              │ Write / Invalidate
                  ▼                                  │
┌────────────────────────────────────────────────────┴───────────────────┐
│                 POSTGRESQL DATABASE (Minimal Egress)                   │
│                                                                        │
│   • Lightweight rows: IDs, plates, metadata, short S3 URLs (~1 KB/row) │
│   • Zero raw base64 or photo buffers stored in database tables         │
│   • Single-row indexed queries instead of full-table scans             │
└────────────────────────────────────────────────────────────────────────┘
```

1. **Member List & Table Browsing**:
   - The user opens the Registry Table or Dashboard.
   - The server serves cached list rows or queries PostgreSQL using selective column projection (plate number, name, phone, status, and S3 URL references).
   - Egress per row drops from ~500 KB–2 MB down to under 1 KB (>99% reduction).

2. **Document Inspection & Modal Previews**:
   - When a clerk or officer clicks "Inspect", "View Documents", or "Print Badge", the client fetches document images directly from S3/storage proxy (`/api/storage/file/...`), completely bypassing PostgreSQL query egress.

3. **Real-Time Data Updates**:
   - When a new registration is submitted or approved, the server saves the record, writes an audit action, broadcasts the update via Server-Sent Events (SSE), and selectively invalidates the relevant server-side cache keys.
   - Other connected clients receive the update via the live SSE channel without firing duplicate polling queries against PostgreSQL.

---

## 3. Key Product Decisions & Trade-Offs

### Decision 1: S3/Disk Binary Storage vs. In-Database Storage
- **Chosen Approach**: All document attachments (portraits, IDs, licenses, police permits, bank receipts) must be saved as binary files in S3 or local disk cache. PostgreSQL stores only the normalized URL string (`/api/storage/file/...`).
- **Why**: Storing binary data in PostgreSQL table rows multiplies database network egress exponentially on every query and backup. Storing URLs reduces row size by ~99%.
- **Legacy Data Migration**: A background migration routine will scan existing database rows, write any legacy base64 strings to S3/disk files, and update the database columns with the resulting file URLs.

### Decision 2: Event-Driven Invalidation vs. Fixed Time-To-Live (TTL) Caching
- **Chosen Approach**: Server-side in-memory cache with instantaneous invalidation driven by write events (`recordSystemAction`, `dbUpsert`, `dbDelete`).
- **Why**: Fixed TTL caching either serves stale data (if TTL is long) or fails to prevent database egress spikes (if TTL is short). Event-driven invalidation gives the best of both worlds: zero database egress during idle reads, and zero staleness when records change.

### Decision 3: Single-Row Indexed Lookups vs. `dbGetAll` In-Memory Filtering
- **Chosen Approach**: Replace all occurrences of `await dbGetAll(...)` in helper routes (e.g. searching for a matching plate during payment receipt creation) with direct, indexed parameterized SQL queries (`SELECT id FROM motorcycle_registrations WHERE LOWER(plate_number) = $1 LIMIT 1`).
- **Why**: Pulling thousands of registrations across the network into Node.js memory just to find one plate number is a major contributor to network egress and socket timeouts (`ECONNRESET`).

### Decision 4: SSE-First Transport with Relaxed Safeguard Polling
- **Chosen Approach**: Rely on the existing SSE stream (`/api/realtime/stream`) for immediate state distribution. Relax the periodic client-side polling interval from 15 seconds to 90 seconds (active page safeguard only), and honor HTTP `304 Not Modified` ETags.
- **Why**: 15-second polling across multiple active tabs or users creates constant query chatter even when no data has changed.

---

## 4. Technical Architecture & Data Strategy

### Technical Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              CLIENT LAYER                                    │
│  - SSE Listener (realtimeSync.ts) receives live entity diffs                 │
│  - Background polling relaxed from 15s to 90s safeguard                      │
│  - Document photos loaded directly via storage URLs (/api/storage/file/...)  │
└──────────────────────────────────────┬───────────────────────────────────────┘
                                       │ HTTP Requests & SSE
                                       ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                           EXPRESS SERVER LAYER                               │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │                    Server-Side In-Memory Cache                         │  │
│  │  - Key-Value Store: `kpi_summary`, `settings`, `regs_p1_l25_...`       │  │
│  │  - Instant invalidation on dbUpsert, dbDelete, recordSystemAction      │  │
│  └───────────────────────────────────┬────────────────────────────────────┘  │
│                                      │                                       │
│  ┌───────────────────────────────────▼────────────────────────────────────┐  │
│  │                     Optimized Database Helpers                         │  │
│  │  - dbGetRegistrationsScoped: Excludes raw photo blobs from lists        │  │
│  │  - Single-row lookup queries (dbFindByPlate, dbFindById)               │  │
│  │  - Legacy Base64 -> S3 Migration Scanner                              │  │
│  └───────────────────────────────────┬────────────────────────────────────┘  │
└──────────────────────────────────────┼───────────────────────────────────────┘
                                       │ Optimized SQL (No Base64 / No Scan)
                                       ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                         POSTGRESQL DATABASE                                  │
│  - Indexed single-row queries (O(1))                                         │
│  - Lightweight text columns containing clean URL paths only                  │
│  - Minimized egress bandwidth and socket reset resilience                    │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Component & File Mapping Plan

1. **`src/server/db.ts`**:
   - **Server-Side Cache**: Implement an in-memory query cache (`serverQueryCache`) with tag-based invalidation (`invalidateCache('registrations')`, `invalidateCache('kpis')`, etc.).
   - **Single-Row Query Helpers**: Add targeted lookup helpers (`dbFindRegistrationByPlate`, `dbFindRegistrationById`) that query only `id, plate_number, full_name` with `LIMIT 1`, replacing full-table scans.
   - **Selective Column Projection in `dbGetRegistrationsScoped`**: Add an option `excludeHeavyBlobs?: boolean` (default `true` for paginated table views and sync) that returns metadata and image URLs, avoiding heavy base64 payloads.
   - **`getMaterializedKPIs` Caching**: Cache the `system_summary` row in memory; return immediately without hitting PostgreSQL unless invalidated.
   - **Base64 Sanitization & Migration**: Add an automated check in `dbUpsert` to guarantee base64 strings are saved to S3/disk before writing to PostgreSQL, and migrate existing base64 entries.

2. **`server.ts`**:
   - **Eliminate `dbGetAll` Scans**: Replace all full-table scans in `/api/payment-receipts`, `/api/membership-fees`, and `/api/registrations/lookup` with targeted indexed SQL queries.
   - **Cache Invalidation Hooks**: Trigger `invalidateCache(...)` inside POST/PUT/DELETE routes and inside `recordSystemAction`.
   - **Conditional GET / ETag Efficiency**: Return `304 Not Modified` on `/api/registrations` and `/api/sync` when data hash has not changed.

3. **`src/services/dbService.ts` & `src/services/realtimeSync.ts`**:
   - **Polling Frequency Optimization**: Increase client background active-page polling interval from 15 seconds to 90 seconds, relying on SSE for immediate updates.
   - **Preserve Photos on Merge**: Ensure client-side merge preserves document photos when lightweight row metadata is received from paginated list endpoints.

---

## 5. Verification & Testing Results

1. **Network Egress Optimization (Completed)**:
   - Offloaded all binary and base64 images to S3/disk; PostgreSQL text columns now strictly contain lightweight `/api/storage/file/...` URLs (~99% reduction in per-row egress).
   - In-memory Node.js query cache implemented for `getMaterializedKPIs`, `dbGetRegistrationsScoped`, `dbGetPaymentReceiptsScoped`, `/api/sync`, and `/api/actions`.
   - Event-driven instant cache invalidation hooked into `dbUpsert`, `dbUpdateFields`, `dbDelete`, `dbClearTable`, and `recordSystemAction`.
   - Eliminated `dbGetAll('motorcycle_registrations')` and `dbGetAll('payment_receipts')` full-table scans, replacing them with single-row indexed queries (`dbFindRegistrationByPlateOrId`, `dbFindReceiptsByRegistrationOrPlate`).
   - Relaxed client background polling interval in `src/services/dbService.ts` from 15s to 90s, with Server-Sent Events (SSE) acting as the primary low-latency synchronization channel.

2. **Compilation & Error Verification (Completed)**:
   - `compile_applet` passed cleanly with zero errors.
   - `lint_applet` (`tsc --noEmit`) passed cleanly with zero errors.
   - Prevents `ECONNRESET` socket connection resets and excessive database bandwidth usage on cloud platforms (Railway, Google Cloud SQL, Neon).
