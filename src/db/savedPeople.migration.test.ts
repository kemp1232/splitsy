/**
 * @jest-environment node
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

// Applies the real migrations (journal order, same statement-breakpoint split
// the native and web runners use) to an in-memory SQLite database via Node's
// built-in node:sqlite — same approach as debtPayments.migration.test.ts —
// then checks 0005's saved people/groups tables against actual SQLite
// behavior: applying on top of existing data, the case-insensitive unique
// index, and the FK cascades.
const drizzleDir = path.join(__dirname, '../../drizzle');

type JournalEntry = { idx: number; tag: string };

function journalEntries(): JournalEntry[] {
  const journal = JSON.parse(readFileSync(path.join(drizzleDir, 'meta/_journal.json'), 'utf8')) as {
    entries: JournalEntry[];
  };
  return [...journal.entries].sort((a, b) => a.idx - b.idx);
}

function applyMigrations(db: DatabaseSync, filter: (entry: JournalEntry) => boolean) {
  for (const entry of journalEntries().filter(filter)) {
    const sql = readFileSync(path.join(drizzleDir, `${entry.tag}.sql`), 'utf8');
    for (const statement of sql.split('--> statement-breakpoint')) {
      if (statement.trim()) db.exec(statement);
    }
  }
}

function openMigratedDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  applyMigrations(db, () => true);
  return db;
}

function insertPerson(
  db: DatabaseSync,
  id: string,
  name: string,
  lastUsedAt = '2026-11-13T00:00:00.000Z',
) {
  db.prepare(
    'INSERT INTO saved_people (id, name, normalized_name, last_used_at) VALUES (?, ?, ?, ?)',
  ).run(id, name, name.trim().toLowerCase(), lastUsedAt);
}

// The statement savedPeopleRepository.touch issues (insert, or bump
// last_used_at on a normalized-name clash).
function touchPerson(db: DatabaseSync, id: string, name: string, timestamp: string) {
  db.prepare(
    `INSERT INTO saved_people (id, name, normalized_name, last_used_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (normalized_name) DO UPDATE SET last_used_at = ?, updated_at = ?`,
  ).run(id, name, name.trim().toLowerCase(), timestamp, timestamp, timestamp, timestamp, timestamp);
}

function insertGroup(db: DatabaseSync, id: string, name: string) {
  db.prepare('INSERT INTO saved_groups (id, name) VALUES (?, ?)').run(id, name);
}

function insertMember(db: DatabaseSync, groupId: string, personId: string) {
  db.prepare('INSERT INTO saved_group_members (group_id, saved_person_id) VALUES (?, ?)').run(
    groupId,
    personId,
  );
}

function count(db: DatabaseSync, table: string): number {
  const row = db.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number };
  return Number(row.n);
}

describe('saved people migration 0005 (real SQLite)', () => {
  it('applies on top of 0000-0004 with existing trips, bills and participants intact', () => {
    const db = new DatabaseSync(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    applyMigrations(db, (entry) => entry.idx <= 4);
    db.prepare("INSERT INTO trips (id, name) VALUES ('trip-1', 'Baguio')").run();
    db.prepare(
      "INSERT INTO bills (id, title, entry_method, trip_id) VALUES ('bill-1', 'Dinner', 'MANUAL', NULL)",
    ).run();
    db.prepare(
      "INSERT INTO participants (id, bill_id, sort_order, name) VALUES ('p-1', 'bill-1', 0, 'Ana')",
    ).run();

    applyMigrations(db, (entry) => entry.idx === 5);

    expect(count(db, 'trips')).toBe(1);
    expect(count(db, 'bills')).toBe(1);
    const participant = db.prepare("SELECT name FROM participants WHERE id = 'p-1'").get() as {
      name: string;
    };
    expect(participant.name).toBe('Ana');
    expect(count(db, 'saved_people')).toBe(0);
    expect(count(db, 'saved_groups')).toBe(0);
    expect(count(db, 'saved_group_members')).toBe(0);
    db.close();
  });

  describe('constraints', () => {
    let db: DatabaseSync;

    beforeEach(() => {
      db = openMigratedDb();
    });

    afterEach(() => {
      db.close();
    });

    it('rejects a second saved person with the same normalized name', () => {
      insertPerson(db, 'person-1', 'Ana');

      expect(() => insertPerson(db, 'person-2', 'ANA')).toThrow(/UNIQUE constraint failed/);
      expect(count(db, 'saved_people')).toBe(1);
    });

    it('upserting a different casing bumps last_used_at without a duplicate or a rename', () => {
      touchPerson(db, 'person-1', 'Ana', '2026-11-01T00:00:00.000Z');
      touchPerson(db, 'person-2', 'ana', '2026-11-13T00:00:00.000Z');

      expect(count(db, 'saved_people')).toBe(1);
      const row = db.prepare('SELECT id, name, last_used_at FROM saved_people').get() as {
        id: string;
        name: string;
        last_used_at: string;
      };
      expect(row).toEqual({
        id: 'person-1',
        name: 'Ana',
        last_used_at: '2026-11-13T00:00:00.000Z',
      });
    });

    it('deleting a saved person cascades its memberships and keeps groups and bill participants', () => {
      db.prepare(
        "INSERT INTO bills (id, title, entry_method) VALUES ('bill-1', 'Dinner', 'MANUAL')",
      ).run();
      db.prepare(
        "INSERT INTO participants (id, bill_id, sort_order, name) VALUES ('p-1', 'bill-1', 0, 'Ana')",
      ).run();
      insertPerson(db, 'person-1', 'Ana');
      insertPerson(db, 'person-2', 'Ben');
      insertGroup(db, 'group-1', 'Housemates');
      insertMember(db, 'group-1', 'person-1');
      insertMember(db, 'group-1', 'person-2');

      db.prepare("DELETE FROM saved_people WHERE id = 'person-1'").run();

      expect(count(db, 'saved_group_members')).toBe(1);
      expect(count(db, 'saved_groups')).toBe(1);
      expect(count(db, 'participants')).toBe(1);
    });

    it('deleting a group cascades its memberships and keeps the saved people', () => {
      insertPerson(db, 'person-1', 'Ana');
      insertGroup(db, 'group-1', 'Housemates');
      insertMember(db, 'group-1', 'person-1');

      db.prepare("DELETE FROM saved_groups WHERE id = 'group-1'").run();

      expect(count(db, 'saved_group_members')).toBe(0);
      expect(count(db, 'saved_people')).toBe(1);
    });

    it("deleting a group's only member leaves an empty group", () => {
      insertPerson(db, 'person-1', 'Ana');
      insertGroup(db, 'group-1', 'Housemates');
      insertMember(db, 'group-1', 'person-1');

      db.prepare("DELETE FROM saved_people WHERE id = 'person-1'").run();

      expect(count(db, 'saved_groups')).toBe(1);
      expect(count(db, 'saved_group_members')).toBe(0);
    });

    it('rejects a membership for an unknown group or person, and a duplicate membership', () => {
      insertPerson(db, 'person-1', 'Ana');
      insertGroup(db, 'group-1', 'Housemates');

      expect(() => insertMember(db, 'missing', 'person-1')).toThrow(
        /FOREIGN KEY constraint failed/,
      );
      expect(() => insertMember(db, 'group-1', 'missing')).toThrow(/FOREIGN KEY constraint failed/);
      insertMember(db, 'group-1', 'person-1');
      expect(() => insertMember(db, 'group-1', 'person-1')).toThrow(/UNIQUE constraint failed/);
      expect(count(db, 'saved_group_members')).toBe(1);
    });
  });
});
