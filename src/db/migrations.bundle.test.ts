import migrationsData from '../../drizzle/migrations';

// The bundle (drizzle/migrations.js) is what both the native expo migrator
// and the web runner (migrations.web.ts) read — a journal entry without its
// bundled SQL would fail on launch.
type Bundle = {
  journal: { entries: { idx: number; tag: string }[] };
  migrations: Record<string, string>;
};

const bundle = migrationsData as unknown as Bundle;

function sqlFor(idx: number): string {
  return bundle.migrations[`m${idx.toString().padStart(4, '0')}`] ?? '';
}

describe('drizzle migrations bundle', () => {
  it('has a bundled migration for every journal entry', () => {
    expect(bundle.journal.entries.length).toBeGreaterThanOrEqual(5);
    for (const entry of bundle.journal.entries) {
      expect(sqlFor(entry.idx)).not.toBe('');
    }
  });

  it('0004 creates debt_payments with cascading bill and trip FKs and the scope check', () => {
    const entry = bundle.journal.entries.find((e) => e.tag === '0004_debt_payments');
    expect(entry?.idx).toBe(4);
    const sql = sqlFor(4);
    expect(sql).toContain('CREATE TABLE `debt_payments`');
    expect(sql).toContain(
      'FOREIGN KEY (`bill_id`) REFERENCES `bills`(`id`) ON UPDATE no action ON DELETE cascade',
    );
    expect(sql).toContain(
      'FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE cascade',
    );
    expect(sql).toContain(
      'CHECK(("debt_payments"."bill_id" IS NULL) <> ("debt_payments"."trip_id" IS NULL))',
    );
    expect(sql).toContain('CREATE UNIQUE INDEX `debt_payments_bill_pair_idx`');
    expect(sql).toContain('CREATE UNIQUE INDEX `debt_payments_trip_pair_idx`');
  });
});
