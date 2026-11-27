import { attachDatabasePool } from '@vercel/functions';
import dotenv from 'dotenv';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema';

dotenv.config({ path: '.env.local' });
dotenv.config();

const { Pool } = pg;

export type AppDatabase = NodePgDatabase<typeof schema>;

let poolInstance: pg.Pool | null = null;
let dbInstance: AppDatabase | null = null;

export function hasDatabaseUrl(): boolean {
  const url = process.env.DATABASE_URL?.trim();
  return Boolean(url && !url.includes('ep-example'));
}

function normalizeConnectionString(raw: string): string {
  // Explicitly promote `sslmode=require` to `sslmode=verify-full` unless `uselibpqcompat` is set,
  // preserving full TLS certificate + hostname verification and avoiding pg-connection-string warnings.
  if (raw.includes('sslmode=require') && !raw.includes('uselibpqcompat=')) {
    return raw.replace('sslmode=require', 'sslmode=verify-full');
  }
  return raw;
}

export function getPool(): pg.Pool {
  if (!poolInstance) {
    const rawUrl = process.env.DATABASE_URL?.trim();
    if (!rawUrl) {
      throw new Error('DATABASE_URL environment variable is not configured.');
    }
    const connectionString = normalizeConnectionString(rawUrl);
    poolInstance = new Pool({
      connectionString,
      max: 10,
      idleTimeoutMillis: 15_000,
      connectionTimeoutMillis: 10_000,
    });
    attachDatabasePool(poolInstance);
  }
  return poolInstance;
}

export function getDb(): AppDatabase {
  if (!dbInstance) {
    dbInstance = drizzle(getPool(), { schema });
  }
  return dbInstance;
}
