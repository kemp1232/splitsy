import { Pool } from '@neondatabase/serverless';

// Groq's free/on_demand tier enforces its output-tokens-per-minute (OTPM)
// budget per ACCOUNT, not per caller — every scan from every user of this
// app shares the same 1000 OTPM bucket (see groqClient.ts's
// DEFAULT_MAX_OUTPUT_TOKENS comment), and a single scan already uses ~500-600
// of it. So in practice at most one scan can safely run per rolling 60s
// window, globally, across every concurrent user — this module is that gate.
//
// Deliberately a hard, pessimistic *serialization* (one scan in flight per
// cooldown window) rather than trying to track Groq's real per-request token
// usage and pack multiple smaller scans into a window — simpler, and errs
// toward never re-triggering Groq's own 429 rather than trying to shave the
// wait time close to the wire.
//
// State lives in Postgres, not an in-memory counter, because the server runs
// as Vercel serverless functions in production (see server/api/index.ts) —
// concurrent requests can land on separate, memory-isolated function
// instances, so only a shared, atomically-updated row gives correct mutual
// exclusion across "multiple users" (the explicit requirement here). The
// atomic conditional UPDATE below is what makes two simultaneous claims from
// different instances still resolve to exactly one winner — Postgres row
// locking serializes concurrent UPDATEs to the same row, so there is no
// separate application-level lock to get wrong.
//
// `@neondatabase/serverless`'s Pool is the same driver server/src/auth.ts
// already uses for exactly this "safe to construct fresh in a serverless
// function" reason (see its own comment) — this module keeps its own small
// pool rather than importing auth.ts's, since that one is private to the
// Better Auth instance and this has nothing to do with auth.
const DATABASE_URL = process.env.DATABASE_URL;

// Same cooldown for every claim — env-tunable (matching this OCR config's
// existing OCR_IMAGE_MAX_WIDTH/OCR_MAX_OUTPUT_TOKENS pattern) in case Groq's
// actual OTPM reset window ever needs retuning without a code change. 60s
// matches the OTPM bucket's own rolling window (see groqClient.ts).
const DEFAULT_COOLDOWN_MS = 60_000;

export type ScanSlotResult = { claimed: true } | { claimed: false; retryAfterSeconds: number };

let pool: Pool | null = null;
function getPool(): Pool {
  if (!DATABASE_URL) {
    throw new Error('DATABASE_URL is not set — required for the OCR scan queue.');
  }
  // Lazy, memoized per warm instance — mirrors auth.ts's own single
  // module-scope Pool, just constructed on first use instead of at import
  // time (this module's only caller, ocr.ts, already checks GROQ_API_KEY
  // per-request rather than at boot, so failing lazily here matches that).
  pool ??= new Pool({ connectionString: DATABASE_URL });
  return pool;
}

// Attempts to claim the next scan slot. Succeeds (and pushes the next
// available time forward by `cooldownMs`) only if the current slot has
// already passed — a single atomic conditional UPDATE, so concurrent callers
// (including ones on different serverless instances) can never both win.
// Losing callers get back exactly how long until the slot they lost frees up.
export async function claimScanSlot(
  cooldownMs: number = DEFAULT_COOLDOWN_MS,
): Promise<ScanSlotResult> {
  const db = getPool();

  const claim = await db.query<{ next_available_at: string }>(
    `UPDATE ocr_scan_queue
     SET next_available_at = now() + ($1 || ' milliseconds')::interval
     WHERE id = 1 AND next_available_at <= now()
     RETURNING next_available_at`,
    [cooldownMs],
  );
  if (claim.rows.length > 0) return { claimed: true };

  // Someone else holds the slot — read it back to report how long is left,
  // rather than assuming the full cooldown (a caller arriving 50s into
  // someone else's window should only wait ~10s, not another full minute).
  const current = await db.query<{ next_available_at: string }>(
    'SELECT next_available_at FROM ocr_scan_queue WHERE id = 1',
  );
  const nextAvailableAt = current.rows[0]?.next_available_at;
  const retryAfterSeconds = nextAvailableAt
    ? Math.max(1, Math.ceil((new Date(nextAvailableAt).getTime() - Date.now()) / 1000))
    : Math.ceil(cooldownMs / 1000);
  return { claimed: false, retryAfterSeconds };
}
