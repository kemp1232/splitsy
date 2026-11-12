/**
 * @jest-environment node
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

// Applies every real migration (journal order, same statement-breakpoint
// split the native and web runners use) to an in-memory SQLite database via
// Node's built-in node:sqlite, then checks debt_payments' constraints
// against actual SQLite behavior: FK cascades, the scope CHECK and the
// per-scope unique indexes.
const drizzleDir = path.join(__dirname, '../../drizzle');

function openMigratedDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  const journal = JSON.parse(readFileSync(path.join(drizzleDir, 'meta/_journal.json'), 'utf8')) as {
    entries: { idx: number; tag: string }[];
  };
  for (const entry of [...journal.entries].sort((a, b) => a.idx - b.idx)) {
    const sql = readFileSync(path.join(drizzleDir, `${entry.tag}.sql`), 'utf8');
    for (const statement of sql.split('--> statement-breakpoint')) {
      if (statement.trim()) db.exec(statement);
    }
  }
  return db;
}

function insertTrip(db: DatabaseSync, id: string) {
  db.prepare('INSERT INTO trips (id) VALUES (?)').run(id);
}

function insertBill(db: DatabaseSync, id: string, tripId: string | null = null) {
  db.prepare(
    "INSERT INTO bills (id, title, entry_method, trip_id) VALUES (?, 'Dinner', 'MANUAL', ?)",
  ).run(id, tripId);
}

function insertMark(
  db: DatabaseSync,
  id: string,
  scope: { billId?: string | null; tripId?: string | null },
  fromKey = 'a',
  toKey = 'c',
) {
  db.prepare(
    'INSERT INTO debt_payments (id, bill_id, trip_id, from_key, to_key, amount_centavos) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(id, scope.billId ?? null, scope.tripId ?? null, fromKey, toKey, 50025);
}

function countMarks(db: DatabaseSync): number {
  const row = db.prepare('SELECT count(*) AS n FROM debt_payments').get() as { n: number };
  return Number(row.n);
}

describe('debt_payments migration (real SQLite)', () => {
  let db: DatabaseSync;

  beforeEach(() => {
    db = openMigratedDb();
  });

  afterEach(() => {
    db.close();
  });

  it('deleting a bill cascades its debt_payments rows', () => {
    insertBill(db, 'bill-1');
    insertMark(db, 'mark-1', { billId: 'bill-1' });
    expect(countMarks(db)).toBe(1);

    db.prepare('DELETE FROM bills WHERE id = ?').run('bill-1');

    expect(countMarks(db)).toBe(0);
  });

  it('deleting a trip cascades its debt_payments rows', () => {
    insertTrip(db, 'trip-1');
    insertMark(db, 'mark-1', { tripId: 'trip-1' });
    expect(countMarks(db)).toBe(1);

    db.prepare('DELETE FROM trips WHERE id = ?').run('trip-1');

    expect(countMarks(db)).toBe(0);
  });

  it('rejects a mark with both or neither of bill_id/trip_id', () => {
    insertTrip(db, 'trip-1');
    insertBill(db, 'bill-1');

    expect(() => insertMark(db, 'both', { billId: 'bill-1', tripId: 'trip-1' })).toThrow(
      /CHECK constraint failed/,
    );
    expect(() => insertMark(db, 'neither', {})).toThrow(/CHECK constraint failed/);
    expect(countMarks(db)).toBe(0);
  });

  it('rejects a duplicate from/to pair within the same scope', () => {
    insertBill(db, 'bill-1');
    insertBill(db, 'bill-2');
    insertTrip(db, 'trip-1');
    insertMark(db, 'mark-1', { billId: 'bill-1' });
    insertMark(db, 'mark-trip', { tripId: 'trip-1' });

    expect(() => insertMark(db, 'dup-bill', { billId: 'bill-1' })).toThrow(
      /UNIQUE constraint failed/,
    );
    expect(() => insertMark(db, 'dup-trip', { tripId: 'trip-1' })).toThrow(
      /UNIQUE constraint failed/,
    );

    // Same pair in a different bill is a different debt.
    insertMark(db, 'mark-2', { billId: 'bill-2' });
    expect(countMarks(db)).toBe(3);
  });
});
