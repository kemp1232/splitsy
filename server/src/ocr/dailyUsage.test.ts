import Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  claimDailyScan,
  DEFAULT_DAILY_SCAN_LIMIT,
  migrateDailyUsageTable,
  refundDailyScan,
  resolveDailyScanLimit,
  type QueryFn,
} from './dailyUsage.js';

// Runs the module's real SQL (the same DDL, upsert and refund statements it
// sends to Postgres) against in-memory SQLite, which supports the same
// ON CONFLICT ... DO UPDATE ... WHERE ... RETURNING form. Postgres-style `$n`
// placeholders are rewritten to positional `?`s for better-sqlite3.
function sqliteQuery(db: Database.Database): QueryFn {
  return async (sql, params) => {
    const ordered: unknown[] = [];
    const text = sql.replace(/\$(\d+)/g, (_match, index: string) => {
      ordered.push(params[Number(index) - 1]);
      return '?';
    });
    const statement = db.prepare(text);
    if (statement.reader) {
      return { rows: statement.all(...ordered) as Record<string, unknown>[] };
    }
    statement.run(...ordered);
    return { rows: [] };
  };
}

const DAY_ONE = new Date('2026-11-09T12:00:00Z');
const DAY_ONE_LATE = new Date('2026-11-09T23:59:59Z');
const DAY_TWO = new Date('2026-11-10T00:00:01Z');

describe('dailyUsage', () => {
  let db: Database.Database;
  let query: QueryFn;

  beforeEach(async () => {
    db = new Database(':memory:');
    // Minimal stand-in for Better Auth's own "user" table (the FK target).
    db.exec('CREATE TABLE "user" (id TEXT PRIMARY KEY)');
    db.prepare('INSERT INTO "user" (id) VALUES (?), (?)').run('user-a', 'user-b');
    query = sqliteQuery(db);
    await migrateDailyUsageTable(query);
  });

  async function claim(userId: string, now: Date, limit = DEFAULT_DAILY_SCAN_LIMIT) {
    return claimDailyScan(userId, limit, now, query);
  }

  it('allows 10 scans per user per UTC day and refuses the 11th', async () => {
    for (let i = 0; i < 10; i++) {
      expect((await claim('user-a', DAY_ONE)).allowed).toBe(true);
    }
    const eleventh = await claim('user-a', DAY_ONE_LATE);
    expect(eleventh).toEqual({ allowed: false, usageDay: '2026-11-09' });
    // A refused claim never pushes the stored count past the cap.
    const row = db.prepare('SELECT scan_count FROM ocr_daily_usage').get() as {
      scan_count: number;
    };
    expect(row.scan_count).toBe(10);
  });

  it('counts each user separately', async () => {
    for (let i = 0; i < 10; i++) await claim('user-a', DAY_ONE);
    expect((await claim('user-a', DAY_ONE)).allowed).toBe(false);
    expect((await claim('user-b', DAY_ONE)).allowed).toBe(true);
  });

  it('starts a fresh count on the next UTC day', async () => {
    for (let i = 0; i < 10; i++) await claim('user-a', DAY_ONE);
    expect((await claim('user-a', DAY_ONE_LATE)).allowed).toBe(false);
    expect(await claim('user-a', DAY_TWO)).toEqual({ allowed: true, usageDay: '2026-11-10' });
  });

  it('refund gives back one scan and never goes below zero', async () => {
    for (let i = 0; i < 10; i++) await claim('user-a', DAY_ONE);
    await refundDailyScan('user-a', '2026-11-09', query);
    expect((await claim('user-a', DAY_ONE)).allowed).toBe(true);
    expect((await claim('user-a', DAY_ONE)).allowed).toBe(false);

    await claim('user-b', DAY_ONE);
    await refundDailyScan('user-b', '2026-11-09', query);
    await refundDailyScan('user-b', '2026-11-09', query);
    const row = db
      .prepare('SELECT scan_count FROM ocr_daily_usage WHERE user_id = ?')
      .get('user-b') as { scan_count: number };
    expect(row.scan_count).toBe(0);
  });

  it('refuses every scan without writing a row when the limit is 0 or less', async () => {
    expect((await claim('user-a', DAY_ONE, 0)).allowed).toBe(false);
    expect((await claim('user-a', DAY_ONE, -1)).allowed).toBe(false);
    expect(db.prepare('SELECT COUNT(*) AS n FROM ocr_daily_usage').get()).toEqual({ n: 0 });
  });

  it('removes usage rows when the user is deleted (ON DELETE CASCADE)', async () => {
    await claim('user-a', DAY_ONE);
    await claim('user-b', DAY_ONE);
    db.prepare('DELETE FROM "user" WHERE id = ?').run('user-a');
    const rows = db.prepare('SELECT user_id FROM ocr_daily_usage').all();
    expect(rows).toEqual([{ user_id: 'user-b' }]);
  });

  it('resolveDailyScanLimit defaults to 10, honors a valid override, and ignores invalid values', () => {
    expect(resolveDailyScanLimit(undefined)).toBe(10);
    expect(resolveDailyScanLimit('')).toBe(10);
    expect(resolveDailyScanLimit('25')).toBe(25);
    expect(resolveDailyScanLimit('0')).toBe(0);
    expect(resolveDailyScanLimit('abc')).toBe(10);
    expect(resolveDailyScanLimit('2.5')).toBe(10);
    expect(resolveDailyScanLimit('-3')).toBe(10);
  });
});
