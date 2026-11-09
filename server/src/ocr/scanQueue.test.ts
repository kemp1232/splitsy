import { describe, expect, it } from 'vitest';

import { migrateScanQueueTable, OCR_SCAN_QUEUE_DDL, OCR_SCAN_QUEUE_SEED } from './scanQueue.js';

// The DDL is Postgres-specific (`timestamp with time zone`, `DEFAULT now()`),
// which SQLite can't run, so unlike dailyUsage.test.ts this only checks the
// statements and their order rather than executing them.
describe('migrateScanQueueTable', () => {
  it('creates the table only if missing, then seeds row 1 idempotently', async () => {
    const statements: string[] = [];
    await migrateScanQueueTable(async (sql) => {
      statements.push(sql);
      return { rows: [] };
    });

    expect(statements).toEqual([OCR_SCAN_QUEUE_DDL, OCR_SCAN_QUEUE_SEED]);
    expect(OCR_SCAN_QUEUE_DDL).toMatch(/^CREATE TABLE IF NOT EXISTS ocr_scan_queue \(/);
    expect(OCR_SCAN_QUEUE_DDL).toContain('id smallint NOT NULL PRIMARY KEY');
    expect(OCR_SCAN_QUEUE_DDL).toContain(
      'next_available_at timestamp with time zone NOT NULL DEFAULT now()',
    );
    expect(OCR_SCAN_QUEUE_SEED).toMatch(/VALUES \(1, now\(\)\)\s+ON CONFLICT \(id\) DO NOTHING$/);
  });
});
