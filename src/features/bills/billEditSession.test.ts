import type { Bill } from '@/db/repositories/bills.repository';
import type { LineItem } from '@/db/repositories/lineItems.repository';

// In-memory stand-ins for the repositories billEditSession reads and writes.
// `mock`-prefixed so jest.mock's hoisted factories may reference it.
const mockStore: {
  bills: Map<string, Bill>;
  items: LineItem[];
  billUpdates: { id: string; patch: Partial<Bill> }[];
  reads: number;
} = { bills: new Map(), items: [], billUpdates: [], reads: 0 };

jest.mock('@/db/repositories/bills.repository', () => ({
  billsRepository: {
    getById: async (id: string) => {
      mockStore.reads += 1;
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
    listByBillId: async (billId: string) => {
      mockStore.reads += 1;
      return mockStore.items.filter((item) => item.billId === billId).map((item) => ({ ...item }));
    },
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
  adjustmentAllocationsRepository: { listByBillId: async () => [] },
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

type Session = typeof import('./billEditSession');

// A fresh module (and so a fresh, empty pending-edit map) per test. Jest's
// own loader (not a require() call); the repository mocks above still apply
// to the module's imports.
function loadSession(): Session {
  let session: Session | undefined;
  jest.isolateModules(() => {
    session = jest.requireActual<Session>('./billEditSession');
  });
  return session!;
}

function currentBill(): Bill {
  return mockStore.bills.get('bill-1')!;
}

function statusWrites(): (Bill['status'] | undefined)[] {
  return mockStore.billUpdates.map((update) => update.patch.status);
}

beforeEach(() => {
  mockStore.bills = new Map();
  mockStore.items = [{ ...ramen }];
  mockStore.billUpdates = [];
  mockStore.reads = 0;
});

describe('billEditSession', () => {
  it('restores COMPLETED with the original completedAt and updatedAt when nothing changed', async () => {
    mockStore.bills.set('bill-1', makeBill('COMPLETED'));
    const session = loadSession();

    await session.beginCompletedBillEdit(currentBill());
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

    await session.beginCompletedBillEdit(currentBill());
    mockStore.items = [{ ...ramen, lineTotalCentavos: 55000 }];
    await session.restoreUnchangedBillEdits();

    expect(currentBill().status).toBe('DRAFT');
    expect(currentBill().completedAt).toBeNull();
    expect(mockStore.billUpdates).toHaveLength(1);
  });

  it('does nothing for a bill that is already a DRAFT', async () => {
    mockStore.bills.set('bill-1', makeBill('DRAFT'));
    const session = loadSession();

    await session.beginCompletedBillEdit(currentBill());
    await session.restoreUnchangedBillEdits();

    expect(mockStore.billUpdates).toEqual([]);
    expect(currentBill().status).toBe('DRAFT');
  });

  it('uses the bill it is given instead of reading it again', async () => {
    mockStore.bills.set('bill-1', makeBill('COMPLETED'));
    const session = loadSession();

    await session.beginCompletedBillEdit(currentBill());

    // Only the content read (line items here); never billsRepository.getById.
    expect(mockStore.reads).toBe(1);
  });

  it('restore makes no reads at all when no edit is pending', async () => {
    mockStore.bills.set('bill-1', makeBill('COMPLETED'));
    const session = loadSession();

    await session.restoreUnchangedBillEdits();

    expect(mockStore.reads).toBe(0);
    expect(mockStore.billUpdates).toEqual([]);
  });

  it('ensureBillEditable puts a re-completed bill back into edit mode', async () => {
    mockStore.bills.set('bill-1', makeBill('COMPLETED'));
    const session = loadSession();

    await session.beginCompletedBillEdit(currentBill());
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

    await session.beginCompletedBillEdit(currentBill());
    session.endBillEdit('bill-1');
    const writesBeforeRestore = mockStore.billUpdates.length;

    await session.restoreUnchangedBillEdits();

    expect(mockStore.billUpdates).toHaveLength(writesBeforeRestore);
    expect(currentBill().status).toBe('DRAFT');
  });

  it('lists a bill as restoring only while its restore runs, notifying subscribers', async () => {
    mockStore.bills.set('bill-1', makeBill('COMPLETED'));
    const session = loadSession();
    await session.beginCompletedBillEdit(currentBill());

    const snapshots: string[][] = [];
    const unsubscribe = session.subscribeRestoringBillIds(() => {
      snapshots.push([...session.getRestoringBillIds()]);
    });
    expect(session.getRestoringBillIds().size).toBe(0);

    const restoring = session.restoreUnchangedBillEdits();
    expect(session.getRestoringBillIds().has('bill-1')).toBe(true);
    await restoring;

    expect(session.getRestoringBillIds().size).toBe(0);
    expect(snapshots).toEqual([['bill-1'], []]);

    unsubscribe();
    await session.beginCompletedBillEdit(currentBill());
    await session.restoreUnchangedBillEdits();
    expect(snapshots).toHaveLength(2);
  });

  it('beginCompletedBillEdit waits for an in-flight restore of the same bill', async () => {
    mockStore.bills.set('bill-1', makeBill('COMPLETED'));
    const session = loadSession();
    await session.beginCompletedBillEdit(currentBill());

    // The caller's copy predates the restore (it still says DRAFT); Edit
    // starts while the restore is running.
    const staleCopy = currentBill();
    const restoring = session.restoreUnchangedBillEdits();
    await session.beginCompletedBillEdit({ ...staleCopy, status: 'COMPLETED' });
    await restoring;

    // Restore finished first (COMPLETED), then the edit started from that.
    expect(statusWrites()).toEqual(['DRAFT', 'COMPLETED', 'DRAFT']);
    expect(currentBill().status).toBe('DRAFT');

    // And it took a fresh snapshot: leaving unchanged restores again.
    await session.restoreUnchangedBillEdits();
    expect(currentBill().status).toBe('COMPLETED');
    expect(currentBill().completedAt).toBe(COMPLETED_AT);
  });
});
