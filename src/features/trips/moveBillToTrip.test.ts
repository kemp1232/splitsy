import { db } from '@/db/client';
import { bills, debtPayments, participants, tripParticipants, trips } from '@/db/schema';

import { MoveBillToTripError, type BillToTripMapping } from './buildBillToTripMapping';
import { moveBillToTrip } from './trip.service';

// No SQLite under Jest: the db is faked (same approach as
// createQuickSplitBill.test.ts). Reads inside the transaction return the
// per-table fixtures below; writes are recorded.
jest.mock('@/db/client', () => ({ db: { transaction: jest.fn() } }));
jest.mock('expo-file-system', () => ({ File: jest.fn() }));
jest.mock('@/features/receipt-capture/receiptImage.service', () => ({
  deleteReceiptsDirectory: jest.fn(),
}));

const transaction = db.transaction as unknown as jest.Mock;

let rows: Map<unknown, any[]>;
let inserts: { table: unknown; values: any }[];
let updates: { table: unknown; values: any }[];

function fakeTx() {
  const query = (table: unknown) => {
    const chain = {
      where: () => chain,
      orderBy: () => chain,
      all: () => rows.get(table) ?? [],
    };
    return chain;
  };
  return {
    select: () => ({ from: query }),
    insert: (table: unknown) => ({
      values: (values: any) => {
        inserts.push({ table, values });
        return { run: () => undefined };
      },
    }),
    update: (table: unknown) => ({
      set: (values: any) => {
        updates.push({ table, values });
        return { where: () => ({ run: () => undefined }) };
      },
    }),
  };
}

beforeEach(() => {
  inserts = [];
  updates = [];
  rows = new Map<unknown, any[]>([
    [bills, [{ id: 'b1', tripId: null }]],
    [debtPayments, []],
    [trips, [{ id: 't1', status: 'ACTIVE' }]],
    [
      tripParticipants,
      [
        { id: 'tp-ana', name: 'Ana', sortOrder: 0, isActive: true },
        { id: 'tp-old', name: 'Old', sortOrder: 4, isActive: false },
      ],
    ],
    [
      participants,
      [
        { id: 'p1', name: 'ana' },
        { id: 'p2', name: ' Cara ' },
      ],
    ],
  ]);
  transaction
    .mockReset()
    .mockImplementation((callback: (tx: unknown) => unknown) => callback(fakeTx()));
});

const validMapping: BillToTripMapping = {
  p1: { kind: 'existing', tripParticipantId: 'tp-ana' },
  p2: { kind: 'new' },
};

const writesFor = (list: { table: unknown; values: any }[], table: unknown) =>
  list.filter((entry) => entry.table === table).map((entry) => entry.values);

async function expectRejected(mapping: BillToTripMapping, reason: string) {
  await expect(moveBillToTrip('b1', 't1', mapping)).rejects.toEqual(
    expect.objectContaining({ name: 'MoveBillToTripError', reason }),
  );
  expect(inserts).toEqual([]);
  expect(updates).toEqual([]);
}

describe('moveBillToTrip', () => {
  it('moves the bill, links participants, creates new roster members', async () => {
    await moveBillToTrip('b1', 't1', validMapping);

    const [newMember] = writesFor(inserts, tripParticipants);
    expect(writesFor(inserts, tripParticipants)).toHaveLength(1);
    // Trimmed bill name, sorted after every roster row (deactivated included).
    expect(newMember).toMatchObject({ tripId: 't1', name: 'Cara', sortOrder: 5, isActive: true });

    const links = writesFor(updates, participants);
    expect(links).toEqual([
      expect.objectContaining({ tripParticipantId: 'tp-ana' }),
      expect.objectContaining({ tripParticipantId: newMember.id }),
    ]);
    // Participant names are never rewritten.
    expect(links.every((patch) => !('name' in patch))).toBe(true);

    expect(writesFor(updates, bills)).toEqual([{ tripId: 't1', updatedAt: expect.any(String) }]);
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it('leaves an ACTIVE trip untouched', async () => {
    await moveBillToTrip('b1', 't1', validMapping);
    expect(writesFor(updates, trips)).toEqual([]);
  });

  it('reopens a SETTLED trip', async () => {
    rows.set(trips, [{ id: 't1', status: 'SETTLED' }]);
    await moveBillToTrip('b1', 't1', validMapping);
    expect(writesFor(updates, trips)).toEqual([
      { status: 'ACTIVE', updatedAt: expect.any(String) },
    ]);
  });

  it('reactivates a deactivated roster member with the same name instead of creating a new one', async () => {
    rows.set(participants, [
      { id: 'p1', name: 'ana' },
      { id: 'p2', name: ' old ' },
    ]);
    await moveBillToTrip('b1', 't1', {
      p1: { kind: 'existing', tripParticipantId: 'tp-ana' },
      p2: { kind: 'new' },
    });

    expect(inserts).toEqual([]);
    expect(writesFor(updates, tripParticipants)).toEqual([
      { isActive: true, updatedAt: expect.any(String) },
    ]);
    expect(writesFor(updates, participants)).toEqual([
      expect.objectContaining({ tripParticipantId: 'tp-ana' }),
      expect.objectContaining({ tripParticipantId: 'tp-old' }),
    ]);
  });

  it('moves a bill with no participants', async () => {
    rows.set(participants, []);
    await moveBillToTrip('b1', 't1', {});
    expect(writesFor(updates, bills)).toHaveLength(1);
    expect(inserts).toEqual([]);
  });

  it('throws hasPaidMarks and writes nothing', async () => {
    rows.set(debtPayments, [{ id: 'd1', billId: 'b1' }]);
    await expectRejected(validMapping, 'hasPaidMarks');
  });

  it('throws alreadyInTrip and writes nothing', async () => {
    rows.set(bills, [{ id: 'b1', tripId: 't-other' }]);
    await expectRejected(validMapping, 'alreadyInTrip');
  });

  it('throws billNotFound and writes nothing', async () => {
    rows.set(bills, []);
    await expectRejected(validMapping, 'billNotFound');
  });

  it('throws tripNotFound and writes nothing', async () => {
    rows.set(trips, []);
    await expectRejected(validMapping, 'tripNotFound');
  });

  it('throws invalidMapping for a stale mapping and writes nothing', async () => {
    // A participant was added on the bill after the mapping screen loaded.
    rows.set(participants, [
      { id: 'p1', name: 'Ana' },
      { id: 'p2', name: 'Cara' },
      { id: 'p3', name: 'Dan' },
    ]);
    await expectRejected(validMapping, 'invalidMapping');
  });

  it('throws invalidMapping for a duplicate or deactivated member and writes nothing', async () => {
    await expectRejected(
      {
        p1: { kind: 'existing', tripParticipantId: 'tp-ana' },
        p2: { kind: 'existing', tripParticipantId: 'tp-ana' },
      },
      'invalidMapping',
    );
    await expectRejected(
      { p1: { kind: 'existing', tripParticipantId: 'tp-old' }, p2: { kind: 'new' } },
      'invalidMapping',
    );
  });

  it('throws a MoveBillToTripError instance', async () => {
    rows.set(debtPayments, [{ id: 'd1' }]);
    await expect(moveBillToTrip('b1', 't1', validMapping)).rejects.toBeInstanceOf(
      MoveBillToTripError,
    );
  });
});
