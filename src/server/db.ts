import pg from 'pg';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import {
  toEthiopianDate,
  ETHIOPIAN_MONTHS,
  normalizeToEthiopianDateStr,
  getDefaultEthiopianRegistrationDate,
  EthiopianDate,
} from '../utils/ethiopianCalendar';
import { calculateOneMonthExpiration, getPaymentReceiptStatus } from '../utils/paymentUtils';

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
  actions: new Map(),
  kpi_metrics: new Map(),
  materialized_notifications: new Map(),
};

// Initialize default system settings & blank metric summaries (zero auto-seeded entities)
function initDefaultSystemConfig() {
  if (memoryStore.kpi_metrics.size === 0) {
    memoryStore.kpi_metrics.set('system_summary', {
      id: 'system_summary',
      totalUsers: 4,
      adminUsers: 2,
      disabledUsers: 0,
      activeUsers: 4,
      totalPermits: 0,
      pendingPermits: 0,
      approvedPermits: 0,
      printedPermits: 0,
      rejectedPermits: 0,
      todaySubmissions: 0,
      totalRevenue: 0,
      totalReceipts: 0,
      currency: 'ETB',
      totalVerifications: 0,
      verifiedLogs: 0,
      warningVerifications: 0,
      illegalVerifications: 0,
      totalUnregistered: 0,
      pendingUnregistered: 0,
      resolvedUnregistered: 0,
      activeOfficers: 0,
      lastActionId: 'init',
      updatedAt: new Date().toISOString(),
    });
  }
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
      rolePermissions: {},
      roleDefinitions: [],
      updatedAt: new Date().toISOString(),
    });
  }
}

initDefaultSystemConfig();

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
    code === 'econnreset' ||
    code === 'econnaborted' ||
    code === '57p01' ||
    msg.includes('getaddrinfo') ||
    msg.includes('connect econnrefused') ||
    msg.includes('timeout') ||
    msg.includes('econnreset') ||
    msg.includes('connection terminated')
  );
}

// ============================================================================
// SERVER-SIDE IN-MEMORY QUERY CACHE (INSTANT WRITE-INVALIDATION)
// Slashes PostgreSQL read network egress to near 0 KB for repeated requests.
// ============================================================================
interface CacheEntry<T = any> {
  data: T;
  timestamp: number;
  tags: string[];
}

const memoryQueryCache = new Map<string, CacheEntry>();

export function getCachedQuery<T = any>(key: string): T | null {
  const entry = memoryQueryCache.get(key);
  if (!entry) return null;
  // Maximum safeguard TTL of 5 minutes even if no writes occur
  if (Date.now() - entry.timestamp > 300000) {
    memoryQueryCache.delete(key);
    return null;
  }
  return entry.data;
}

export function setCachedQuery<T = any>(key: string, data: T, tags: string[] = []): void {
  if (memoryQueryCache.size > 1000) {
    const oldestKey = memoryQueryCache.keys().next().value;
    if (oldestKey) memoryQueryCache.delete(oldestKey);
  }
  memoryQueryCache.set(key, {
    data,
    timestamp: Date.now(),
    tags,
  });
}

export function invalidateCacheByTag(tag: string): void {
  for (const [key, entry] of memoryQueryCache.entries()) {
    if (entry.tags.includes(tag) || tag === 'all') {
      memoryQueryCache.delete(key);
    }
  }
}

export function invalidateCacheForTable(tableName: string): void {
  switch (tableName) {
    case 'motorcycle_registrations':
      invalidateCacheByTag('registrations');
      invalidateCacheByTag('kpis');
      invalidateCacheByTag('sync');
      break;
    case 'payment_receipts':
      invalidateCacheByTag('payment_receipts');
      invalidateCacheByTag('registrations');
      invalidateCacheByTag('kpis');
      invalidateCacheByTag('sync');
      break;
    case 'verification_logs':
      invalidateCacheByTag('verification_logs');
      invalidateCacheByTag('kpis');
      invalidateCacheByTag('sync');
      break;
    case 'system_settings':
      invalidateCacheByTag('settings');
      invalidateCacheByTag('sync');
      break;
    case 'system_users':
      invalidateCacheByTag('users');
      invalidateCacheByTag('kpis');
      break;
    case 'officer_assignments':
      invalidateCacheByTag('officers');
      invalidateCacheByTag('kpis');
      invalidateCacheByTag('sync');
      break;
    case 'print_batch_orders':
      invalidateCacheByTag('print_orders');
      invalidateCacheByTag('sync');
      break;
    case 'unregistered_vehicle_reports':
      invalidateCacheByTag('unregistered');
      invalidateCacheByTag('kpis');
      invalidateCacheByTag('sync');
      break;
    case 'actions':
      invalidateCacheByTag('actions');
      invalidateCacheByTag('kpis');
      break;
    default:
      invalidateCacheByTag(tableName);
      break;
  }
}

/**
 * Get or create PostgreSQL pool
 */
export function getDbPool(): pg.Pool | null {
  if (dbPool) return dbPool;

  const databaseUrl = process.env.DATABASE_URL || process.env.PG_DATABASE_URL || process.env.POSTGRES_URL;
  const hasPgHost = Boolean(process.env.PGHOST && process.env.PGUSER);
  if (!databaseUrl && !hasPgHost) {
    return null;
  }

  try {
    let poolConfig: pg.PoolConfig;

    if (process.env.PGHOST && process.env.PGUSER && process.env.PGPASSWORD) {
      poolConfig = {
        host: process.env.PGHOST,
        port: Number(process.env.PGPORT || 5432),
        user: process.env.PGUSER,
        password: process.env.PGPASSWORD,
        database: process.env.PGDATABASE || 'railway',
        ssl: { rejectUnauthorized: false },
        max: 15,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
      };
    } else {
      const sanitizedUrl = databaseUrl!.includes('postgres.railway.internal') && process.env.PGHOST
        ? databaseUrl!.replace('postgres.railway.internal', process.env.PGHOST)
        : databaseUrl!;

      poolConfig = {
        connectionString: sanitizedUrl,
        ssl: sanitizedUrl.includes('localhost') || sanitizedUrl.includes('127.0.0.1') ? false : { rejectUnauthorized: false },
        max: 5, // Serverless / Railway free tier safe connection cap
        idleTimeoutMillis: 10000, // Rapidly reclaim idle PostgreSQL connections
        connectionTimeoutMillis: 5000,
        allowExitOnIdle: true,
      };
    }

    dbPool = new Pool(poolConfig);

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
    // 1. Execute schema.sql definition file as a single script
    const schemaPath = path.join(process.cwd(), 'database', 'schema.sql');
    if (fs.existsSync(schemaPath)) {
      const schemaSql = fs.readFileSync(schemaPath, 'utf8');
      try {
        await client.query(schemaSql);
      } catch (schemaErr: any) {
        console.warn('[PostgreSQL] Notice during schema execution:', schemaErr.message);
      }
    }

    // 2. Resilient explicit ALTER TABLE queries for existing databases
    const safeAlterQueries = [
      `ALTER TABLE motorcycle_registrations ADD COLUMN IF NOT EXISTS receipt_number VARCHAR(100)`,
      `ALTER TABLE motorcycle_registrations ADD COLUMN IF NOT EXISTS payment_amount VARCHAR(50)`,
      `ALTER TABLE motorcycle_registrations ADD COLUMN IF NOT EXISTS receipt_screenshot TEXT`,
      `ALTER TABLE motorcycle_registrations ADD COLUMN IF NOT EXISTS hide_from_other_users BOOLEAN DEFAULT FALSE`,
      `ALTER TABLE motorcycle_registrations ADD COLUMN IF NOT EXISTS last_rejection_reason TEXT`,
      `ALTER TABLE motorcycle_registrations ADD COLUMN IF NOT EXISTS is_correction BOOLEAN DEFAULT FALSE`,
      `ALTER TABLE motorcycle_registrations ADD COLUMN IF NOT EXISTS email VARCHAR(255)`,
      `ALTER TABLE motorcycle_registrations ADD COLUMN IF NOT EXISTS term_status VARCHAR(50) DEFAULT 'CURRENT'`,
      `ALTER TABLE motorcycle_registrations ADD COLUMN IF NOT EXISTS active_term_expiration_date VARCHAR(50)`,
      `ALTER TABLE motorcycle_registrations ADD COLUMN IF NOT EXISTS last_payment_date VARCHAR(50)`,
      `ALTER TABLE motorcycle_registrations ADD COLUMN IF NOT EXISTS last_receipt_number VARCHAR(100)`,
      `ALTER TABLE motorcycle_registrations ADD COLUMN IF NOT EXISTS last_payment_amount VARCHAR(50)`,

      `ALTER TABLE notification_states ADD COLUMN IF NOT EXISTS id VARCHAR(128)`,
      `ALTER TABLE notification_states ADD COLUMN IF NOT EXISTS user_scope_id VARCHAR(128)`,
      `ALTER TABLE notification_states ADD COLUMN IF NOT EXISTS read_ids JSONB DEFAULT '[]'::jsonb`,
      `ALTER TABLE notification_states ADD COLUMN IF NOT EXISTS cleared_ids JSONB DEFAULT '[]'::jsonb`,
      `ALTER TABLE notification_states ADD COLUMN IF NOT EXISTS last_read_at VARCHAR(50)`,
      `UPDATE notification_states SET id = user_scope_id WHERE id IS NULL OR id = ''`,

      `ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS scanner_result_theme VARCHAR(100) DEFAULT 'warm_ivory_cream'`,
      `ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS system_logo_url VARCHAR(255) DEFAULT '/logo.jpg'`,
      `ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS show_clerk_permit_status BOOLEAN DEFAULT FALSE`,
      `ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS show_clerk_submissions_action BOOLEAN DEFAULT FALSE`,
      `ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS show_clerk_approved_vehicles_action BOOLEAN DEFAULT FALSE`,
      `ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS show_clerk_new_registration_action BOOLEAN DEFAULT TRUE`,
      `ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS show_clerk_edit_submission_action BOOLEAN DEFAULT TRUE`,
      `ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS show_clerk_qr_scan_action BOOLEAN DEFAULT TRUE`,
      `ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS show_clerk_payment_receipts_action BOOLEAN DEFAULT TRUE`,
      `ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS show_clerk_payment_kpis BOOLEAN DEFAULT FALSE`,
      `ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS show_clerk_payment_records_table BOOLEAN DEFAULT FALSE`,
      `ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS clerk_payment_kpi_permission VARCHAR(50) DEFAULT 'allow'`,
      `ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS clerk_payment_table_permission VARCHAR(50) DEFAULT 'allow'`,
      `ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS frozen_sub_cities JSONB DEFAULT '{}'::jsonb`,
      `ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS system_reset_epoch BIGINT`,
      `ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS last_system_reset_at VARCHAR(50)`,
      `ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS role_permissions JSONB DEFAULT '{}'::jsonb`,
      `ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS role_definitions JSONB DEFAULT '[]'::jsonb`,

      `ALTER TABLE system_users ADD COLUMN IF NOT EXISTS phone VARCHAR(50)`,

      `ALTER TABLE payment_receipts ADD COLUMN IF NOT EXISTS verified_by_cheki BOOLEAN DEFAULT FALSE`,
      `ALTER TABLE payment_receipts ADD COLUMN IF NOT EXISTS cheki_bank VARCHAR(100)`,
      `ALTER TABLE payment_receipts ADD COLUMN IF NOT EXISTS entered_at VARCHAR(50)`,
    ];

    for (const q of safeAlterQueries) {
      try {
        await client.query(q);
      } catch (alterErr: any) {
        // Non-fatal notice
      }
    }

    try {
      await client.query(`
        ALTER TABLE system_settings ALTER COLUMN scanner_result_theme SET DEFAULT 'warm_ivory_cream';
        UPDATE system_settings 
        SET scanner_result_theme = 'warm_ivory_cream' 
        WHERE scanner_result_theme IS NULL OR scanner_result_theme = '' OR scanner_result_theme = 'deep_cobalt_navy';
      `);
    } catch {}

    console.log('[PostgreSQL] Database schema verified & synchronized successfully.');
  } catch (err: any) {
    console.warn('[PostgreSQL] Notice during schema verification:', err.message);
  } finally {
    // 4. Dynamically refresh memory whitelist of table columns from information_schema
    try {
      const updatedColsRes = await client.query(`
        SELECT table_name, column_name 
        FROM information_schema.columns 
        WHERE table_schema = 'public'
      `);
      const liveTableCols: Record<string, Set<string>> = {};
      for (const r of updatedColsRes.rows) {
        const tName = r.table_name.toLowerCase();
        const cName = r.column_name.toLowerCase();
        if (!liveTableCols[tName]) {
          liveTableCols[tName] = new Set();
        }
        liveTableCols[tName].add(cName);
      }
      for (const [tName, colSet] of Object.entries(liveTableCols)) {
        TABLE_COLUMNS[tName] = colSet;
      }
      console.log('[PostgreSQL] Refreshed live column whitelists from information_schema.');
    } catch (refreshErr: any) {
      console.warn('[PostgreSQL] Warning refreshing column metadata:', refreshErr.message);
    }
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
      phone: '0918123456',
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
      phone: '0918654321',
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
      phone: '0911223344',
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
      phone: '0911000001',
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

export interface UserQueryScope {
  role?: string;
  badgeId?: string;
  subCity?: string;
  isSuperAdmin?: boolean;
  isAdmin?: boolean;
  isClerk?: boolean;
  isOfficer?: boolean;
}

export interface ScopedQueryResult<T> {
  rows: T[];
  totalCount: number;
  pagination?: {
    currentPage: number;
    pageSize: number;
    totalPages: number;
    totalCount: number;
  };
}

/**
 * Fetch registrations with server-side role scoping, searching, and pagination
 */
export async function dbGetRegistrationsScoped(options: {
  scope?: UserQueryScope;
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
}): Promise<ScopedQueryResult<any>> {
  const { scope, page, limit, search, status } = options;
  const isPaginationRequested = Boolean(page || limit);
  const currentPage = Math.max(1, page || 1);
  const pageSize = Math.max(1, limit || (isPaginationRequested ? 25 : 5000));
  const offset = (currentPage - 1) * pageSize;

  const scopeKey = `${scope?.role || 'all'}_${scope?.badgeId || 'all'}_${scope?.subCity || 'all'}`;
  const cacheKey = `regs:${scopeKey}:p${currentPage}:l${pageSize}:s${status || 'all'}:q${search || ''}`;
  const cached = getCachedQuery<ScopedQueryResult<any>>(cacheKey);
  if (cached) {
    return cached;
  }

  if (isPostgresConnected && dbPool) {
    try {
      const whereClauses: string[] = [];
      const queryParams: any[] = [];

      // 1. Role-based scoping at SQL level
      const isSuper = scope?.isSuperAdmin || scope?.role === 'superadmin' || (scope?.role as string) === 'super_admin';
      if (!isSuper) {
        whereClauses.push('(hide_from_other_users IS NULL OR hide_from_other_users = false)');
      }

      if (scope?.isClerk && scope.badgeId) {
        if (scope.subCity) {
          queryParams.push(scope.badgeId, scope.subCity);
          whereClauses.push(`(registered_by = $${queryParams.length - 1} OR sub_city = $${queryParams.length})`);
        } else {
          queryParams.push(scope.badgeId);
          whereClauses.push(`registered_by = $${queryParams.length}`);
        }
      } else if (scope?.isOfficer && scope.badgeId) {
        queryParams.push(scope.badgeId);
        whereClauses.push(`assigned_officer = $${queryParams.length}`);
      }

      // 2. Status filter
      if (status && status !== 'all') {
        queryParams.push(status);
        whereClauses.push(`status = $${queryParams.length}`);
      }

      // 3. Search filter
      if (search && search.trim()) {
        queryParams.push(`%${search.trim().toLowerCase()}%`);
        const pIdx = queryParams.length;
        whereClauses.push(`(LOWER(plate_number) LIKE $${pIdx} OR LOWER(full_name) LIKE $${pIdx} OR phone_number LIKE $${pIdx})`);
      }

      const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

      // Count query
      const countRes = await dbPool.query(`SELECT COUNT(*) AS count FROM motorcycle_registrations ${whereSql}`, queryParams);
      const totalCount = parseInt(countRes.rows[0]?.count || '0', 10);

      // Data query with pagination / limit
      const dataParams = [...queryParams];
      let limitSql = '';
      if (isPaginationRequested) {
        dataParams.push(pageSize, offset);
        limitSql = `LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`;
      }

      const sql = `SELECT * FROM motorcycle_registrations ${whereSql} ORDER BY created_at DESC ${limitSql}`;
      const dataRes = await dbPool.query(sql, dataParams);
      const rows = dataRes.rows.map(normalizeRowFromPg);

      const result: ScopedQueryResult<any> = {
        rows,
        totalCount,
        pagination: isPaginationRequested
          ? {
              currentPage,
              pageSize,
              totalPages: Math.ceil(totalCount / pageSize) || 1,
              totalCount,
            }
          : undefined,
      };

      setCachedQuery(cacheKey, result, ['registrations']);
      return result;
    } catch (err: any) {
      console.warn('[PostgreSQL] Scoped registrations query warning:', err.message);
      if (isNetworkError(err)) {
        isPostgresConnected = false;
        scheduleBackgroundReconnect();
      }
    }
  }

  // Fallback in-memory
  let all = Array.from(memoryStore['motorcycle_registrations']?.values() || []);
  const isSuperMem = scope?.isSuperAdmin || scope?.role === 'superadmin' || (scope?.role as string) === 'super_admin';
  if (!isSuperMem) {
    all = all.filter((r: any) => !r.hideFromOtherUsers && !r.hide_from_other_users);
  }

  if (scope?.isClerk && scope.badgeId) {
    all = all.filter((r: any) =>
      r.registeredBy === scope.badgeId ||
      r.registered_by === scope.badgeId ||
      (scope.subCity && (r.subCity === scope.subCity || r.sub_city === scope.subCity))
    );
  } else if (scope?.isOfficer && scope.badgeId) {
    all = all.filter((r: any) => r.assignedOfficer === scope.badgeId || r.assigned_officer === scope.badgeId);
  }

  if (status && status !== 'all') {
    all = all.filter((r: any) => r.status === status);
  }

  if (search && search.trim()) {
    const term = search.trim().toLowerCase();
    all = all.filter((r: any) =>
      String(r.plateNumber || '').toLowerCase().includes(term) ||
      String(r.fullName || '').toLowerCase().includes(term) ||
      String(r.phoneNumber || '').includes(term)
    );
  }

  const totalCount = all.length;
  let rows = all;
  if (isPaginationRequested) {
    rows = all.slice(offset, offset + pageSize);
  }

  return {
    rows,
    totalCount,
    pagination: isPaginationRequested
      ? {
          currentPage,
          pageSize,
          totalPages: Math.ceil(totalCount / pageSize) || 1,
          totalCount,
        }
      : undefined,
  };
}

/**
 * Single vehicle lookup by Plate or QR
 */
export async function dbFindRegistrationByPlateOrQr(plate?: string, qr?: string): Promise<any | null> {
  const cleanPlate = (plate || '').replace(/[\s\-_]/g, '').toLowerCase().trim();
  let cleanQr = (qr || '').trim();
  let candidateId = cleanQr;
  if (cleanQr.includes('/verify/')) {
    const parts = cleanQr.split('/verify/');
    if (parts[1]) candidateId = parts[1].split('?')[0].trim();
  }

  if (isPostgresConnected && dbPool) {
    try {
      if (cleanPlate) {
        const res = await dbPool.query(
          `SELECT * FROM motorcycle_registrations WHERE LOWER(REPLACE(REPLACE(plate_number, ' ', ''), '-', '')) = $1 LIMIT 1`,
          [cleanPlate]
        );
        if (res.rows.length > 0) return normalizeRowFromPg(res.rows[0]);
      }
      if (cleanQr) {
        const res = await dbPool.query(
          `SELECT * FROM motorcycle_registrations WHERE qr_code_data = $1 OR id = $1 OR id = $2 LIMIT 1`,
          [cleanQr, candidateId]
        );
        if (res.rows.length > 0) return normalizeRowFromPg(res.rows[0]);
      }
    } catch (err: any) {
      console.warn('[PostgreSQL] Plate lookup warning:', err.message);
    }
  }

  const all = Array.from(memoryStore['motorcycle_registrations']?.values() || []);
  if (cleanPlate) {
    const found = all.find((r: any) => {
      const p = String(r.plateNumber || r.plate_number || '').replace(/[\s\-_]/g, '').toLowerCase();
      return p === cleanPlate;
    });
    if (found) return found;
  }
  if (cleanQr) {
    const found = all.find((r: any) => {
      const q = r.qrCodeData || r.qr_code_data;
      const id = r.id;
      return q === cleanQr || id === cleanQr || id === candidateId;
    });
    if (found) return found;
  }
  return null;
}

/**
 * Fast single-row indexed lookup by plate number or ID (zero full-table scanning)
 */
export async function dbFindRegistrationByPlateOrId(plateOrId: string): Promise<any | null> {
  if (!plateOrId) return null;
  const clean = plateOrId.trim();
  const cleanNoSpaces = clean.replace(/[\s\-_]/g, '').toLowerCase();

  const cacheKey = `reg_lookup:${cleanNoSpaces}`;
  const cached = getCachedQuery(cacheKey);
  if (cached) return cached;

  if (isPostgresConnected && dbPool) {
    try {
      const res = await dbPool.query(
        `SELECT id, plate_number, full_name, phone, vehicle_category, sub_city, status,
                term_status, active_term_expiration_date, last_payment_date, last_receipt_number,
                last_payment_amount, hide_from_other_users, created_at, updated_at
         FROM motorcycle_registrations 
         WHERE LOWER(id) = $1 
            OR LOWER(REPLACE(REPLACE(REPLACE(plate_number, ' ', ''), '-', ''), '_', '')) = $2 
         LIMIT 1`,
        [clean.toLowerCase(), cleanNoSpaces]
      );
      if (res.rows.length > 0) {
        const item = normalizeRowFromPg(res.rows[0]);
        setCachedQuery(cacheKey, item, ['registrations']);
        return item;
      }
    } catch (e: any) {
      if (isNetworkError(e)) {
        isPostgresConnected = false;
        scheduleBackgroundReconnect();
      }
    }
  }

  const all = Array.from(memoryStore['motorcycle_registrations']?.values() || []);
  const matched = all.find((r: any) =>
    (r.id && r.id.toLowerCase() === clean.toLowerCase()) ||
    (r.plateNumber && r.plateNumber.replace(/[\s\-_]/g, '').toLowerCase() === cleanNoSpaces) ||
    (r.plate_number && r.plate_number.replace(/[\s\-_]/g, '').toLowerCase() === cleanNoSpaces)
  ) || null;

  if (matched) {
    setCachedQuery(cacheKey, matched, ['registrations']);
  }
  return matched;
}

/**
 * Targeted lookup for receipts belonging to a registration or plate (avoids full-table scan)
 */
export async function dbFindReceiptsByRegistrationOrPlate(regId?: string, plate?: string, excludeReceiptId?: string): Promise<any[]> {
  const cleanReg = (regId || '').toLowerCase().trim();
  const cleanPlate = (plate || '').replace(/[\s\-_]/g, '').toLowerCase().trim();

  if (isPostgresConnected && dbPool) {
    try {
      const res = await dbPool.query(
        `SELECT * FROM payment_receipts 
         WHERE ($1 = '' OR id != $1) 
           AND (
             ($2 != '' AND LOWER(owner_registration_id) = $2) OR
             ($3 != '' AND LOWER(REPLACE(REPLACE(REPLACE(plate_number, ' ', ''), '-', ''), '_', '')) = $3)
           )
         ORDER BY created_at DESC`,
        [excludeReceiptId || '', cleanReg, cleanPlate]
      );
      return res.rows.map(normalizeRowFromPg);
    } catch (err: any) {
      if (isNetworkError(err)) {
        isPostgresConnected = false;
        scheduleBackgroundReconnect();
      }
    }
  }

  const all = Array.from(memoryStore['payment_receipts']?.values() || []);
  return all.filter((r: any) => {
    if (excludeReceiptId && r.id === excludeReceiptId) return false;
    const rReg = String(r.ownerRegistrationId || r.owner_registration_id || '').toLowerCase();
    const rPlate = String(r.plateNumber || r.plate_number || '').replace(/[\s\-_]/g, '').toLowerCase();
    return (cleanReg && rReg === cleanReg) || (cleanPlate && rPlate === cleanPlate);
  });
}

/**
 * Fetch payment receipts with server-side role scoping
 */
export async function dbGetPaymentReceiptsScoped(options: {
  scope?: UserQueryScope;
  page?: number;
  limit?: number;
}): Promise<ScopedQueryResult<any>> {
  const { scope, page, limit } = options;
  const isPaginationRequested = Boolean(page || limit);
  const currentPage = Math.max(1, page || 1);
  const pageSize = Math.max(1, limit || (isPaginationRequested ? 25 : 5000));
  const offset = (currentPage - 1) * pageSize;

  const cacheKey = `receipts_scoped:${scope?.role || 'all'}:${scope?.badgeId || 'all'}:${isPaginationRequested ? `${currentPage}:${pageSize}` : 'all'}`;
  const cached = getCachedQuery<ScopedQueryResult<any>>(cacheKey);
  if (cached) return cached;

  if (isPostgresConnected && dbPool) {
    try {
      const whereClauses: string[] = [];
      const queryParams: any[] = [];

      const isSuper = scope?.isSuperAdmin || scope?.role === 'superadmin' || (scope?.role as string) === 'super_admin';
      if (!isSuper) {
        whereClauses.push(`NOT EXISTS (
          SELECT 1 FROM motorcycle_registrations mr
          WHERE (mr.id = payment_receipts.owner_registration_id OR mr.plate_number = payment_receipts.plate_number)
            AND mr.hide_from_other_users = TRUE
        )`);
      }

      if (scope?.isClerk && scope.badgeId) {
        queryParams.push(scope.badgeId);
        whereClauses.push(`entered_by = $${queryParams.length}`);
      }

      const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
      const countRes = await dbPool.query(`SELECT COUNT(*) AS count FROM payment_receipts ${whereSql}`, queryParams);
      const totalCount = parseInt(countRes.rows[0]?.count || '0', 10);

      const dataParams = [...queryParams];
      let limitSql = '';
      if (isPaginationRequested) {
        dataParams.push(pageSize, offset);
        limitSql = `LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`;
      }

      const sql = `SELECT * FROM payment_receipts ${whereSql} ORDER BY created_at DESC ${limitSql}`;
      const dataRes = await dbPool.query(sql, dataParams);
      const rows = dataRes.rows.map(normalizeRowFromPg);

      const result: ScopedQueryResult<any> = {
        rows,
        totalCount,
        pagination: isPaginationRequested
          ? {
              currentPage,
              pageSize,
              totalPages: Math.ceil(totalCount / pageSize) || 1,
              totalCount,
            }
          : undefined,
      };

      setCachedQuery(cacheKey, result, ['payment_receipts']);
      return result;
    } catch (err: any) {
      console.warn('[PostgreSQL] Scoped receipts query warning:', err.message);
    }
  }

  let all = Array.from(memoryStore['payment_receipts']?.values() || []);
  const isSuperReceiptsMem = scope?.isSuperAdmin || scope?.role === 'superadmin' || (scope?.role as string) === 'super_admin';
  if (!isSuperReceiptsMem) {
    const hiddenRegIds = new Set<string>();
    const hiddenPlates = new Set<string>();
    for (const reg of (memoryStore['motorcycle_registrations']?.values() || [])) {
      if (reg.hideFromOtherUsers || reg.hide_from_other_users) {
        if (reg.id) hiddenRegIds.add(String(reg.id).toLowerCase());
        if (reg.plateNumber) hiddenPlates.add(String(reg.plateNumber).toLowerCase().replace(/[\s\-_]/g, ''));
      }
    }
    all = all.filter((r: any) => {
      const regId = String(r.ownerRegistrationId || r.owner_registration_id || '').toLowerCase();
      const plate = String(r.plateNumber || r.plate_number || '').toLowerCase().replace(/[\s\-_]/g, '');
      if (regId && hiddenRegIds.has(regId)) return false;
      if (plate && hiddenPlates.has(plate)) return false;
      return true;
    });
  }

  if (scope?.isClerk && scope.badgeId) {
    all = all.filter(
      (r: any) =>
        r.enteredBy === scope.badgeId ||
        r.entered_by === scope.badgeId ||
        r.registeredBy === scope.badgeId ||
        r.cashierBadgeId === scope.badgeId
    );
  }
  const totalCount = all.length;
  let rows = all;
  if (isPaginationRequested) {
    rows = all.slice(offset, offset + pageSize);
  }
  return {
    rows,
    totalCount,
    pagination: isPaginationRequested
      ? {
          currentPage,
          pageSize,
          totalPages: Math.ceil(totalCount / pageSize) || 1,
          totalCount,
        }
      : undefined,
  };
}

/**
 * Fetch verification logs with server-side role scoping
 */
export async function dbGetVerificationLogsScoped(options: {
  scope?: UserQueryScope;
  page?: number;
  limit?: number;
}): Promise<ScopedQueryResult<any>> {
  const { scope, page, limit } = options;
  const isPaginationRequested = Boolean(page || limit);
  const currentPage = Math.max(1, page || 1);
  const pageSize = Math.max(1, limit || (isPaginationRequested ? 25 : 5000));
  const offset = (currentPage - 1) * pageSize;

  if (isPostgresConnected && dbPool) {
    try {
      const whereClauses: string[] = [];
      const queryParams: any[] = [];

      if (scope?.isOfficer && scope.badgeId) {
        queryParams.push(scope.badgeId);
        whereClauses.push(`officer_badge_id = $${queryParams.length}`);
      }

      const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
      const countRes = await dbPool.query(`SELECT COUNT(*) AS count FROM verification_logs ${whereSql}`, queryParams);
      const totalCount = parseInt(countRes.rows[0]?.count || '0', 10);

      const dataParams = [...queryParams];
      let limitSql = '';
      if (isPaginationRequested) {
        dataParams.push(pageSize, offset);
        limitSql = `LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`;
      }

      const sql = `SELECT * FROM verification_logs ${whereSql} ORDER BY created_at DESC ${limitSql}`;
      const dataRes = await dbPool.query(sql, dataParams);
      const rows = dataRes.rows.map(normalizeRowFromPg);

      return {
        rows,
        totalCount,
        pagination: isPaginationRequested
          ? {
              currentPage,
              pageSize,
              totalPages: Math.ceil(totalCount / pageSize) || 1,
              totalCount,
            }
          : undefined,
      };
    } catch (err: any) {
      console.warn('[PostgreSQL] Scoped verifications query warning:', err.message);
    }
  }

  let all = Array.from(memoryStore['verification_logs']?.values() || []);
  if (scope?.isOfficer && scope.badgeId) {
    all = all.filter((l: any) => l.officerBadgeId === scope.badgeId);
  }
  const totalCount = all.length;
  let rows = all;
  if (isPaginationRequested) {
    rows = all.slice(offset, offset + pageSize);
  }
  return {
    rows,
    totalCount,
    pagination: isPaginationRequested
      ? {
          currentPage,
          pageSize,
          totalPages: Math.ceil(totalCount / pageSize) || 1,
          totalCount,
        }
      : undefined,
  };
}

export interface DbMutationResult {
  success: boolean;
  target: 'postgresql' | 'in-memory';
  error?: string;
  rowCount?: number;
  conflict?: boolean;
  serverRecord?: any;
  serverVersion?: number;
}

/**
 * Upsert a document by ID with Optimistic Concurrency Control (OCC)
 */
export async function dbUpsert(tableName: string, id: string, data: Record<string, any>): Promise<DbMutationResult> {
  if (!memoryStore[tableName]) {
    memoryStore[tableName] = new Map();
  }
  const existing = memoryStore[tableName].get(id) || (await dbGetById(tableName, id)) || {};
  const dataAny = data as any;
  const clientVersion = dataAny.expectedVersion !== undefined ? Number(dataAny.expectedVersion) : (dataAny.clientVersion !== undefined ? Number(dataAny.clientVersion) : undefined);
  const currentVersion = Number(existing.version || 1);

  if (clientVersion !== undefined && clientVersion < currentVersion) {
    return {
      success: false,
      conflict: true,
      error: `Concurrency Conflict: Record was modified by another user (Server version ${currentVersion}, your version ${clientVersion}).`,
      serverRecord: existing,
      serverVersion: currentVersion,
      target: isPostgresConnected ? 'postgresql' : 'in-memory',
    };
  }

  const newVersion = currentVersion + 1;
  const dataWithVersion = { ...data, version: newVersion };
  delete (dataWithVersion as any).expectedVersion;
  delete (dataWithVersion as any).clientVersion;

  const merged = { ...existing, ...dataWithVersion, id };
  memoryStore[tableName].set(id, merged);

  if (!isPostgresConnected || !dbPool) {
    invalidateCacheForTable(tableName);
    return { success: true, target: 'in-memory' };
  }

  try {
    const pgData = normalizeRowToPg(tableName, { ...merged, version: newVersion });
    const keys = Object.keys(pgData);
    if (keys.length === 0) {
      invalidateCacheForTable(tableName);
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
    invalidateCacheForTable(tableName);
    return { success: true, target: 'postgresql', rowCount: res.rowCount ?? 1 };
  } catch (err: any) {
    if (isNetworkError(err)) {
      isPostgresConnected = false;
      scheduleBackgroundReconnect();
      invalidateCacheForTable(tableName);
      return { success: true, target: 'in-memory', error: `PostgreSQL connection dropped: ${err.message}` };
    } else {
      console.error(`[PostgreSQL] dbUpsert error on ${tableName}:`, err.message);
      return { success: false, target: 'postgresql', error: err.message };
    }
  }
}

/**
 * Update partial document fields with Optimistic Concurrency Control (OCC)
 */
export async function dbUpdateFields(tableName: string, id: string, updates: Record<string, any>): Promise<DbMutationResult> {
  if (!memoryStore[tableName]) {
    memoryStore[tableName] = new Map();
  }
  const current = memoryStore[tableName].get(id) || (await dbGetById(tableName, id)) || {};
  const updatesAny = updates as any;
  const clientVersion = updatesAny.expectedVersion !== undefined ? Number(updatesAny.expectedVersion) : (updatesAny.clientVersion !== undefined ? Number(updatesAny.clientVersion) : undefined);
  const currentVersion = Number(current.version || 1);

  if (clientVersion !== undefined && clientVersion < currentVersion) {
    return {
      success: false,
      conflict: true,
      error: `Concurrency Conflict: Record was modified by another user (Server version ${currentVersion}, your version ${clientVersion}).`,
      serverRecord: current,
      serverVersion: currentVersion,
      target: isPostgresConnected ? 'postgresql' : 'in-memory',
    };
  }

  const newVersion = currentVersion + 1;
  const cleanUpdates = { ...updates, version: newVersion };
  delete (cleanUpdates as any).expectedVersion;
  delete (cleanUpdates as any).clientVersion;

  const merged = { ...current, ...cleanUpdates, id };
  memoryStore[tableName].set(id, merged);

  if (!isPostgresConnected || !dbPool) {
    invalidateCacheForTable(tableName);
    return { success: true, target: 'in-memory' };
  }

  try {
    const pgUpdates = normalizeRowToPg(tableName, cleanUpdates);
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
    invalidateCacheForTable(tableName);
    return { success: true, target: 'postgresql', rowCount: res.rowCount ?? 1 };
  } catch (err: any) {
    if (isNetworkError(err)) {
      isPostgresConnected = false;
      scheduleBackgroundReconnect();
      invalidateCacheForTable(tableName);
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
  invalidateCacheForTable(tableName);

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
  invalidateCacheForTable(tableName);

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

/**
  * HYBRID EVENT-DRIVEN KPI & NOTIFICATION ARCHITECTURE:
  * When an action is recorded, insert into the `actions` table.
  * In PostgreSQL, the database trigger `trg_actions_insert` automatically updates `kpi_metrics`
  * and `materialized_notifications` behind the scenes!
  * In-memory fallback maintains identical write-side state.
  */
export async function recordSystemAction(action: {
  actionType: string;
  entityType: string;
  entityId: string;
  actorId?: string;
  actorBadgeId?: string;
  actorRole?: string;
  payload?: Record<string, any>;
}): Promise<void> {
  const actionId = `act-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  const actionRecord = {
    id: actionId,
    actionType: action.actionType,
    entityType: action.entityType,
    entityId: action.entityId,
    actorId: action.actorId || null,
    actorBadgeId: action.actorBadgeId || null,
    actorRole: action.actorRole || null,
    payload: action.payload || {},
    createdAt: new Date().toISOString(),
  };

  // 1. Maintain in-memory resilient store with write-side aggregation
  if (!memoryStore.actions) memoryStore.actions = new Map();
  memoryStore.actions.set(actionId, actionRecord);
  applyActionToInMemoryKPIs(actionRecord);

  // 2. PostgreSQL insert (Database Trigger automatically updates kpi_metrics & materialized_notifications)
  if (isPostgresConnected && dbPool) {
    try {
      await dbPool.query(
        `INSERT INTO actions (id, action_type, entity_type, entity_id, actor_id, actor_badge_id, actor_role, payload)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          actionRecord.id,
          actionRecord.actionType,
          actionRecord.entityType,
          actionRecord.entityId,
          actionRecord.actorId,
          actionRecord.actorBadgeId,
          actionRecord.actorRole,
          JSON.stringify(actionRecord.payload),
        ]
      );
    } catch (err: any) {
      if (isNetworkError(err)) {
        isPostgresConnected = false;
        scheduleBackgroundReconnect();
      } else {
        console.warn('[PostgreSQL Actions Trigger] Notice inserting action:', err.message);
      }
    }
  }

  // Instant cache invalidation for KPI, sync, and action streams
  invalidateCacheByTag('kpis');
  invalidateCacheByTag('actions');
  invalidateCacheByTag('sync');
}

/**
 * Update in-memory KPI table and notifications behind the scenes
 */
function applyActionToInMemoryKPIs(action: any) {
  if (!memoryStore.kpi_metrics) memoryStore.kpi_metrics = new Map();
  let kpis = memoryStore.kpi_metrics.get('system_summary');
  if (!kpis) {
    kpis = {
      id: 'system_summary',
      totalUsers: 4,
      adminUsers: 2,
      disabledUsers: 0,
      activeUsers: 4,
      totalPermits: 10,
      pendingPermits: 0,
      approvedPermits: 10,
      printedPermits: 0,
      rejectedPermits: 0,
      todaySubmissions: 0,
      totalRevenue: 5000,
      totalReceipts: 10,
      currency: 'ETB',
      totalVerifications: 0,
      verifiedLogs: 0,
      warningVerifications: 0,
      illegalVerifications: 0,
      totalUnregistered: 0,
      pendingUnregistered: 0,
      resolvedUnregistered: 0,
      activeOfficers: 3,
      lastActionId: '',
      updatedAt: new Date().toISOString(),
    };
  }

  const p = action.payload || {};
  const prevStatus = p.previousStatus || p.previous_status;
  const newStatus = p.newStatus || p.new_status;
  const amount = Number(p.amount) || 0;
  const verifStatus = p.verificationStatus || p.verification_status;
  const role = p.role;
  const status = p.status;

  if (action.actionType === 'REGISTRATION_CREATED') {
    kpis.totalPermits++;
    kpis.pendingPermits++;
    kpis.todaySubmissions++;
    if (!memoryStore.materialized_notifications) memoryStore.materialized_notifications = new Map();
    memoryStore.materialized_notifications.set(`notif-reg-${action.entityId}`, {
      id: `notif-reg-${action.entityId}`,
      type: 'pending_approval',
      titleAm: `አዲስ ማመልከቻ: ${p.fullName || action.entityId}`,
      titleEn: `New Submission: ${p.fullName || action.entityId}`,
      descriptionAm: 'ማመልከቻው የስራ አስኪያጅ ውሳኔ በመጠባበቅ ላይ ይገኛል።',
      descriptionEn: 'Application awaiting manager review.',
      actionPage: 'tables',
      actionTab: 'pending',
      entityId: action.entityId,
      icon: 'how_to_reg',
      iconBg: 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200',
      badgeLabelAm: 'ማፅደቂያ',
      badgeLabelEn: 'Approval Needed',
      badgeBg: 'bg-slate-200 dark:bg-slate-700',
      badgeText: 'text-slate-800 dark:text-slate-200',
      targetRole: 'admin',
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  } else if (action.actionType === 'REGISTRATION_STATUS_CHANGED') {
    if (prevStatus === 'pending_approval') kpis.pendingPermits = Math.max(0, kpis.pendingPermits - 1);
    if (['approved', 'ordered_print', 'printed'].includes(prevStatus)) kpis.approvedPermits = Math.max(0, kpis.approvedPermits - 1);
    if (prevStatus === 'printed') kpis.printedPermits = Math.max(0, kpis.printedPermits - 1);
    if (prevStatus === 'rejected') kpis.rejectedPermits = Math.max(0, kpis.rejectedPermits - 1);

    if (newStatus === 'pending_approval') kpis.pendingPermits++;
    if (['approved', 'ordered_print', 'printed'].includes(newStatus)) kpis.approvedPermits++;
    if (newStatus === 'printed') kpis.printedPermits++;
    if (newStatus === 'rejected') kpis.rejectedPermits++;

    if (['approved', 'rejected', 'printed', 'ordered_print'].includes(newStatus)) {
      const notif = memoryStore.materialized_notifications?.get(`notif-reg-${action.entityId}`);
      if (notif) notif.isActive = false;
    }
  } else if (action.actionType === 'REGISTRATION_DELETED') {
    kpis.totalPermits = Math.max(0, kpis.totalPermits - 1);
    if (prevStatus === 'pending_approval') kpis.pendingPermits = Math.max(0, kpis.pendingPermits - 1);
    if (['approved', 'ordered_print', 'printed'].includes(prevStatus)) kpis.approvedPermits = Math.max(0, kpis.approvedPermits - 1);
    if (prevStatus === 'rejected') kpis.rejectedPermits = Math.max(0, kpis.rejectedPermits - 1);
    const notif = memoryStore.materialized_notifications?.get(`notif-reg-${action.entityId}`);
    if (notif) notif.isActive = false;
  } else if (action.actionType === 'PAYMENT_RECEIVED') {
    kpis.totalReceipts++;
    kpis.totalRevenue += amount;
  } else if (action.actionType === 'PAYMENT_DELETED') {
    kpis.totalReceipts = Math.max(0, kpis.totalReceipts - 1);
    kpis.totalRevenue = Math.max(0, kpis.totalRevenue - amount);
  } else if (action.actionType === 'VERIFICATION_LOGGED') {
    kpis.totalVerifications++;
    if (verifStatus === 'verified') kpis.verifiedLogs++;
    if (verifStatus === 'warning') kpis.warningVerifications++;
    if (['flagged', 'illegal', 'unregistered'].includes(verifStatus)) {
      kpis.illegalVerifications++;
      if (!memoryStore.materialized_notifications) memoryStore.materialized_notifications = new Map();
      memoryStore.materialized_notifications.set(`notif-verif-${action.entityId}`, {
        id: `notif-verif-${action.entityId}`,
        type: 'flagged_inspection',
        titleAm: `የፍተሻ ጥሰት ሪፖርት: ${p.plateNumber || action.entityId}`,
        titleEn: `Inspection Violation: ${p.plateNumber || action.entityId}`,
        descriptionAm: `በኦፊሰር የተመዘገበ ጥሰት: ${p.notes || 'የሰነድ ጉድለት'}`,
        descriptionEn: `Patrol violation reported: ${p.notes || 'Violation found'}`,
        actionPage: 'inspection_report',
        actionTab: 'history',
        entityId: action.entityId,
        icon: 'warning',
        iconBg: 'bg-rose-500/15 text-rose-600 dark:text-rose-400',
        badgeLabelAm: 'የጥሰት ሪፖርት',
        badgeLabelEn: 'Violation Report',
        badgeBg: 'bg-rose-500/20',
        badgeText: 'text-rose-700 dark:text-rose-300',
        targetRole: 'all',
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
  } else if (action.actionType === 'UNREGISTERED_REPORT_FILED') {
    kpis.totalUnregistered++;
    kpis.pendingUnregistered++;
    if (!memoryStore.materialized_notifications) memoryStore.materialized_notifications = new Map();
    memoryStore.materialized_notifications.set(`notif-unreg-${action.entityId}`, {
      id: `notif-unreg-${action.entityId}`,
      type: 'unregistered_alert',
      titleAm: `ያልተመዘገበ ሞተር ጥቆማ: ${p.driverName || 'ያልታወቀ'}`,
      titleEn: `Unregistered Motor Report: ${p.driverName || 'Unknown'}`,
      descriptionAm: `የቻሲስ ቁጥር: ${p.chassisNumber || 'N/A'}`,
      descriptionEn: `Chassis No: ${p.chassisNumber || 'N/A'}`,
      actionPage: 'unregistered_list',
      actionTab: 'list',
      entityId: action.entityId,
      icon: 'no_crash',
      iconBg: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
      badgeLabelAm: 'ያልተመዘገበ',
      badgeLabelEn: 'Unregistered Alert',
      badgeBg: 'bg-amber-500/20',
      badgeText: 'text-amber-800 dark:text-amber-300',
      targetRole: 'all',
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  } else if (action.actionType === 'UNREGISTERED_REPORT_RESOLVED') {
    kpis.pendingUnregistered = Math.max(0, kpis.pendingUnregistered - 1);
    kpis.resolvedUnregistered++;
    const notif = memoryStore.materialized_notifications?.get(`notif-unreg-${action.entityId}`);
    if (notif) notif.isActive = false;
  } else if (action.actionType === 'USER_CREATED') {
    kpis.totalUsers++;
    if (['admin', 'superadmin'].includes(role)) kpis.adminUsers++;
    kpis.activeUsers++;
  } else if (action.actionType === 'USER_STATUS_CHANGED') {
    if (prevStatus === 'disabled') kpis.disabledUsers = Math.max(0, kpis.disabledUsers - 1);
    if (prevStatus === 'active') kpis.activeUsers = Math.max(0, kpis.activeUsers - 1);
    if (status === 'disabled') kpis.disabledUsers++;
    if (status === 'active') kpis.activeUsers++;
  } else if (action.actionType === 'USER_DELETED') {
    kpis.totalUsers = Math.max(0, kpis.totalUsers - 1);
    if (['admin', 'superadmin'].includes(role)) kpis.adminUsers = Math.max(0, kpis.adminUsers - 1);
  }

  kpis.lastActionId = action.id;
  kpis.updatedAt = new Date().toISOString();
  memoryStore.kpi_metrics.set('system_summary', kpis);
}

/**
 * Fetch Write-Side Pre-Aggregated KPIs in O(1) time
 */
export async function getMaterializedKPIs(): Promise<any> {
  const cached = getCachedQuery('kpis:system_summary');
  if (cached) {
    return cached;
  }

  const startMs = performance.now();
  if (isPostgresConnected && dbPool) {
    try {
      const res = await dbPool.query(`SELECT * FROM kpi_metrics WHERE id = 'system_summary' LIMIT 1`);
      const durationMs = (performance.now() - startMs).toFixed(2);
      if (res.rows.length > 0) {
        console.log(`[DB Perf] getMaterializedKPIs (PostgreSQL) executed in ${durationMs}ms`);
        const item = normalizeRowFromPg(res.rows[0]);
        setCachedQuery('kpis:system_summary', item, ['kpis']);
        return item;
      }
    } catch (err: any) {
      const durationMs = (performance.now() - startMs).toFixed(2);
      console.warn(`[DB Perf] getMaterializedKPIs (PostgreSQL Error after ${durationMs}ms):`, err.message);
      if (isNetworkError(err)) {
        isPostgresConnected = false;
        scheduleBackgroundReconnect();
      }
    }
  }
  const memData = memoryStore.kpi_metrics?.get('system_summary') || null;
  const durationMs = (performance.now() - startMs).toFixed(2);
  console.log(`[DB Perf] getMaterializedKPIs (In-Memory) executed in ${durationMs}ms`);
  if (memData) {
    setCachedQuery('kpis:system_summary', memData, ['kpis']);
  }
  return memData;
}

/**
 * Fetch Event-Driven Materialized Notifications without querying raw tables
 */
export async function getMaterializedNotifications(role?: string): Promise<any[]> {
  if (isPostgresConnected && dbPool) {
    try {
      let sql = `SELECT * FROM materialized_notifications WHERE is_active = TRUE`;
      const params: any[] = [];
      if (role && role !== 'all') {
        sql += ` AND (target_role = 'all' OR target_role = $1)`;
        params.push(role);
      }
      sql += ` ORDER BY created_at DESC LIMIT 50`;
      const res = await dbPool.query(sql, params);
      return res.rows.map(normalizeRowFromPg);
    } catch (err: any) {
      if (isNetworkError(err)) {
        isPostgresConnected = false;
        scheduleBackgroundReconnect();
      }
    }
  }
  const all = Array.from(memoryStore.materialized_notifications?.values() || []);
  return all
    .filter((n: any) => n.isActive !== false)
    .filter((n: any) => !role || role === 'all' || n.targetRole === 'all' || n.targetRole === role)
    .reverse()
    .slice(0, 50);
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
    'system_logo_url',
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
    'role_permissions',
    'role_definitions',
    'updated_at',
  ]),
  system_users: new Set([
    'id',
    'uid',
    'badge_id',
    'phone',
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
    'last_rejection_reason',
    'is_correction',
    'sub_city',
    'email',
    'blood_group',
    'hide_from_other_users',
    'receipt_number',
    'payment_amount',
    'receipt_screenshot',
    'term_status',
    'active_term_expiration_date',
    'last_payment_date',
    'last_receipt_number',
    'last_payment_amount',
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
    'order_date',
    'total_items',
    'total_count',
    'registration_ids',
    'status',
    'notes',
    'created_at',
    'updated_at',
  ]),
  verification_logs: new Set([
    'id',
    'scanned_at',
    'timestamp',
    'plate_number',
    'full_name',
    'driver_name',
    'phone',
    'badge_id',
    'notes',
    'vehicle_category',
    'engine_or_serial_no',
    'permit_status',
    'verification_status',
    'officer_notes',
    'officer_badge_id',
    'location_name',
    'user_portrait_photo',
    'national_id_photo',
    'driving_license_photo',
    'driving_permit_photo',
    'national_id_back_photo',
    'registration_id',
    'created_at',
  ]),
  unregistered_vehicle_reports: new Set([
    'id',
    'reported_at',
    'plate_number',
    'driver_name',
    'driver_phone',
    'vehicle_category',
    'engine_or_serial_no',
    'chassis_number',
    'motor_brand',
    'sub_city',
    'location_name',
    'officer_badge_id',
    'officer_name',
    'notes',
    'evidence_photo',
    'status',
    'resolution_notes',
    'created_at',
    'updated_at',
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
    'vehicle_category',
    'receipt_screenshot',
    'notes',
    'entered_by',
    'status',
    'verified_by_cheki',
    'cheki_bank',
    'entered_at',
    'created_at',
    'updated_at',
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
  actions: new Set([
    'id',
    'action_type',
    'entity_type',
    'entity_id',
    'actor_id',
    'actor_badge_id',
    'actor_role',
    'payload',
    'created_at',
  ]),
  kpi_metrics: new Set([
    'id',
    'total_users',
    'admin_users',
    'disabled_users',
    'active_users',
    'total_permits',
    'pending_permits',
    'approved_permits',
    'printed_permits',
    'rejected_permits',
    'today_submissions',
    'total_revenue',
    'total_receipts',
    'currency',
    'total_verifications',
    'verified_logs',
    'warning_verifications',
    'illegal_verifications',
    'total_unregistered',
    'pending_unregistered',
    'resolved_unregistered',
    'active_officers',
    'last_action_id',
    'updated_at',
  ]),
  materialized_notifications: new Set([
    'id',
    'type',
    'title_am',
    'title_en',
    'description_am',
    'description_en',
    'action_page',
    'action_tab',
    'entity_id',
    'icon',
    'icon_bg',
    'badge_label_am',
    'badge_label_en',
    'badge_bg',
    'badge_text',
    'target_role',
    'target_subcity',
    'is_active',
    'created_at',
    'updated_at',
  ]),
};

const SPECIAL_CAMEL_TO_SNAKE: Record<string, string> = {
  actionType: 'action_type',
  entityType: 'entity_type',
  entityId: 'entity_id',
  actorId: 'actor_id',
  actorBadgeId: 'actor_badge_id',
  actorRole: 'actor_role',
  totalUsers: 'total_users',
  adminUsers: 'admin_users',
  disabledUsers: 'disabled_users',
  activeUsers: 'active_users',
  totalPermits: 'total_permits',
  pendingPermits: 'pending_permits',
  approvedPermits: 'approved_permits',
  printedPermits: 'printed_permits',
  rejectedPermits: 'rejected_permits',
  todaySubmissions: 'today_submissions',
  totalRevenue: 'total_revenue',
  totalReceipts: 'total_receipts',
  totalVerifications: 'total_verifications',
  verifiedLogs: 'verified_logs',
  warningVerifications: 'warning_verifications',
  illegalVerifications: 'illegal_verifications',
  totalUnregistered: 'total_unregistered',
  pendingUnregistered: 'pending_unregistered',
  resolvedUnregistered: 'resolved_unregistered',
  activeOfficers: 'active_officers',
  lastActionId: 'last_action_id',
  titleAm: 'title_am',
  titleEn: 'title_en',
  descriptionAm: 'description_am',
  descriptionEn: 'description_en',
  actionPage: 'action_page',
  actionTab: 'action_tab',
  badgeLabelAm: 'badge_label_am',
  badgeLabelEn: 'badge_label_en',
  badgeBg: 'badge_bg',
  badgeText: 'badge_text',
  targetRole: 'target_role',
  targetSubcity: 'target_subcity',
  isActive: 'is_active',
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
  lastRejectionReason: 'last_rejection_reason',
  isCorrection: 'is_correction',
  termStatus: 'term_status',
  activeTermExpirationDate: 'active_term_expiration_date',
  lastPaymentDate: 'last_payment_date',
  lastReceiptNumber: 'last_receipt_number',
  lastPaymentAmount: 'last_payment_amount',
  verifiedByCheki: 'verified_by_cheki',
  chekiBank: 'cheki_bank',
  enteredAt: 'entered_at',
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
  last_rejection_reason: 'lastRejectionReason',
  is_correction: 'isCorrection',
  term_status: 'termStatus',
  active_term_expiration_date: 'activeTermExpirationDate',
  last_payment_date: 'lastPaymentDate',
  last_receipt_number: 'lastReceiptNumber',
  last_payment_amount: 'lastPaymentAmount',
  verified_by_cheki: 'verifiedByCheki',
  cheki_bank: 'chekiBank',
  entered_at: 'enteredAt',
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

/**
 * High-performance Server-Side Monthly Fee Statistics calculation
 * Materialized directly on backend to eliminate client-side O(N*M) loop delays
 */
export async function getMonthlyFeeStatisticsServerSide(options?: {
  targetMonth?: number;
  targetYear?: number;
  role?: string;
  badgeId?: string;
}) {
  const currentEth = toEthiopianDate(new Date());
  const targetMonth = options?.targetMonth || currentEth.month;
  const targetYear = options?.targetYear || currentEth.year;
  const targetPeriodIndex = targetYear * 13 + targetMonth;
  const isCurrentMonth = targetMonth === currentEth.month && targetYear === currentEth.year;

  // Retrieve raw registrations and payment receipts directly
  const [regsRes, receiptsRes] = await Promise.all([
    dbGetRegistrationsScoped({ scope: { role: options?.role || 'admin', isClerk: options?.role === 'clerk', badgeId: options?.badgeId }, page: 1, limit: 10000 }),
    dbGetPaymentReceiptsScoped({ scope: { isClerk: options?.role === 'clerk', badgeId: options?.badgeId }, page: 1, limit: 10000 }),
  ]);

  const rawRegs: any[] = regsRes.rows || [];
  const rawReceipts: any[] = receiptsRes.rows || [];

  const cleanPlate = (s?: string) => (s || '').replace(/[\s\-_]/g, '').toLowerCase();
  const cleanStr = (s?: string) => (s || '').trim().toLowerCase();
  const cleanPhone = (s?: string) => (s || '').replace(/[^0-9]/g, '');

  const allReceipts = [...rawReceipts];
  const existingRegIds = new Set(allReceipts.map((r) => cleanStr(r.ownerRegistrationId || r.owner_registration_id)).filter(Boolean));

  rawRegs.forEach((reg) => {
    if (!reg || !reg.id) return;
    const regIdClean = cleanStr(reg.id);
    if (existingRegIds.has(regIdClean)) return;

    const hasRegReceipt = Boolean(
      reg.receiptNumber ||
      reg.receipt_number ||
      reg.lastReceiptNumber ||
      reg.last_receipt_number ||
      reg.paymentAmount ||
      reg.payment_amount ||
      reg.lastPaymentAmount ||
      reg.last_payment_amount ||
      reg.lastPaymentDate ||
      reg.last_payment_date ||
      reg.activeTermExpirationDate ||
      reg.active_term_expiration_date ||
      reg.termStatus === 'CURRENT' ||
      reg.term_status === 'CURRENT' ||
      reg.status === 'approved' ||
      reg.status === 'printed' ||
      reg.status === 'ordered_print'
    );

    if (hasRegReceipt) {
      const rawPayDate = reg.lastPaymentDate || reg.last_payment_date || reg.registrationDate || reg.registration_date || getDefaultEthiopianRegistrationDate();
      const payDate = normalizeToEthiopianDateStr(rawPayDate);
      const expDate = (reg.activeTermExpirationDate || reg.active_term_expiration_date)
        ? normalizeToEthiopianDateStr(reg.activeTermExpirationDate || reg.active_term_expiration_date)
        : calculateOneMonthExpiration(payDate);

      allReceipts.push({
        id: `reg-init-${reg.id}`,
        receiptNumber: reg.lastReceiptNumber || reg.last_receipt_number || reg.receiptNumber || reg.receipt_number || `REC-${reg.id}`,
        ownerRegistrationId: reg.id,
        ownerName: reg.fullName || reg.full_name || '',
        plateNumber: reg.plateNumber || reg.plate_number,
        phone: reg.phone,
        paymentDate: payDate,
        expirationDate: expDate,
        amount: reg.lastPaymentAmount || reg.last_payment_amount || reg.paymentAmount || reg.payment_amount || ((reg.vehicleCategory || reg.vehicle_category) === 'electric' ? 50 : 100),
        vehicleCategory: reg.vehicleCategory || reg.vehicle_category,
        enteredBy: reg.registeredBy || reg.registered_by || 'SYSTEM',
        createdAt: payDate,
      });
    }
  });

  const parsedReceipts = allReceipts.map((rc) => {
    const payDateStr = rc.paymentDate || rc.payment_date || rc.createdAt || rc.created_at || '';
    const expDateStr = rc.expirationDate || rc.expiration_date || (payDateStr ? calculateOneMonthExpiration(payDateStr) : '');
    let payEth: EthiopianDate | null = null;
    let expEth: EthiopianDate | null = null;
    try {
      if (payDateStr) payEth = toEthiopianDate(payDateStr);
    } catch {}
    try {
      if (expDateStr) expEth = toEthiopianDate(expDateStr);
    } catch {}

    const { status, daysRemaining } = getPaymentReceiptStatus(expDateStr);
    const amountNum = parseFloat(String(rc.amount || ((rc as any).vehicleCategory === 'electric' ? '50' : '100')).replace(/[^0-9.]/g, '')) || ((rc as any).vehicleCategory === 'electric' ? 50 : 100);

    const payIndex = payEth ? payEth.year * 13 + payEth.month : 0;
    const expIndex = expEth ? expEth.year * 13 + expEth.month : payIndex;

    return {
      receipt: rc,
      payEth,
      expEth,
      payIndex,
      expIndex,
      status,
      daysRemaining,
      amountNum,
    };
  });

  const receiptsInSelectedMonth = parsedReceipts.filter((item) => {
    return item.payEth && item.payEth.year === targetYear && item.payEth.month === targetMonth;
  });

  const totalRevenue = receiptsInSelectedMonth.reduce((acc, curr) => acc + curr.amountNum, 0);
  const totalReceiptsCount = receiptsInSelectedMonth.length;

  const receiptsByRegId = new Map<string, typeof parsedReceipts[0][]>();
  const receiptsByPlate = new Map<string, typeof parsedReceipts[0][]>();
  const receiptsByPhone = new Map<string, typeof parsedReceipts[0][]>();
  const receiptsByName = new Map<string, typeof parsedReceipts[0][]>();

  for (const item of parsedReceipts) {
    const rc = item.receipt;
    const regId = rc.ownerRegistrationId || rc.owner_registration_id;
    if (regId) {
      const k = cleanStr(regId);
      if (k) {
        const arr = receiptsByRegId.get(k) || [];
        arr.push(item);
        receiptsByRegId.set(k, arr);
      }
    }
    const plate = rc.plateNumber || rc.plate_number;
    if (plate) {
      const k = cleanPlate(plate);
      if (k) {
        const arr = receiptsByPlate.get(k) || [];
        arr.push(item);
        receiptsByPlate.set(k, arr);
      }
    }
    if (rc.phone) {
      const k = cleanPhone(rc.phone);
      if (k) {
        const arr = receiptsByPhone.get(k) || [];
        arr.push(item);
        receiptsByPhone.set(k, arr);
      }
    }
    const name = rc.ownerName || rc.owner_name;
    if (name) {
      const k = cleanStr(name);
      if (k) {
        const arr = receiptsByName.get(k) || [];
        arr.push(item);
        receiptsByName.set(k, arr);
      }
    }
  }

  let paidMembersCount = 0;
  let dueSoonMembersCount = 0;
  let unpaidMembersCount = 0;
  let notEnrolledCount = 0;

  const billableRegs = rawRegs.filter((r) => r.status !== 'rejected');

  billableRegs.forEach((reg) => {
    const regIdClean = cleanStr(reg.id);
    const regPlateClean = cleanPlate(reg.plateNumber || reg.plate_number);
    const regPhoneClean = cleanPhone(reg.phone);
    const regNameClean = cleanStr(reg.fullName || reg.full_name);

    const memberReceipts =
      (regIdClean ? receiptsByRegId.get(regIdClean) : null) ||
      (regPlateClean ? receiptsByPlate.get(regPlateClean) : null) ||
      (regPhoneClean ? receiptsByPhone.get(regPhoneClean) : null) ||
      (regNameClean ? receiptsByName.get(regNameClean) : null) ||
      [];

    const directMatch = memberReceipts.find(
      (item) => item.payEth && item.payEth.year === targetYear && item.payEth.month === targetMonth
    );

    const matchingItem = directMatch;

    if (matchingItem) {
      if (isCurrentMonth && matchingItem?.status === 'expiring_soon') {
        dueSoonMembersCount++;
      } else {
        paidMembersCount++;
      }
    } else {
      let regEth: EthiopianDate | null = null;
      try {
        const regDate = reg.registrationDate || reg.registration_date;
        if (regDate) regEth = toEthiopianDate(regDate);
      } catch {}

      const regPeriodIndex = regEth ? regEth.year * 13 + regEth.month : 0;
      if (regPeriodIndex && targetPeriodIndex < regPeriodIndex) {
        notEnrolledCount++;
      } else {
        unpaidMembersCount++;
      }
    }
  });

  const activeBillableCount = Math.max(0, billableRegs.length - notEnrolledCount);
  const complianceRate =
    activeBillableCount > 0 ? Math.round(((paidMembersCount + dueSoonMembersCount) / activeBillableCount) * 100) : 0;

  const monthObj = ETHIOPIAN_MONTHS[targetMonth - 1] || ETHIOPIAN_MONTHS[0];

  return {
    targetMonth,
    targetYear,
    monthNameAm: monthObj.am,
    monthNameEn: monthObj.en,
    isCurrentMonth,
    totalRevenue,
    totalReceiptsCount,
    paidMembersCount,
    dueSoonMembersCount,
    unpaidMembersCount,
    notEnrolledCount,
    activeBillableCount,
    complianceRate,
    matrixCounts: {
      all: activeBillableCount,
      active: paidMembersCount,
      expiring: dueSoonMembersCount,
      expired: unpaidMembersCount,
    },
    calculatedAt: new Date().toISOString(),
  };
}

/**
 * Server-Side Paginated Membership Fee Directory with 10 records per request default
 */
export async function dbGetMembershipFeeDirectoryScoped(options?: {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  targetMonth?: number;
  targetYear?: number;
  scope?: UserQueryScope;
}) {
  const currentEth = toEthiopianDate(new Date());
  const targetMonth = options?.targetMonth || currentEth.month;
  const targetYear = options?.targetYear || currentEth.year;
  const targetPeriodIndex = targetYear * 13 + targetMonth;
  const isCurrentMonth = targetMonth === currentEth.month && targetYear === currentEth.year;

  const pageSize = Math.max(1, options?.limit || 10);
  const currentPage = Math.max(1, options?.page || 1);

  // Retrieve raw registrations and payment receipts directly
  const [regsRes, receiptsRes] = await Promise.all([
    dbGetRegistrationsScoped({ scope: options?.scope || { role: 'admin' }, page: 1, limit: 10000 }),
    dbGetPaymentReceiptsScoped({ scope: options?.scope || { role: 'admin' }, page: 1, limit: 10000 }),
  ]);

  const rawRegs: any[] = regsRes.rows || [];
  const rawReceipts: any[] = receiptsRes.rows || [];

  const cleanPlate = (s?: string) => (s || '').replace(/[\s\-_]/g, '').toLowerCase();
  const cleanStr = (s?: string) => (s || '').trim().toLowerCase();
  const cleanPhone = (s?: string) => (s || '').replace(/[^0-9]/g, '');

  const allReceipts = [...rawReceipts];
  const existingRegIds = new Set(allReceipts.map((r) => cleanStr(r.ownerRegistrationId || r.owner_registration_id)).filter(Boolean));

  rawRegs.forEach((reg) => {
    if (!reg || !reg.id) return;
    const regIdClean = cleanStr(reg.id);
    if (existingRegIds.has(regIdClean)) return;

    const hasRegReceipt = Boolean(
      reg.receiptNumber ||
      reg.receipt_number ||
      reg.lastReceiptNumber ||
      reg.last_receipt_number ||
      reg.paymentAmount ||
      reg.payment_amount ||
      reg.lastPaymentAmount ||
      reg.last_payment_amount ||
      reg.lastPaymentDate ||
      reg.last_payment_date ||
      reg.activeTermExpirationDate ||
      reg.active_term_expiration_date ||
      reg.termStatus === 'CURRENT' ||
      reg.term_status === 'CURRENT' ||
      reg.status === 'approved' ||
      reg.status === 'printed' ||
      reg.status === 'ordered_print'
    );

    if (hasRegReceipt) {
      const rawPayDate = reg.lastPaymentDate || reg.last_payment_date || reg.registrationDate || reg.registration_date || getDefaultEthiopianRegistrationDate();
      const payDate = normalizeToEthiopianDateStr(rawPayDate);
      const expDate = (reg.activeTermExpirationDate || reg.active_term_expiration_date)
        ? normalizeToEthiopianDateStr(reg.activeTermExpirationDate || reg.active_term_expiration_date)
        : calculateOneMonthExpiration(payDate);

      allReceipts.push({
        id: `reg-init-${reg.id}`,
        receiptNumber: reg.lastReceiptNumber || reg.last_receipt_number || reg.receiptNumber || reg.receipt_number || `REC-${reg.id}`,
        ownerRegistrationId: reg.id,
        ownerName: reg.fullName || reg.full_name || '',
        plateNumber: reg.plateNumber || reg.plate_number,
        phone: reg.phone,
        paymentDate: payDate,
        expirationDate: expDate,
        amount: reg.lastPaymentAmount || reg.last_payment_amount || reg.paymentAmount || reg.payment_amount || ((reg.vehicleCategory || reg.vehicle_category) === 'electric' ? 50 : 100),
        vehicleCategory: reg.vehicleCategory || reg.vehicle_category,
        enteredBy: reg.registeredBy || reg.registered_by || 'SYSTEM',
        createdAt: payDate,
      });
    }
  });

  const parsedReceipts = allReceipts.map((rc) => {
    const payDateStr = rc.paymentDate || rc.payment_date || rc.createdAt || rc.created_at || '';
    const expDateStr = rc.expirationDate || rc.expiration_date || (payDateStr ? calculateOneMonthExpiration(payDateStr) : '');
    let payEth: EthiopianDate | null = null;
    let expEth: EthiopianDate | null = null;
    try {
      if (payDateStr) payEth = toEthiopianDate(payDateStr);
    } catch {}
    try {
      if (expDateStr) expEth = toEthiopianDate(expDateStr);
    } catch {}

    const { status, daysRemaining } = getPaymentReceiptStatus(expDateStr);
    const amountNum = parseFloat(String(rc.amount || ((rc as any).vehicleCategory === 'electric' ? '50' : '100')).replace(/[^0-9.]/g, '')) || ((rc as any).vehicleCategory === 'electric' ? 50 : 100);

    const payIndex = payEth ? payEth.year * 13 + payEth.month : 0;
    const expIndex = expEth ? expEth.year * 13 + expEth.month : payIndex;

    return {
      receipt: rc,
      payEth,
      expEth,
      payIndex,
      expIndex,
      status,
      daysRemaining,
      amountNum,
    };
  });

  const receiptsByRegId = new Map<string, typeof parsedReceipts[0][]>();
  const receiptsByPlate = new Map<string, typeof parsedReceipts[0][]>();
  const receiptsByPhone = new Map<string, typeof parsedReceipts[0][]>();
  const receiptsByName = new Map<string, typeof parsedReceipts[0][]>();

  for (const item of parsedReceipts) {
    const rc = item.receipt;
    const rRegId = cleanStr(rc.ownerRegistrationId || rc.owner_registration_id);
    const rPlate = cleanPlate(rc.plateNumber || rc.plate_number);
    const rPhone = cleanPhone(rc.phone);
    const rName = cleanStr(rc.ownerName || rc.owner_name);

    if (rRegId) {
      if (!receiptsByRegId.has(rRegId)) receiptsByRegId.set(rRegId, []);
      receiptsByRegId.get(rRegId)!.push(item);
    }
    if (rPlate) {
      if (!receiptsByPlate.has(rPlate)) receiptsByPlate.set(rPlate, []);
      receiptsByPlate.get(rPlate)!.push(item);
    }
    if (rPhone) {
      if (!receiptsByPhone.has(rPhone)) receiptsByPhone.set(rPhone, []);
      receiptsByPhone.get(rPhone)!.push(item);
    }
    if (rName) {
      if (!receiptsByName.has(rName)) receiptsByName.set(rName, []);
      receiptsByName.get(rName)!.push(item);
    }
  }

  // Active billable registrations
  const billableRegs = rawRegs.filter((r) => r.status !== 'rejected');

  // Build matrix row items
  const allMatrixRows = billableRegs.map((reg) => {
    const regIdClean = cleanStr(reg.id);
    const regPlateClean = cleanPlate(reg.plateNumber || reg.plate_number);
    const regPhoneClean = cleanPhone(reg.phone);
    const regNameClean = cleanStr(reg.fullName || reg.full_name);

    const memberItems =
      (regIdClean ? receiptsByRegId.get(regIdClean) : null) ||
      (regPlateClean ? receiptsByPlate.get(regPlateClean) : null) ||
      (regPhoneClean ? receiptsByPhone.get(regPhoneClean) : null) ||
      (regNameClean ? receiptsByName.get(regNameClean) : null) ||
      [];

    const memberReceipts = memberItems.map((it) => it.receipt);

    const hasAnyPaymentRecord =
      memberReceipts.length > 0 ||
      Boolean(
        reg.receiptNumber ||
        reg.receipt_number ||
        reg.lastReceiptNumber ||
        reg.last_receipt_number ||
        reg.paymentAmount ||
        reg.payment_amount ||
        reg.lastPaymentAmount ||
        reg.last_payment_amount ||
        reg.lastPaymentDate ||
        reg.last_payment_date ||
        reg.activeTermExpirationDate ||
        reg.active_term_expiration_date ||
        reg.termStatus === 'CURRENT' ||
        reg.term_status === 'CURRENT'
      );

    const periods: Record<string, 'paid' | 'pending' | 'unpaid' | 'muted'> = {};

    let regEth: EthiopianDate | null = null;
    try {
      const regDate = reg.registrationDate || reg.registration_date;
      if (regDate) regEth = toEthiopianDate(regDate);
    } catch {}
    const regPeriodIndex = regEth ? regEth.year * 13 + regEth.month : 0;

    for (let m = 1; m <= 13; m++) {
      const colKey = `eth_m_${m}`;
      const colYear = targetYear;
      const colMonth = m;
      const colPeriodIndex = colYear * 13 + colMonth;
      const isColCurrentMonth = colMonth === currentEth.month && colYear === currentEth.year;

      if (regPeriodIndex && colPeriodIndex < regPeriodIndex) {
        periods[colKey] = 'muted';
        continue;
      }

      const directMonthMatches = memberItems.filter(
        (item) => item.payEth && item.payEth.year === colYear && item.payEth.month === colMonth
      );

      const directMatch = directMonthMatches[0];

      if (directMatch) {
        if (isColCurrentMonth && directMatch.status === 'expiring_soon') {
          periods[colKey] = 'pending';
        } else {
          periods[colKey] = 'paid';
        }
      } else {
        if (isColCurrentMonth && (reg.termStatus === 'DUE' || reg.term_status === 'DUE')) {
          periods[colKey] = 'pending';
        } else {
          periods[colKey] = 'unpaid';
        }
      }
    }

    const matchedPlateFromReceipt = memberReceipts.find((rc) => (rc.plateNumber || rc.plate_number) && String(rc.plateNumber || rc.plate_number).trim())?.plateNumber;
    const plate = (reg.plateNumber || reg.plate_number ? String(reg.plateNumber || reg.plate_number).trim() : '') || (matchedPlateFromReceipt ? String(matchedPlateFromReceipt).trim() : '');

    return {
      id: reg.id,
      title: reg.fullName || reg.full_name || 'Unnamed Member',
      plateNumber: plate || undefined,
      periods,
      member: reg,
      allReceipts: memberReceipts,
      currentMonthStatus: periods[`eth_m_${currentEth.month}`] || 'muted',
    };
  });

  // Filter matrix rows according to search query and status filter
  const searchQuery = (options?.search || '').trim().toLowerCase();
  const cleanQ = searchQuery.replace(/[\s\-_]/g, '');
  const statusFilter = options?.status || 'all';

  const filteredRows = allMatrixRows.filter((row) => {
    // 1. Search Query filter
    if (searchQuery) {
      const matchesName = row.title.toLowerCase().includes(searchQuery);
      const matchesPlate =
        (row.plateNumber || '').toLowerCase().includes(searchQuery) ||
        (row.plateNumber || '').replace(/[\s\-_]/g, '').toLowerCase().includes(cleanQ) ||
        (row.member?.plateNumber || row.member?.plate_number || '').toLowerCase().includes(searchQuery) ||
        (row.member?.plateNumber || row.member?.plate_number || '').replace(/[\s\-_]/g, '').toLowerCase().includes(cleanQ);
      const matchesPhone = (row.member?.phone || '').toLowerCase().includes(searchQuery);
      const matchesId = String(row.member?.id || '').toLowerCase().includes(searchQuery);
      const matchesReceipt = row.allReceipts.some((rc: any) =>
        (rc.receiptNumber || rc.receipt_number || '').toLowerCase().includes(searchQuery) ||
        (rc.plateNumber || rc.plate_number || '').toLowerCase().includes(searchQuery)
      );
      if (!matchesName && !matchesPlate && !matchesPhone && !matchesId && !matchesReceipt) {
        return false;
      }
    }

    // 2. Status filter
    if (statusFilter === 'all') return true;
    if (statusFilter === 'active') return row.currentMonthStatus === 'paid';
    if (statusFilter === 'expiring_soon') return row.currentMonthStatus === 'pending';
    if (statusFilter === 'expired') return row.currentMonthStatus === 'unpaid';

    return true;
  });

  const totalCount = filteredRows.length;
  const totalPages = Math.ceil(totalCount / pageSize) || 1;
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const paginatedRows = filteredRows.slice(startIndex, startIndex + pageSize);

  return {
    rows: paginatedRows,
    totalCount,
    pagination: {
      currentPage: safePage,
      pageSize,
      totalPages,
      totalCount,
    },
  };
}
