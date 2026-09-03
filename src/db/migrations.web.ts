import { useEffect, useState } from 'react';

import migrationsData from '../../drizzle/migrations';
import { db } from './client';

// Web counterpart to migrations.ts. `drizzle-orm/sqlite-proxy/migrator`'s own
// `migrate()` calls `readMigrationFiles()`, which reads `.sql` files off a
// filesystem via `fs` — meaningless on web, and incompatible with this app's
// existing migration bundling (drizzle/migrations.js imports the raw `.sql`
// files at build time; see metro.config.js/babel.config.js). So this
// reimplements the same in-memory journal-parsing logic
// `drizzle-orm/expo-sqlite/migrator`'s own `readMigrationFiles` uses (that
// migrator takes the exact same pre-bundled `{journal, migrations}` shape,
// just for the sync driver) against the SAME `drizzle/migrations` data
// native uses, then runs it through `db.dialect.migrate()` — the actual
// migration-running logic, which is driver-agnostic (it only calls generic
// `session.run()`/`session.transaction()` methods), just called directly
// instead of through the (filesystem-dependent) `sqlite-proxy/migrator`
// wrapper around it.
type MigrationJournalEntry = {
  idx: number;
  tag: string;
  when: number;
  breakpoints: boolean;
};

type MigrationsData = {
  journal: { entries: MigrationJournalEntry[] };
  migrations: Record<string, string>;
};

type ParsedMigration = {
  sql: string[];
  bps: boolean;
  folderMillis: number;
  hash: string;
};

function parseMigrations({ journal, migrations }: MigrationsData): ParsedMigration[] {
  return journal.entries.map((entry) => {
    const query = migrations[`m${entry.idx.toString().padStart(4, '0')}`];
    if (!query) {
      throw new Error(`Missing migration: ${entry.tag}`);
    }
    return {
      sql: query.split('--> statement-breakpoint'),
      bps: entry.breakpoints,
      folderMillis: entry.when,
      hash: '',
    };
  });
}

// `dialect`/`session` are genuine runtime properties on every drizzle db
// instance (see drizzle-orm/sqlite-core/db.js's constructor) but aren't part
// of its public `.d.ts` surface — the same internal API
// `drizzle-orm/expo-sqlite/migrator`'s own `migrate()` relies on.
type DrizzleInternals = {
  dialect: { migrate(migrations: ParsedMigration[], session: unknown): Promise<void> };
  session: unknown;
};

export function useDatabaseMigrations() {
  const [state, setState] = useState<{ success: boolean; error?: Error }>({ success: false });

  useEffect(() => {
    const internals = db as unknown as DrizzleInternals;
    internals.dialect
      .migrate(parseMigrations(migrationsData), internals.session)
      .then(() => setState({ success: true }))
      .catch((error: Error) => setState({ success: false, error }));
  }, []);

  return state;
}
