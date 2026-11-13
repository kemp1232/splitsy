import { db } from '@/db/client';
import { persistDatabaseNow } from '@/db/client.web';
import {
  appSettings,
  bills,
  debtPayments,
  savedGroups,
  savedPeople,
  tripParticipants,
  trips,
} from '@/db/schema';
import { deleteReceiptsDirectory } from '@/features/receipt-capture/receiptImage.service';
import { deleteAllImages } from '@/features/receipt-capture/web/imageStore';

import * as nativeService from './bill.service';
import * as webService from './bill.service.web';

// No SQLite under Jest: the db is faked so each test records which tables a
// transaction deletes from. Child rows (line items, participants,
// assignments, adjustments, allocations) go via the schema's FK cascades
// (db/client.ts enables the pragma), so the assertions are per parent table.
// Both bill.service.ts (sync, `.run()`) and bill.service.web.ts (awaited)
// are exercised against the same fake.
jest.mock('@/db/client', () => ({ db: { transaction: jest.fn() } }));
jest.mock('@/db/client.web', () => ({ persistDatabaseNow: jest.fn() }));
jest.mock('expo-file-system', () => ({ File: jest.fn() }));
jest.mock('@/features/receipt-capture/receiptImage.service', () => ({
  deleteReceiptsDirectory: jest.fn(),
}));
jest.mock('@/features/receipt-capture/receiptImage.service.web', () => ({
  deleteStoredImage: jest.fn(),
}));
jest.mock('@/features/receipt-capture/web/imageStore', () => ({ deleteAllImages: jest.fn() }));

const transaction = db.transaction as unknown as jest.Mock;
const deleteReceipts = deleteReceiptsDirectory as unknown as jest.Mock;
const persistNow = persistDatabaseNow as unknown as jest.Mock;
const clearImages = deleteAllImages as unknown as jest.Mock;

let events: unknown[];
let failOnTable: unknown;

beforeEach(() => {
  events = [];
  failOnTable = undefined;
  deleteReceipts.mockReset().mockImplementation(() => {
    events.push('receiptsDirectory');
  });
  // Resolve on a later tick, so a caller that didn't await them would record
  // nothing before its own promise resolved.
  persistNow.mockReset().mockImplementation(async () => {
    await Promise.resolve();
    events.push('persistDatabase');
  });
  clearImages.mockReset().mockImplementation(async () => {
    await Promise.resolve();
    events.push('clearImages');
  });
  const tx = {
    delete: jest.fn((table: unknown) => {
      if (table === failOnTable) throw new Error('db locked');
      events.push(table);
      return { run: jest.fn() };
    }),
  };
  transaction.mockReset().mockImplementation((fn: (t: typeof tx) => unknown) => fn(tx));
});

const FULL_WIPE = [
  bills,
  tripParticipants,
  trips,
  appSettings,
  savedGroups,
  savedPeople,
  'receiptsDirectory',
];
const BILLS_ONLY_RESET = [
  debtPayments,
  bills,
  appSettings,
  savedGroups,
  savedPeople,
  'receiptsDirectory',
];

describe('wipeAllLocalData (native)', () => {
  it('deletes bills, trip participants, trips, app settings and saved people and groups in one transaction, then removes the receipts directory', () => {
    nativeService.wipeAllLocalData();

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(events).toEqual(FULL_WIPE);
  });

  it('does not remove the receipts directory when the transaction fails', () => {
    failOnTable = trips;

    expect(() => nativeService.wipeAllLocalData()).toThrow('db locked');
    expect(deleteReceipts).not.toHaveBeenCalled();
  });

  it('propagates a receipts-directory failure so the caller keeps its retry marker', () => {
    deleteReceipts.mockImplementation(() => {
      throw new Error('permission denied');
    });

    expect(() => nativeService.wipeAllLocalData()).toThrow('permission denied');
  });
});

describe('wipeAllLocalData (web)', () => {
  it('deletes bills, trip participants, trips, app settings and saved people and groups, then clears stored receipt images', async () => {
    await webService.wipeAllLocalData();

    expect(transaction).toHaveBeenCalledTimes(1);
    // Saved immediately (not debounced) and images cleared, both awaited.
    expect(events).toEqual([
      bills,
      tripParticipants,
      trips,
      appSettings,
      savedGroups,
      savedPeople,
      'persistDatabase',
      'clearImages',
    ]);
    expect(deleteReceipts).not.toHaveBeenCalled();
  });

  it('rejects when the wiped database cannot be persisted', async () => {
    persistNow.mockRejectedValue(new Error('quota exceeded'));

    await expect(webService.wipeAllLocalData()).rejects.toThrow('quota exceeded');
  });

  it('rejects when stored receipt images cannot be cleared', async () => {
    clearImages.mockRejectedValue(new Error('idb unavailable'));

    await expect(webService.wipeAllLocalData()).rejects.toThrow('idb unavailable');
  });
});

describe('resetAllLocalData', () => {
  it('(native) deletes debt payments, bills, app settings and saved people and groups but keeps trips and trip participants', () => {
    nativeService.resetAllLocalData();

    expect(events).toEqual(BILLS_ONLY_RESET);
  });

  it('(web) deletes debt payments, bills, app settings and saved people and groups but keeps trips and trip participants', async () => {
    await webService.resetAllLocalData();

    expect(events).toEqual(BILLS_ONLY_RESET);
  });
});
