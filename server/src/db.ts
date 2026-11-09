import { Pool } from '@neondatabase/serverless';

// The one Postgres pool this server uses — shared by Better Auth (auth.ts),
// the global scan queue (ocr/scanQueue.ts) and the per-account daily scan
// cap (ocr/dailyUsage.ts). `@neondatabase/serverless`'s Pool is safe to
// construct in a serverless function (see auth.ts's own comment on why).
//
// Lazy and memoized per warm instance: constructed on first use, so modules
// that only need it per-request (the OCR route) fail at use time with a
// clear message rather than at import time. auth.ts still enforces
// DATABASE_URL at boot with its own env check before ever calling this.
let pool: Pool | null = null;

export function getPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set — required for the Splitsy server database.');
  }
  pool ??= new Pool({ connectionString });
  return pool;
}

// Minimal query shape the OCR tables' helpers depend on — satisfied by the
// pool below in production, and by a better-sqlite3 adapter in tests.
export type QueryFn = (
  sql: string,
  params: unknown[],
) => Promise<{ rows: Record<string, unknown>[] }>;

export const poolQuery: QueryFn = (sql, params) => getPool().query(sql, params);
