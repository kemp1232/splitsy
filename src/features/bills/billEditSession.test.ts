import type { Bill } from '@/db/repositories/bills.repository';
import type { LineItem } from '@/db/repositories/lineItems.repository';

// In-memory stand-ins for the repositories billEditSession reads and writes.
// `mock`-prefixed so jest.mock's hoisted factories may reference it.
const mockStore: {
  bills: Map<string, Bill>;
  items: LineItem[];
  billUpdates: { id: string; patch: Partial<Bill> }[];
} = { bills: new Map(), items: [], billUpdates: [] };

jest.mock('@/db/repositories/bills.repository', () => ({
  billsRepository: {
    getById: async (id: string) => {
      const bill = mockStore.bills.get(id);
      return bill ? { ...bill } : undefined;
    },
    update: async (id: string, patch: Partial<Bill>) => {
      mockStore.billUpdates.push({ id, patch });
      const bill = mockStore.bills.get(id);
      if (bill) mockStore.bills.set(id, { ...bill, ...patch });
    },
  },
}));
jest.mock('@/db/repositories/lineItems.repository', () => ({
  lineItemsRepository: {
    listByBillId: async (billId: string) =>
      mockStore.items.filter((item) => item.billId === billId).map((item) => ({ ...item })),
  },
}));
jest.mock('@/db/repositories/participants.repository', () => ({
  participantsRepository: { listByBillId: async () => [] },
}));
jest.mock('@/db/repositories/itemAssignments.repository', () => ({
  itemAssignmentsRepository: { listByBillId: async () => [] },
}));
jest.mock('@/db/repositories/adjustments.repository', () => ({
  adjustmentsRepository: { listByBillId: async () => [] },
}));
jest.mock('@/db/repositories/adjustmentAllocations.repository', () => ({
  adjustmentAllocationsRepository: { listByAdjustmentId: async () => [] },
}));

const COMPLETED_AT = '2026-01-01T10:00:00.000Z';
const UPDATED_AT = '2026-01-01T10:00:00.000Z';

function makeBill(status: Bill['status']): Bill {
  return {
    id: 'bill-1',
    title: 'Dinner',
    merchantName: 'Ramen House',
    receiptDate: '2026-01-01',
    currency: 'PHP',
    tripId: null,
    entryMethod: 'GALLERY',
    status,
    splitMode: 'ITEMIZED',
    receiptImageUri: 'file:///receipt.jpg',
    originalReceiptImageUri: null,
    rawOcrText: 'RAMEN 500',
    detectedReceiptTotalCentavos: null,
    detectedSubtotalCentavos: null,
    parserVersion: 1,
    discrepancyAcknowledged: false,
    createdAt: UPDATED_AT,
    updatedAt: UPDATED_AT,
    completedAt: status === 'COMPLETED' ? COMPLETED_AT : null,
  };
}

const ramen: LineItem = {
  id: 'item-1',
  billId: 'bill-1',
  sortOrder: 0,
  name: 'Ramen',
  quantity: 1,
  unitPriceCentavos: null,
  lineTotalCentavos: 50000,
  source: 'OCR',
  confidence: null,
  rawText: null,
  createdAt: UPDATED_AT,
  updatedAt: UPDATED_AT,
};

// A fresh module (and so a fresh, empty pending-edit map) per test.
function loadSession(): typeof import('./billEditSession') {
  let session!: typeof import('./billEditSession');
  jest.isolateModules(() => {
    session = require('./billEditSession');
  });
  return session;
}

function currentBill(): Bill {
  return mockStore.bills.get('bill-1')!;
}

beforeEach(() => {
  mockStore.bills = new Map();
  mockStore.items = [{ ...ramen }];
  mockStore.billUpdates = [];
});

describe('billEditSession', () => {
  it('restores COMPLETED with the original completedAt and updatedAt when nothing changed', async () => {
    mockStore.bills.set('bill-1', makeBill('COMPLETED'));
    const session = loadSession();

    await session.beginCompletedBillEdit('bill-1');
    expect(currentBill().status).toBe('DRAFT');
    expect(currentBill().completedAt).toBeNull();

    // A no-op autosave only bumps updatedAt — not a content change.
    mockStore.bills.set('bill-1', { ...currentBill(), updatedAt: '2026-03-03T00:00:00.000Z' });

    await session.restoreUnchangedBillEdits();
    expect(currentBill().status).toBe('COMPLETED');
    expect(currentBill().completedAt).toBe(COMPLETED_AT);
    expect(currentBill().updatedAt).toBe(UPDATED_AT);
  });

  it('keeps the bill a DRAFT when its content changed during the edit', async () => {
    mockStore.bills.set('bill-1', makeBill('COMPLETED'));
    const session = loadSession();

    await session.beginCompletedBillEdit('bill-1');
    mockStore.items = [{ ...ramen, lineTotalCentavos: 55000 }];
    await session.restoreUnchangedBillEdits();

    expect(currentBill().status).toBe('DRAFT');
    expect(currentBill().completedAt).toBeNull();
    expect(mockStore.billUpdates).toHaveLength(1);
  });

  it('does nothing for a bill that is already a DRAFT', async () => {
    mockStore.bills.set('bill-1', makeBill('DRAFT'));
    const session = loadSession();

    await session.beginCompletedBillEdit('bill-1');
    await session.restoreUnchangedBillEdits();

    expect(mockStore.billUpdates).toEqual([]);
    expect(currentBill().status).toBe('DRAFT');
  });

  it('ensureBillEditable puts a re-completed bill back into edit mode', async () => {
    mockStore.bills.set('bill-1', makeBill('COMPLETED'));
    const session = loadSession();

    await session.beginCompletedBillEdit('bill-1');
    await session.restoreUnchangedBillEdits();
    expect(currentBill().status).toBe('COMPLETED');

    await session.ensureBillEditable('bill-1');
    expect(currentBill().status).toBe('DRAFT');
    expect(currentBill().completedAt).toBeNull();

    await session.restoreUnchangedBillEdits();
    expect(currentBill().status).toBe('COMPLETED');
    expect(currentBill().completedAt).toBe(COMPLETED_AT);
  });

  it('endBillEdit drops the pending snapshot so a saved bill is never touched', async () => {
    mockStore.bills.set('bill-1', makeBill('COMPLETED'));
    const session = loadSession();

    await session.beginCompletedBillEdit('bill-1');
    session.endBillEdit('bill-1');
    const writesBeforeRestore = mockStore.billUpdates.length;

    await session.restoreUnchangedBillEdits();

    expect(mockStore.billUpdates).toHaveLength(writesBeforeRestore);
    expect(currentBill().status).toBe('DRAFT');
  });
});
