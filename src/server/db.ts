import pg from 'pg';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ override: true });

const { Pool } = pg;

export let dbPool: pg.Pool | null = null;
let isPostgresConnected = false;
let isReconnecting = false;
let hasLoggedConnectionFailure = false;

// Pre-seeded In-memory resilient store for when PostgreSQL is connecting or offline
const memoryStore: Record<string, Map<string, any>> = {
  system_users: new Map(),
  motorcycle_registrations: new Map(),
  officer_assignments: new Map(),
  print_batch_orders: new Map(),
  verification_logs: new Map(),
  unregistered_vehicle_reports: new Map(),
  payment_receipts: new Map(),
  system_settings: new Map(),
  system_audit_logs: new Map(),
  notification_states: new Map(),
  file_uploads: new Map(),
};

// Seed default in-memory data
function seedInitialMemoryStore() {
  if (memoryStore.system_settings.size === 0) {
    memoryStore.system_settings.set('global_config', {
      id: 'global_config',
      officerName: 'አበበ ደስታ (Abebe Desta)',
      department: 'የትራፊክ ማኔጅመንትና ህግ ማስከበሪያ (Traffic Mgmt & Enforcement)',
      subCityOffice: 'በላይ ዘለቀ ክፍለ ከተማ (Belay Zeleke)',
      defaultPrinter: 'Zebra ZD621 Industrial PVC Card Printer',
      cardStockType: 'CR80 Standard PVC Card (85.6 x 54 mm)',
      calendarSystem: 'ethiopian',
      autoPrintQr: true,
      emailAlerts: true,
      security2fa: true,
      highRiskAlerts: true,
      themeMode: 'light',
      registrationFreeze: false,
      maintenanceMode: false,
      scannerResultTheme: 'warm_ivory_cream',
      showClerkPermitStatus: false,
      showClerkSubmissionsAction: false,
      showClerkApprovedVehiclesAction: false,
      showClerkNewRegistrationAction: true,
      showClerkEditSubmissionAction: true,
      showClerkQrScanAction: true,
      showClerkPaymentReceiptsAction: true,
      showClerkPaymentKPIs: false,
      showClerkPaymentRecordsTable: false,
      clerkPaymentKpiPermission: 'allow',
      clerkPaymentTablePermission: 'allow',
      frozenSubCities: {},
      systemResetEpoch: 0,
      lastSystemResetAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  if (memoryStore.officer_assignments.size === 0) {
    const officers = [
      { id: 'officer-1', officerName: 'አበበ ደስታ (Abebe Desta)', badgeId: 'OFFICER-442', subCity: 'በላይ ዘለቀ (Belay Zeleke)', locationName: 'ቀበሌ 04 መገንጠያ', shift: 'morning', status: 'active', assignedLocation: 'ቀበሌ 04 ኬላ', phone: '0918123456', shiftHours: '08:00 - 16:00', assignedDate: '2026-09-01' },
      { id: 'officer-2', officerName: 'ሰለሞን ግርማ (Solomon Girma)', badgeId: 'OFFICER-8842', subCity: 'ፋሲሎ (Fasilo)', locationName: 'ጊዮርጊስ አደባባይ', shift: 'afternoon', status: 'active', assignedLocation: 'ዋናው አደባባይ ኬላ', phone: '0918654321', shiftHours: '16:00 - 00:00', assignedDate: '2026-09-01' },
      { id: 'officer-3', officerName: 'ዳዊት ታደሰ (Dawit Tadesse)', badgeId: 'OFFICER-102', subCity: 'ጣና (Tana)', locationName: 'ዓባይ ማዶ መውጫ', shift: 'morning', status: 'active', assignedLocation: 'ድልድይ መነሻ', phone: '0911987654', shiftHours: '08:00 - 16:00', assignedDate: '2026-09-01' },
    ];
    officers.forEach((off) => memoryStore.officer_assignments.set(off.id, off));
  }
}

seedInitialMemoryStore();

/**
 * Check if error is a transient network/connection error
 */
function isNetworkError(err: any): boolean {
  if (!err) return false;
  const msg = (err.message || '').toLowerCase();
  const code = (err.code || '').toLowerCase();
  return (
    code === 'eai_again' ||
    code === 'enotfound' ||
    code === 'econnrefused' ||
    code === 'etimedout' ||
    code === '57p01' ||
    msg.includes('getaddrinfo') ||
    msg.includes('connect econnrefused') ||
    msg.includes('timeout') ||
    msg.includes('connection terminated')
  );
}

/**
 * Get or create PostgreSQL pool
 */
export function getDbPool(): pg.Pool | null {
  if (dbPool) return dbPool;

  const databaseUrl = process.env.DATABASE_URL || process.env.PG_DATABASE_URL || process.env.POSTGRES_URL;
  if (!databaseUrl) {
    return null;
  }

  try {
    dbPool = new Pool({
      connectionString: databaseUrl,
      ssl: databaseUrl.includes('localhost') || databaseUrl.includes('127.0.0.1') ? false : { rejectUnauthorized: false },
      max: 15,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 3000,
    });

    dbPool.on('error', (err) => {
      if (isNetworkError(err)) {
        if (isPostgresConnected) {
          console.warn('[PostgreSQL Pool] Connection lost:', err.message);
          isPostgresConnected = false;
          scheduleBackgroundReconnect();
        }
      } else {
        console.error('[PostgreSQL Pool] Unexpected error:', err);
      }
    });

    return dbPool;
  } catch (err) {
    dbPool = null;
    return null;
  }
}

/**
 * Schedule non-blocking background reconnection
 */
function scheduleBackgroundReconnect() {
  if (isReconnecting) return;
  isReconnecting = true;

  setTimeout(async () => {
    isReconnecting = false;
    const pool = getDbPool();
    if (!pool) return;

    try {
      const client = await pool.connect();
      try {
        await client.query('SELECT 1');
        isPostgresConnected = true;
        hasLoggedConnectionFailure = false;
        console.log('[PostgreSQL] Reconnected successfully.');
        await runSchemaMigrations(client);
      } finally {
        client.release();
      }
    } catch (err: any) {
      if (!hasLoggedConnectionFailure) {
        console.log('[PostgreSQL] Database not reachable yet, continuing with in-memory store.');
        hasLoggedConnectionFailure = true;
      }
      scheduleBackgroundReconnect();
    }
  }, 20000);
}

/**
 * Helper to parse CREATE TABLE definitions from schema SQL
 */
function parseCreateTableColumns(schemaSql: string): Map<string, Array<{ name: string; definition: string }>> {
  const tableMap = new Map<string, Array<{ name: string; definition: string }>>();
  const createTableRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z0-9_]+)\s*\(([\s\S]*?)\);/gi;
  let match;

  while ((match = createTableRegex.exec(schemaSql)) !== null) {
    const tableName = match[1].toLowerCase().trim();
    const body = match[2];
    const columns: Array<{ name: string; definition: string }> = [];

    const lines = body.split('\n');
    for (const rawLine of lines) {
      const line = rawLine.trim().replace(/,$/, '');
      if (!line || line.startsWith('--')) continue;

      const upper = line.toUpperCase();
      if (
        upper.startsWith('PRIMARY KEY') ||
        upper.startsWith('FOREIGN KEY') ||
        upper.startsWith('CONSTRAINT') ||
        upper.startsWith('UNIQUE') ||
        upper.startsWith('CHECK')
      ) {
        continue;
      }

      const parts = line.split(/\s+/);
      const colName = parts[0]?.replace(/"/g, '').toLowerCase().trim();
      const colDef = parts.slice(1).join(' ');

      if (colName && !colName.includes('(') && colDef) {
        columns.push({ name: colName, definition: colDef });
      }
    }

    if (columns.length > 0) {
      tableMap.set(tableName, columns);
    }
  }

  return tableMap;
}

/**
 * Execute schema and migrations on an active client
 */
async function runSchemaMigrations(client: pg.PoolClient) {
  try {
    // 1. Fetch currently existing table columns from PostgreSQL information_schema
    const existingColsRes = await client.query(`
      SELECT table_name, column_name 
      FROM information_schema.columns 
      WHERE table_schema = 'public'
    `);
    const existingCols = new Set<string>();
    for (const r of existingColsRes.rows) {
      existingCols.add(`${r.table_name.toLowerCase()}.${r.column_name.toLowerCase()}`);
    }

    // 2. Execute schema.sql definition file
    const schemaPath = path.join(process.cwd(), 'database', 'schema.sql');
    if (fs.existsSync(schemaPath)) {
      const schemaSql = fs.readFileSync(schemaPath, 'utf8');
      await client.query(schemaSql);

      // 3. Auto-reconcile any newly added columns from schema.sql onto existing tables
      const parsedTables = parseCreateTableColumns(schemaSql);
      let autoAddedCount = 0;
      for (const [tableName, cols] of parsedTables.entries()) {
        for (const col of cols) {
          const key = `${tableName}.${col.name}`;
          if (!existingCols.has(key)) {
            try {
              console.log(`[PostgreSQL Auto-Migrator] Auto-adding missing column "${col.name}" to table "${tableName}"...`);
              await client.query(`ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS ${col.name} ${col.definition}`);
              autoAddedCount++;
            } catch (alterErr: any) {
              console.warn(`[PostgreSQL Auto-Migrator] Note for ${key}:`, alterErr.message);
            }
          }
        }
      }
      if (autoAddedCount > 0) {
        console.log(`[PostgreSQL Auto-Migrator] Auto-reconciled ${autoAddedCount} newly detected column(s) from GitHub schema.`);
      }
    }

    // 4. Execute seed.sql
    const seedPath = path.join(process.cwd(), 'database', 'seed.sql');
    if (fs.existsSync(seedPath)) {
      const seedSql = fs.readFileSync(seedPath, 'utf8');
      await client.query(seedSql);
    }

    try {
      await client.query(`
        ALTER TABLE system_settings ALTER COLUMN scanner_result_theme SET DEFAULT 'warm_ivory_cream';
        UPDATE system_settings 
        SET scanner_result_theme = 'warm_ivory_cream' 
        WHERE scanner_result_theme IS NULL OR scanner_result_theme = '' OR scanner_result_theme = 'deep_cobalt_navy';
      `);
    } catch {}

    // 5. Dynamically refresh memory whitelist of table columns from information_schema
    const updatedColsRes = await client.query(`
      SELECT table_name, column_name 
      FROM information_schema.columns 
      WHERE table_schema = 'public'
    `);
    for (const r of updatedColsRes.rows) {
      const tName = r.table_name;
      const cName = r.column_name;
      if (!TABLE_COLUMNS[tName]) {
        TABLE_COLUMNS[tName] = new Set();
      }
      TABLE_COLUMNS[tName].add(cName);
    }

    console.log('[PostgreSQL] Database schema and seed data verified & synchronized successfully.');
  } catch (err: any) {
    console.warn('[PostgreSQL] Notice during schema verification:', err.message);
  }
}

/**
 * Startup initialization of database schema
 */
export async function initializeDatabaseSchema(): Promise<void> {
  const pool = getDbPool();
  if (!pool) {
    console.log('[PostgreSQL] Running with resilient in-memory data store for local environment.');
    return;
  }

  try {
    const client = await pool.connect();
    try {
      await client.query('SELECT 1');
      isPostgresConnected = true;
      hasLoggedConnectionFailure = false;
      console.log('[PostgreSQL] Connected to PostgreSQL database.');
      await runSchemaMigrations(client);
    } finally {
      client.release();
    }
  } catch (err: any) {
    isPostgresConnected = false;
    if (!hasLoggedConnectionFailure) {
      console.log(`[PostgreSQL] Direct connection unavailable (${err.message}). Using resilient in-memory store.`);
      hasLoggedConnectionFailure = true;
    }
    scheduleBackgroundReconnect();
  }
}

/**
 * Ensure default system users exist (in-memory or postgres)
 */
export async function ensureDefaultUsers(): Promise<void> {
  // Pre-seed in memory
  const defaultUsers = [
    {
      id: 'user-clerk-CLERK-001',
      uid: 'user-clerk-CLERK-001',
      badgeId: 'CLERK-001',
      email: 'clerk@permit.gov.et',
      role: 'clerk',
      fullName: 'Abebe Bekele (Clerk)',
      subCity: 'Belay Zeleke',
      status: 'active',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'user-officer-OFFICER-8842',
      uid: 'user-officer-OFFICER-8842',
      badgeId: 'OFFICER-8842',
      email: 'officer@permit.gov.et',
      role: 'officer',
      fullName: 'Officer Solomon Desta',
      subCity: 'Fasilo',
      status: 'active',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'user-admin-ADMIN-PRO-1',
      uid: 'user-admin-ADMIN-PRO-1',
      badgeId: 'ADMIN-PRO-1',
      email: 'admin@permit.gov.et',
      role: 'admin',
      fullName: 'Tigist Alemu (System Admin)',
      subCity: 'Dagmawi Minilik',
      status: 'active',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'user-superadmin-SUPER-ADMIN-01',
      uid: 'user-superadmin-SUPER-ADMIN-01',
      badgeId: 'SUPER-ADMIN-01',
      email: 'superadmin@permit.gov.et',
      role: 'superadmin',
      fullName: 'Kaleb Tadesse (Chief Super Admin)',
      subCity: 'Central Command',
      status: 'active',
      createdAt: new Date().toISOString(),
    },
  ];

  for (const u of defaultUsers) {
    if (!memoryStore.system_users.has(u.id)) {
      memoryStore.system_users.set(u.id, u);
    }
  }

  if (isPostgresConnected && dbPool) {
    try {
      const seedPath = path.join(process.cwd(), 'database', 'seed.sql');
      if (fs.existsSync(seedPath)) {
        const seedSql = fs.readFileSync(seedPath, 'utf8');
        await dbPool.query(seedSql);
      }
    } catch {}
  }
}

/**
 * Generic query executor
 */
export async function dbQuery<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  if (isPostgresConnected && dbPool) {
    try {
      const res = await dbPool.query(sql, params);
      return res.rows as T[];
    } catch (err: any) {
      if (isNetworkError(err)) {
        isPostgresConnected = false;
        scheduleBackgroundReconnect();
      }
      throw err;
    }
  }
  return [];
}

/**
 * Fetch all documents from a table
 */
export async function dbGetAll<T = any>(tableName: string): Promise<T[]> {
  if (isPostgresConnected && dbPool) {
    try {
      const sql = `SELECT * FROM ${tableName} ORDER BY created_at DESC`;
      const res = await dbPool.query(sql);
      return res.rows.map(normalizeRowFromPg) as T[];
    } catch (err: any) {
      if (err.code === '42703') { // No created_at column
        try {
          const fallbackRes = await dbPool.query(`SELECT * FROM ${tableName}`);
          return fallbackRes.rows.map(normalizeRowFromPg) as T[];
        } catch {}
      }
      if (isNetworkError(err)) {
        isPostgresConnected = false;
        scheduleBackgroundReconnect();
      }
    }
  }
  return Array.from(memoryStore[tableName]?.values() || []) as T[];
}

/**
 * Fetch a single document by ID
 */
export async function dbGetById<T = any>(tableName: string, id: string): Promise<T | null> {
  if (isPostgresConnected && dbPool) {
    try {
      const res = await dbPool.query(`SELECT * FROM ${tableName} WHERE id = $1 LIMIT 1`, [id]);
      if (res.rows.length > 0) {
        return normalizeRowFromPg(res.rows[0]) as T;
      }
      return null;
    } catch (err: any) {
      if (isNetworkError(err)) {
        isPostgresConnected = false;
        scheduleBackgroundReconnect();
      }
    }
  }
  return memoryStore[tableName]?.get(id) || null;
}

export interface DbMutationResult {
  success: boolean;
  target: 'postgresql' | 'in-memory';
  error?: string;
  rowCount?: number;
}

/**
 * Upsert a document by ID
 */
export async function dbUpsert(tableName: string, id: string, data: Record<string, any>): Promise<DbMutationResult> {
  if (!memoryStore[tableName]) {
    memoryStore[tableName] = new Map();
  }
  const existing = memoryStore[tableName].get(id) || {};
  memoryStore[tableName].set(id, { ...existing, ...data, id });

  if (!isPostgresConnected || !dbPool) {
    return { success: true, target: 'in-memory' };
  }

  try {
    const pgData = normalizeRowToPg(tableName, { ...data, id });
    const keys = Object.keys(pgData);
    if (keys.length === 0) {
      return { success: true, target: 'postgresql', rowCount: 0 };
    }

    const values = Object.values(pgData);
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
    const updateClauses = keys
      .filter((k) => k !== 'id')
      .map((k) => `${k} = EXCLUDED.${k}`)
      .join(', ');

    const sql = `
      INSERT INTO ${tableName} (${keys.join(', ')})
      VALUES (${placeholders})
      ON CONFLICT (id) 
      DO UPDATE SET ${updateClauses || 'updated_at = CURRENT_TIMESTAMP'}
    `;

    const res = await dbPool.query(sql, values);
    return { success: true, target: 'postgresql', rowCount: res.rowCount ?? 1 };
  } catch (err: any) {
    if (isNetworkError(err)) {
      isPostgresConnected = false;
      scheduleBackgroundReconnect();
      return { success: true, target: 'in-memory', error: `PostgreSQL connection dropped: ${err.message}` };
    } else {
      console.error(`[PostgreSQL] dbUpsert error on ${tableName}:`, err.message);
      return { success: false, target: 'postgresql', error: err.message };
    }
  }
}

/**
 * Update partial document fields
 */
export async function dbUpdateFields(tableName: string, id: string, updates: Record<string, any>): Promise<DbMutationResult> {
  if (!memoryStore[tableName]) {
    memoryStore[tableName] = new Map();
  }
  const current = memoryStore[tableName].get(id) || {};
  const merged = { ...current, ...updates, id };
  memoryStore[tableName].set(id, merged);

  if (!isPostgresConnected || !dbPool) {
    return { success: true, target: 'in-memory' };
  }

  try {
    const pgUpdates = normalizeRowToPg(tableName, updates);
    const keys = Object.keys(pgUpdates).filter((k) => k !== 'id');
    if (keys.length === 0) {
      return await dbUpsert(tableName, id, merged);
    }

    const setClauses = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
    const values = [id, ...keys.map((k) => pgUpdates[k])];

    const sql = `UPDATE ${tableName} SET ${setClauses}, updated_at = CURRENT_TIMESTAMP WHERE id = $1`;
    const res = await dbPool.query(sql, values);
    if (res.rowCount === 0) {
      return await dbUpsert(tableName, id, merged);
    }
    return { success: true, target: 'postgresql', rowCount: res.rowCount ?? 1 };
  } catch (err: any) {
    if (isNetworkError(err)) {
      isPostgresConnected = false;
      scheduleBackgroundReconnect();
      return { success: true, target: 'in-memory', error: `PostgreSQL connection dropped: ${err.message}` };
    } else {
      console.error(`[PostgreSQL] dbUpdateFields error on ${tableName}:`, err.message);
      try {
        const fallback = await dbUpsert(tableName, id, merged);
        return fallback;
      } catch (upsertErr: any) {
        return { success: false, target: 'postgresql', error: err.message };
      }
    }
  }
}

/**
 * Delete a document by ID
 */
export async function dbDelete(tableName: string, id: string): Promise<void> {
  if (memoryStore[tableName]) {
    memoryStore[tableName].delete(id);
  }

  if (!isPostgresConnected || !dbPool) return;

  try {
    await dbPool.query(`DELETE FROM ${tableName} WHERE id = $1`, [id]);
  } catch (err: any) {
    if (isNetworkError(err)) {
      isPostgresConnected = false;
      scheduleBackgroundReconnect();
    }
  }
}

/**
 * Clear all records in a table
 */
export async function dbClearTable(tableName: string): Promise<void> {
  if (memoryStore[tableName]) {
    memoryStore[tableName].clear();
  }

  if (!isPostgresConnected || !dbPool) return;

  try {
    await dbPool.query(`TRUNCATE TABLE ${tableName} CASCADE`);
  } catch (err: any) {
    if (isNetworkError(err)) {
      isPostgresConnected = false;
      scheduleBackgroundReconnect();
    }
  }
}

export function isDatabaseConnected(): boolean {
  return isPostgresConnected;
}

// Whitelist of columns per table in PostgreSQL schema
const TABLE_COLUMNS: Record<string, Set<string>> = {
  system_settings: new Set([
    'id',
    'officer_name',
    'department',
    'sub_city_office',
    'default_printer',
    'card_stock_type',
    'calendar_system',
    'auto_print_qr',
    'email_alerts',
    'security_2fa',
    'high_risk_alerts',
    'theme_mode',
    'registration_freeze',
    'maintenance_mode',
    'scanner_result_theme',
    'show_clerk_permit_status',
    'show_clerk_submissions_action',
    'show_clerk_approved_vehicles_action',
    'show_clerk_new_registration_action',
    'show_clerk_edit_submission_action',
    'show_clerk_qr_scan_action',
    'show_clerk_payment_receipts_action',
    'show_clerk_payment_kpis',
    'show_clerk_payment_records_table',
    'clerk_payment_kpi_permission',
    'clerk_payment_table_permission',
    'frozen_sub_cities',
    'system_reset_epoch',
    'last_system_reset_at',
    'updated_at',
  ]),
  system_users: new Set([
    'id',
    'uid',
    'badge_id',
    'email',
    'password_hash',
    'role',
    'full_name',
    'sub_city',
    'status',
    'created_at',
    'updated_at',
    'last_login_at',
  ]),
  motorcycle_registrations: new Set([
    'id',
    'full_name',
    'phone',
    'user_portrait_photo',
    'user_portrait_thumbnail',
    'owner_photo',
    'national_id_photo',
    'national_id_back_photo',
    'driving_license_photo',
    'driving_permit_photo',
    'vehicle_category',
    'service_category',
    'motor_brand',
    'motor_model',
    'chassis_number',
    'engine_or_serial_no',
    'engine_number',
    'plate_number',
    'registration_date',
    'status',
    'qr_code_data',
    'registered_by',
    'rejection_reason',
    'sub_city',
    'blood_group',
    'hide_from_other_users',
    'receipt_number',
    'payment_amount',
    'receipt_screenshot',
    'created_at',
    'updated_at',
  ]),
  officer_assignments: new Set([
    'id',
    'officer_name',
    'badge_id',
    'sub_city',
    'location_name',
    'shift',
    'status',
    'assigned_location',
    'assigned_zone',
    'assigned_subcity',
    'phone',
    'shift_hours',
    'assigned_date',
    'created_at',
    'updated_at',
  ]),
  print_batch_orders: new Set([
    'id',
    'batch_id',
    'requested_by',
    'requested_date',
    'status',
    'registration_ids',
    'notes',
    'created_at',
    'updated_at',
  ]),
  verification_logs: new Set([
    'id',
    'plate_number',
    'scanned_at',
    'officer_badge_id',
    'officer_name',
    'location',
    'status',
    'notes',
    'full_name',
    'phone',
    'sub_city',
    'user_portrait_photo',
    'national_id_photo',
    'national_id_back_photo',
    'driving_license_photo',
    'driving_permit_photo',
    'vehicle_category',
    'service_category',
    'motor_brand',
    'motor_model',
    'chassis_number',
    'engine_or_serial_no',
    'created_at',
  ]),
  unregistered_vehicle_reports: new Set([
    'id',
    'plate_or_engine_no',
    'location',
    'officer_badge_id',
    'officer_name',
    'reported_at',
    'notes',
    'evidence_photo',
    'status',
    'action_taken',
    'sub_city',
    'created_at',
  ]),
  payment_receipts: new Set([
    'id',
    'receipt_number',
    'owner_registration_id',
    'owner_name',
    'plate_number',
    'phone',
    'payment_date',
    'expiration_date',
    'amount',
    'payment_method',
    'bank_reference',
    'receipt_screenshot',
    'sub_city',
    'notes',
    'entered_by',
    'status',
    'created_at',
  ]),
  system_audit_logs: new Set([
    'id',
    'timestamp',
    'actor_badge_id',
    'actor_role',
    'action',
    'details',
    'ip_address',
    'severity',
  ]),
  notification_states: new Set([
    'id',
    'user_scope_id',
    'read_ids',
    'cleared_ids',
    'last_read_at',
    'updated_at',
  ]),
};

const SPECIAL_CAMEL_TO_SNAKE: Record<string, string> = {
  autoPrintQR: 'auto_print_qr',
  autoPrintQr: 'auto_print_qr',
  security2FA: 'security_2fa',
  security2fa: 'security_2fa',
  showClerkPaymentKPIs: 'show_clerk_payment_kpis',
  showClerkPaymentKpis: 'show_clerk_payment_kpis',
  showClerkPermitStatus: 'show_clerk_permit_status',
  showClerkSubmissionsAction: 'show_clerk_submissions_action',
  showClerkApprovedVehiclesAction: 'show_clerk_approved_vehicles_action',
  showClerkNewRegistrationAction: 'show_clerk_new_registration_action',
  showClerkEditSubmissionAction: 'show_clerk_edit_submission_action',
  showClerkQrScanAction: 'show_clerk_qr_scan_action',
  showClerkPaymentReceiptsAction: 'show_clerk_payment_receipts_action',
  showClerkPaymentRecordsTable: 'show_clerk_payment_records_table',
  clerkPaymentKPIPermission: 'clerk_payment_kpi_permission',
  clerkPaymentKpiPermission: 'clerk_payment_kpi_permission',
  clerkPaymentTablePermission: 'clerk_payment_table_permission',
  chassisNumber: 'chassis_number',
  engineOrSerialNo: 'engine_or_serial_no',
  plateOrEngineNo: 'plate_or_engine_no',
  officerBadgeId: 'officer_badge_id',
  ownerRegistrationId: 'owner_registration_id',
  receiptScreenshot: 'receipt_screenshot',
  hideFromOtherUsers: 'hide_from_other_users',
  systemResetEpoch: 'system_reset_epoch',
  lastSystemResetAt: 'last_system_reset_at',
  userScopeId: 'user_scope_id',
  readIds: 'read_ids',
  clearedIds: 'cleared_ids',
  lastReadAt: 'last_read_at',
};

const SPECIAL_SNAKE_TO_CAMEL: Record<string, string> = {
  auto_print_qr: 'autoPrintQR',
  security_2fa: 'security2FA',
  show_clerk_payment_kpis: 'showClerkPaymentKPIs',
  show_clerk_permit_status: 'showClerkPermitStatus',
  show_clerk_submissions_action: 'showClerkSubmissionsAction',
  show_clerk_approved_vehicles_action: 'showClerkApprovedVehiclesAction',
  show_clerk_new_registration_action: 'showClerkNewRegistrationAction',
  show_clerk_edit_submission_action: 'showClerkEditSubmissionAction',
  show_clerk_qr_scan_action: 'showClerkQrScanAction',
  show_clerk_payment_receipts_action: 'showClerkPaymentReceiptsAction',
  show_clerk_payment_records_table: 'showClerkPaymentRecordsTable',
  clerk_payment_kpi_permission: 'clerkPaymentKPIPermission',
  clerk_payment_table_permission: 'clerkPaymentTablePermission',
  chassis_number: 'chassisNumber',
  engine_or_serial_no: 'engineOrSerialNo',
  plate_or_engine_no: 'plateOrEngineNo',
  officer_badge_id: 'officerBadgeId',
  owner_registration_id: 'ownerRegistrationId',
  receipt_screenshot: 'receiptScreenshot',
  hide_from_other_users: 'hideFromOtherUsers',
  system_reset_epoch: 'systemResetEpoch',
  last_system_reset_at: 'lastSystemResetAt',
  user_scope_id: 'userScopeId',
  read_ids: 'readIds',
  cleared_ids: 'clearedIds',
  last_read_at: 'lastReadAt',
};

// Convert camelCase object to snake_case DB columns and vice versa
function camelToSnake(str: string): string {
  if (SPECIAL_CAMEL_TO_SNAKE[str]) {
    return SPECIAL_CAMEL_TO_SNAKE[str];
  }
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

function snakeToCamel(str: string): string {
  if (SPECIAL_SNAKE_TO_CAMEL[str]) {
    return SPECIAL_SNAKE_TO_CAMEL[str];
  }
  return str.replace(/_([a-z0-9])/g, (_, letter) => letter.toUpperCase());
}

function normalizeRowToPg(tableName: string, data: Record<string, any>): Record<string, any> {
  const validCols = TABLE_COLUMNS[tableName];
  const result: Record<string, any> = {};

  for (const [k, v] of Object.entries(data)) {
    if (v === undefined) continue;
    const colName = camelToSnake(k);

    // If table has a known whitelist, only include existing columns
    if (validCols && !validCols.has(colName)) {
      continue;
    }

    if (typeof v === 'object' && v !== null && !Array.isArray(v) && !(v instanceof Date)) {
      result[colName] = JSON.stringify(v);
    } else if (Array.isArray(v)) {
      result[colName] = JSON.stringify(v);
    } else {
      result[colName] = v;
    }
  }
  return result;
}

function normalizeRowFromPg(row: Record<string, any>): Record<string, any> {
  if (!row) return row;
  const result: Record<string, any> = {};
  for (const [k, v] of Object.entries(row)) {
    const camelKey = snakeToCamel(k);
    if (typeof v === 'string' && (v.startsWith('{') || v.startsWith('['))) {
      try {
        result[camelKey] = JSON.parse(v);
        continue;
      } catch (e) {}
    }
    result[camelKey] = v;
  }
  return result;
}
