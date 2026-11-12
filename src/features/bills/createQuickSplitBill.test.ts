import { db } from '@/db/client';
import { tripParticipantsRepository } from '@/db/repositories/tripParticipants.repository';
import { bills, lineItems, participants } from '@/db/schema';

import { createQuickSplitBill } from './bill.service';

// No SQLite under Jest: the db is faked so each test records the values
// written to each table inside the transaction.
jest.mock('@/db/client', () => ({ db: { transaction: jest.fn() } }));
jest.mock('@/db/repositories/tripParticipants.repository', () => ({
  tripParticipantsRepository: { listByTripId: jest.fn() },
}));
jest.mock('expo-file-system', () => ({ File: jest.fn() }));
jest.mock('@/features/receipt-capture/receiptImage.service', () => ({
  deleteReceiptsDirectory: jest.fn(),
}));

const transaction = db.transaction as unknown as jest.Mock;
const listByTripId = tripParticipantsRepository.listByTripId as unknown as jest.Mock;

let inserts: { table: unknown; values: any }[];

beforeEach(() => {
  inserts = [];
  listByTripId.mockReset().mockResolvedValue([]);
  transaction.mockReset().mockImplementation((callback: (tx: unknown) => unknown) =>
    callback({
      insert: (table: unknown) => ({
        values: (values: any) => {
          inserts.push({ table, values });
          return {
            returning: () => ({ all: () => [{ ...values }] }),
            run: () => undefined,
          };
        },
      }),
    }),
  );
});

const valuesFor = (table: unknown) => inserts.filter((entry) => entry.table === table);

describe('createQuickSplitBill', () => {
  it('creates the quick-split bill inside the trip with the roster as participants', async () => {
    listByTripId.mockResolvedValue([
      { id: 'tp-1', name: 'Ana' },
      { id: 'tp-2', name: 'Ben' },
    ]);

    const bill = await createQuickSplitBill({ title: ' Taxi ', totalCentavos: 45000, tripId: 't1' });

    expect(listByTripId).toHaveBeenCalledWith('t1');
    expect(bill.tripId).toBe('t1');
    expect(valuesFor(bills)[0]?.values).toMatchObject({ title: 'Taxi', tripId: 't1' });
    expect(valuesFor(participants)[0]?.values).toEqual([
      expect.objectContaining({
        billId: bill.id,
        name: 'Ana',
        sortOrder: 0,
        tripParticipantId: 'tp-1',
      }),
      expect.objectContaining({
        billId: bill.id,
        name: 'Ben',
        sortOrder: 1,
        tripParticipantId: 'tp-2',
      }),
    ]);
    expect(valuesFor(lineItems)[0]?.values).toMatchObject({
      name: 'Total',
      lineTotalCentavos: 45000,
    });
  });

  it('creates a standalone quick-split bill when no tripId is given', async () => {
    const bill = await createQuickSplitBill({ title: 'Dinner', totalCentavos: 10000 });

    expect(bill.tripId).toBeNull();
    expect(listByTripId).not.toHaveBeenCalled();
    expect(valuesFor(bills)[0]?.values).toMatchObject({ tripId: null });
    expect(valuesFor(participants)).toHaveLength(0);
    expect(valuesFor(lineItems)[0]?.values).toMatchObject({ lineTotalCentavos: 10000 });
  });

  it('skips the participant insert for a trip with an empty roster', async () => {
    await createQuickSplitBill({ title: '', totalCentavos: 5000, tripId: 't1' });

    expect(listByTripId).toHaveBeenCalledWith('t1');
    expect(valuesFor(bills)[0]?.values).toMatchObject({ tripId: 't1' });
    expect(valuesFor(participants)).toHaveLength(0);
    expect(valuesFor(lineItems)).toHaveLength(1);
  });
});
