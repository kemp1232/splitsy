import { Pool } from '@neondatabase/serverless';

// Per-account daily scan cap (2026-11-09 spec Amendment): each signed-in
// account may run at most OCR_DAILY_SCAN_LIMIT (default 10) backend scans per
// UTC day. Complements scanQueue.ts's *global* pacing gate — that one keeps
// every user together under Groq's shared per-minute budget; this one keeps a
// single account from using up the whole day's paid Groq spend.
//
// State lives in Postgres for the same reason scanQueue.ts's does (serverless
// instances share no memory). The claim is a single atomic upsert with a
// conditional DO UPDATE, so concurrent requests from the same account can
// never both slip past the cap — there is no read-then-write window.
//
// The UTC day is computed here in JS and passed as a parameter (rather than
// `now()::date` in SQL) so the exact same SQL also runs against SQLite in
// tests (dailyUsage.test.ts / auth.test.ts).
const DATABASE_URL = process.env.DATABASE_URL;

export const DEFAULT_DAILY_SCAN_LIMIT = 10;

// Usage rows reference Better Auth's own "user" table with ON DELETE CASCADE,
// so deleting an account (Better Auth's /delete-user) leaves no usage rows
// behind. Portable DDL (valid in both Postgres and SQLite).
export const OCR_DAILY_USAGE_DDL = `CREATE TABLE IF NOT EXISTS ocr_daily_usage (
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  usage_day DATE NOT NULL,
  scan_count INTEGER NOT NULL DEFAULT 0 CHECK (scan_count >= 0),
  PRIMARY KEY (user_id, usage_day)
)`;

export type QueryFn = (
  sql: string,
  params: unknown[],
) => Promise<{ rows: Record<string, unknown>[] }>;

export type DailyScanClaim = { allowed: boolean; usageDay: string };

let pool: Pool | null = null;
function getPool(): Pool {
  if (!DATABASE_URL) {
    throw new Error('DATABASE_URL is not set — required for the OCR daily scan limit.');
  }
  // Lazy, memoized per warm instance — same as scanQueue.ts's own pool.
  pool ??= new Pool({ connectionString: DATABASE_URL });
  return pool;
}

const poolQuery: QueryFn = (sql, params) => getPool().query(sql, params);

export function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

// Env-tunable like the rest of the OCR config; anything that isn't a
// non-negative integer falls back to the default rather than silently
// disabling (or unlimiting) the cap.
export function resolveDailyScanLimit(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') return DEFAULT_DAILY_SCAN_LIMIT;
  const value = Number(raw);
  return Number.isInteger(value) && value >= 0 ? value : DEFAULT_DAILY_SCAN_LIMIT;
}

// Run by migrate.ts / index.ts right after Better Auth's own migrations (the
// FK needs its "user" table to exist first). Idempotent.
export async function migrateDailyUsageTable(query: QueryFn = poolQuery): Promise<void> {
  await query(OCR_DAILY_USAGE_DDL, []);
}

// Claims one scan for `userId` today. Allowed only while today's count is
// below `limit`; the insert-or-increment and the cap check are one statement.
export async function claimDailyScan(
  userId: string,
  limit: number,
  now: Date = new Date(),
  query: QueryFn = poolQuery,
): Promise<DailyScanClaim> {
  const usageDay = utcDay(now);
  if (limit <= 0) return { allowed: false, usageDay };
  const result = await query(
    `INSERT INTO ocr_daily_usage (user_id, usage_day, scan_count)
     VALUES ($1, $2, 1)
     ON CONFLICT (user_id, usage_day)
     DO UPDATE SET scan_count = ocr_daily_usage.scan_count + 1
     WHERE ocr_daily_usage.scan_count < $3
     RETURNING scan_count`,
    [userId, usageDay, limit],
  );
  return { allowed: result.rows.length > 0, usageDay };
}

// Gives back a scan claimed for `usageDay` (the day it was claimed on, so a
// request straddling UTC midnight refunds the right row). Never below zero.
export async function refundDailyScan(
  userId: string,
  usageDay: string,
  query: QueryFn = poolQuery,
): Promise<void> {
  await query(
    `UPDATE ocr_daily_usage SET scan_count = scan_count - 1
     WHERE user_id = $1 AND usage_day = $2 AND scan_count > 0`,
    [userId, usageDay],
  );
}
