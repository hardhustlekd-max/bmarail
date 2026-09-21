# Bahir Dar Motorcycle Permit & Authority System (bmarail)
## Complete Railway PostgreSQL & S3-Compatible Storage Architecture

This repository contains the complete full-stack codebase migrated from Firebase to **Railway PostgreSQL** and **Railway Storage / S3-compatible Object Storage** with custom **JWT & bcrypt Authentication**.

---

## 🚀 Key Architecture Highlights

| Component | Previous Architecture | New Architecture (bmarail) |
|---|---|---|
| **Database** | Firebase Firestore NoSQL | **PostgreSQL 15+** on Railway (`pg` Connection Pooling) |
| **Authentication** | Firebase Client Auth | **JWT (JSON Web Tokens) + bcryptjs** Password Hashing |
| **File Storage** | Firebase Storage | **Railway S3-Compatible Storage Bucket** + Local Express Fallback |
| **Backend API** | Serverless / Express Firestore Bridge | **Express TypeScript REST API** with connection pooling |
| **Data Integrity** | Client-side rule validation | **Relational Constraints, Foreign Keys & ACID Transactions** |
| **Local Dev** | Emulator / Cloud Project | **Self-healing In-Memory & Local Database auto-sync** |

---

## 📦 Database Schema (`database/schema.sql`)

The database contains relational schemas matching the authority's operations:

1. `system_users`: Admin, SuperAdmin, Officer, and Clerk accounts with bcrypt hashes.
2. `motorcycle_registrations`: Vehicle registrations, Ethiopian calendar dates, permit statuses, QR codes, and photo links.
3. `officer_assignments`: Field deployment records, sub-city kelass, shifts, and contact details.
4. `print_batch_orders`: PVC ID Card production batches and status tracking.
5. `verification_logs`: Real-time QR scan logs, traffic enforcement checkpoints, and inspection notes.
6. `unregistered_vehicle_reports`: Impounded / unpermitted motorcycle citations and evidence photos.
7. `payment_receipts`: Commercial Bank of Ethiopia / Telebirr transaction receipts and validity tracking.
8. `system_settings`: Global agency configurations, printer presets, and sub-city permissions.
9. `system_audit_logs`: Immutable security audit logs.
10. `file_uploads`: Uploaded photo and document metadata.

---

## ⚙️ Environment Configuration

Set the following environment variables in your Railway project or `.env` file:

```env
# Application Port (Railway sets this automatically)
PORT=3000
NODE_ENV=production

# Database Connection (Railway PostgreSQL Plugin provides this automatically)
DATABASE_URL=postgresql://postgres:password@roundhouse.proxy.rlwy.net:5432/railway

# JWT Authentication Secret
JWT_SECRET=bma-permit-railway-jwt-secret-key-2026-prod

# Railway S3-Compatible Storage Bucket (Optional - falls back to local disk if omitted)
STORAGE_ENDPOINT=https://storage.railway.app
STORAGE_BUCKET=bmarail-permit-documents
STORAGE_ACCESS_KEY=your_railway_access_key
STORAGE_SECRET_KEY=your_railway_secret_key
STORAGE_REGION=auto
STORAGE_PUBLIC_DOMAIN=
```

---

## 🛠️ Deploying to Railway

### Step 1: Create Project & Provision PostgreSQL
1. Go to [Railway.app](https://railway.app).
2. Click **New Project** -> **Provision PostgreSQL**.
3. Railway automatically creates `DATABASE_URL`.

### Step 2: Deploy Codebase
1. Connect your GitHub repository (`bmarail`).
2. Set the build command:
   ```bash
   npm run build
   ```
3. Set the start command:
   ```bash
   npm run start
   ```
4. **Automated Schema Updates**:
   - `railway.toml` contains `watchPatterns = ["database/**", "src/**", ...]` which automatically triggers a redeploy on Railway whenever `database/schema.sql` or server code is updated in your GitHub repository.
   - On server startup, the auto-migrator automatically compares `database/schema.sql` with live PostgreSQL tables and issues `ALTER TABLE ... ADD COLUMN IF NOT EXISTS ...` for any new columns pushed to GitHub.
   - The memory whitelist (`TABLE_COLUMNS`) automatically refreshes from `information_schema.columns` to accept new schema columns without manual configuration.
   - You can also run manual migrations using `npm run db:migrate`.

---

## 🔄 Migrating Existing Firestore Data

To import existing Firestore data into Railway PostgreSQL:

```bash
# 1. Export your Firestore collections to a JSON file named firestore-export.json
# 2. Run the migration script
node scripts/migrate-firestore.js firestore-export.json
```

---

## 👥 Default System User Accounts

| Role | Badge ID | Email | Default Password |
|---|---|---|---|
| **Clerk** | `CLERK-001` | `clerk@permit.gov.et` | `ClerkPassword123!` |
| **Officer** | `OFFICER-8842` | `officer@permit.gov.et` | `OfficerPassword123!` |
| **Admin** | `ADMIN-PRO-1` | `admin@permit.gov.et` | `AdminPassword123!` |
| **Super Admin** | `SUPER-ADMIN-01` | `superadmin@permit.gov.et` | `SuperAdminPassword123!` |
