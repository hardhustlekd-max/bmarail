import pg from 'pg';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ override: true });

const { Pool } = pg;

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

export async function runStandaloneMigration(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL || process.env.PG_DATABASE_URL || process.env.POSTGRES_URL;
  if (!databaseUrl) {
    console.log('[Database Migration CLI] No DATABASE_URL found. Skipping remote database migration.');
    return;
  }

  console.log('[Database Migration CLI] Connecting to Railway PostgreSQL instance...');
  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: databaseUrl.includes('localhost') || databaseUrl.includes('127.0.0.1') ? false : { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
  });

  try {
    const client = await pool.connect();
    try {
      console.log('[Database Migration CLI] Fetching current database schema columns...');
      const existingColsRes = await client.query(`
        SELECT table_name, column_name 
        FROM information_schema.columns 
        WHERE table_schema = 'public'
      `);
      const existingCols = new Set<string>();
      for (const r of existingColsRes.rows) {
        existingCols.add(`${r.table_name.toLowerCase()}.${r.column_name.toLowerCase()}`);
      }

      const schemaPath = path.join(process.cwd(), 'database', 'schema.sql');
      if (fs.existsSync(schemaPath)) {
        console.log(`[Database Migration CLI] Executing ${schemaPath}...`);
        const schemaSql = fs.readFileSync(schemaPath, 'utf8');
        await client.query(schemaSql);

        // Auto-detect and alter missing columns
        const parsedTables = parseCreateTableColumns(schemaSql);
        let addedCount = 0;
        for (const [tableName, cols] of parsedTables.entries()) {
          for (const col of cols) {
            const key = `${tableName}.${col.name}`;
            if (!existingCols.has(key)) {
              try {
                console.log(`[Database Migration CLI] Adding missing column "${col.name}" to table "${tableName}"...`);
                await client.query(`ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS ${col.name} ${col.definition}`);
                addedCount++;
              } catch (alterErr: any) {
                console.warn(`[Database Migration CLI] Note on column ${key}:`, alterErr.message);
              }
            }
          }
        }
        console.log(`[Database Migration CLI] Auto-synchronization complete: ${addedCount} new column(s) reconciled.`);
      }

      const seedPath = path.join(process.cwd(), 'database', 'seed.sql');
      if (fs.existsSync(seedPath)) {
        console.log(`[Database Migration CLI] Verifying seed records from ${seedPath}...`);
        const seedSql = fs.readFileSync(seedPath, 'utf8');
        await client.query(seedSql);
      }

      console.log('[Database Migration CLI] ✅ Database schema and seed data are up-to-date with GitHub repo!');
    } finally {
      client.release();
    }
  } catch (err: any) {
    console.error('[Database Migration CLI Error]:', err.message || err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Execute if run directly
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('migrate.ts')) {
  runStandaloneMigration();
}
