import pg from 'pg';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ override: true });

const { Pool } = pg;

export let dbPool: pg.Pool | null = null;
let isPostgresReady = false;

// In-memory table store fallback for when DATABASE_URL is not configured
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

/**
 * Initialize PostgreSQL connection pool
 */
export function getDbPool(): pg.Pool | null {
  if (dbPool) return dbPool;

  const databaseUrl = process.env.DATABASE_URL || process.env.PG_DATABASE_URL || process.env.POSTGRES_URL;

  if (databaseUrl) {
    try {
      dbPool = new Pool({
        connectionString: databaseUrl,
        ssl: databaseUrl.includes('localhost') || databaseUrl.includes('127.0.0.1') ? false : { rejectUnauthorized: false },
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
      });

      dbPool.on('error', (err) => {
        console.error('[PostgreSQL Pool] Unexpected error on idle client:', err);
      });

      console.log('[PostgreSQL] Database pool initialized successfully with DATABASE_URL.');
    } catch (err) {
      console.warn('[PostgreSQL] Could not initialize connection pool:', err);
      dbPool = null;
    }
  } else {
    console.log('[PostgreSQL] No DATABASE_URL provided. Running with in-memory resilient storage for development.');
  }

  return dbPool;
}

/**
 * Auto-execute schema and seed scripts on startup
 */
export async function initializeDatabaseSchema(): Promise<void> {
  const pool = getDbPool();
  if (!pool) return;

  try {
    const client = await pool.connect();
    try {
      // 1. Run schema.sql
      const schemaPath = path.join(process.cwd(), 'database', 'schema.sql');
      if (fs.existsSync(schemaPath)) {
        const schemaSql = fs.readFileSync(schemaPath, 'utf8');
        await client.query(schemaSql);
        console.log('[PostgreSQL] Schema verified and updated from database/schema.sql.');
      }

      // 2. Run seed.sql
      const seedPath = path.join(process.cwd(), 'database', 'seed.sql');
      if (fs.existsSync(seedPath)) {
        const seedSql = fs.readFileSync(seedPath, 'utf8');
        await client.query(seedSql);
        console.log('[PostgreSQL] Seed data verified and initialized from database/seed.sql.');
      }

      isPostgresReady = true;
    } finally {
      client.release();
    }
  } catch (err) {
    console.warn('[PostgreSQL] Notice during schema initialization:', err);
  }
}

/**
 * Generic query executor
 */
export async function dbQuery<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  const pool = getDbPool();
  if (pool) {
    try {
      const res = await pool.query(sql, params);
      return res.rows as T[];
    } catch (err) {
      console.error('[PostgreSQL Query Error]', { sql, err });
      throw err;
    }
  }
  return [];
}

/**
 * Fetch all documents from a table
 */
export async function dbGetAll<T = any>(tableName: string): Promise<T[]> {
  const pool = getDbPool();
  if (pool) {
    try {
      const sql = `SELECT * FROM ${tableName} ORDER BY created_at DESC`;
      const res = await pool.query(sql);
      return res.rows.map(normalizeRowFromPg) as T[];
    } catch (err: any) {
      if (err.code === '42703') { // No created_at column
        const fallbackRes = await pool.query(`SELECT * FROM ${tableName}`);
        return fallbackRes.rows.map(normalizeRowFromPg) as T[];
      }
      console.error(`[PostgreSQL] dbGetAll failed for ${tableName}:`, err.message);
      return Array.from(memoryStore[tableName]?.values() || []) as T[];
    }
  }
  return Array.from(memoryStore[tableName]?.values() || []) as T[];
}

/**
 * Fetch a single document by ID
 */
export async function dbGetById<T = any>(tableName: string, id: string): Promise<T | null> {
  const pool = getDbPool();
  if (pool) {
    try {
      const res = await pool.query(`SELECT * FROM ${tableName} WHERE id = $1 LIMIT 1`, [id]);
      if (res.rows.length > 0) {
        return normalizeRowFromPg(res.rows[0]) as T;
      }
      return null;
    } catch (err: any) {
      console.error(`[PostgreSQL] dbGetById failed for ${tableName}:${id}:`, err.message);
      return memoryStore[tableName]?.get(id) || null;
    }
  }
  return memoryStore[tableName]?.get(id) || null;
}

/**
 * Upsert a document by ID
 */
export async function dbUpsert(tableName: string, id: string, data: Record<string, any>): Promise<void> {
  // Update memory store always
  if (!memoryStore[tableName]) {
    memoryStore[tableName] = new Map();
  }
  const existing = memoryStore[tableName].get(id) || {};
  memoryStore[tableName].set(id, { ...existing, ...data, id });

  const pool = getDbPool();
  if (!pool) return;

  try {
    const pgData = normalizeRowToPg(tableName, { ...data, id });
    const keys = Object.keys(pgData);
    if (keys.length === 0) return;

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

    await pool.query(sql, values);
  } catch (err: any) {
    console.error(`[PostgreSQL] dbUpsert error on ${tableName}:`, err.message);
  }
}

/**
 * Update partial document fields
 */
export async function dbUpdateFields(tableName: string, id: string, updates: Record<string, any>): Promise<void> {
  // Update in memory
  if (memoryStore[tableName] && memoryStore[tableName].has(id)) {
    const current = memoryStore[tableName].get(id);
    memoryStore[tableName].set(id, { ...current, ...updates });
  }

  const pool = getDbPool();
  if (!pool) return;

  try {
    const pgUpdates = normalizeRowToPg(tableName, updates);
    const keys = Object.keys(pgUpdates).filter((k) => k !== 'id');
    if (keys.length === 0) return;

    const setClauses = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
    const values = [id, ...keys.map((k) => pgUpdates[k])];

    const sql = `UPDATE ${tableName} SET ${setClauses}, updated_at = CURRENT_TIMESTAMP WHERE id = $1`;
    await pool.query(sql, values);
  } catch (err: any) {
    console.error(`[PostgreSQL] dbUpdateFields error on ${tableName}:`, err.message);
  }
}

/**
 * Delete a document by ID
 */
export async function dbDelete(tableName: string, id: string): Promise<void> {
  if (memoryStore[tableName]) {
    memoryStore[tableName].delete(id);
  }

  const pool = getDbPool();
  if (!pool) return;

  try {
    await pool.query(`DELETE FROM ${tableName} WHERE id = $1`, [id]);
  } catch (err: any) {
    console.error(`[PostgreSQL] dbDelete error on ${tableName}:`, err.message);
  }
}

/**
 * Clear all records in a table
 */
export async function dbClearTable(tableName: string): Promise<void> {
  if (memoryStore[tableName]) {
    memoryStore[tableName].clear();
  }

  const pool = getDbPool();
  if (!pool) return;

  try {
    await pool.query(`TRUNCATE TABLE ${tableName} CASCADE`);
  } catch (err: any) {
    console.error(`[PostgreSQL] dbClearTable error on ${tableName}:`, err.message);
  }
}

// Convert camelCase object to snake_case DB columns and vice versa
function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

function snakeToCamel(str: string): string {
  return str.replace(/_([a-z0-9])/g, (_, letter) => letter.toUpperCase());
}

function normalizeRowToPg(tableName: string, data: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined) continue;
    const colName = camelToSnake(k);
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
