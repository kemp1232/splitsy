import type { Bill } from '@/db/repositories/bills.repository';

import {
  buildBillContentFingerprint,
  shouldRestoreCompletedBill,
  type BillContent,
} from './billContentFingerprint';

const T1 = '2026-01-01T00:00:00.000Z';
const T2 = '2026-02-02T00:00:00.000Z';

function makeContent(): BillContent {
  const bill: Bill = {
    id: 'bill-1',
    title: 'Dinner',
    merchantName: 'Ramen House',
    receiptDate: '2026-01-01',
    currency: 'PHP',
    tripId: null,
    entryMethod: 'GALLERY',
    status: 'COMPLETED',
    splitMode: 'ITEMIZED',
    receiptImageUri: 'file:///receipt.jpg',
    originalReceiptImageUri: null,
    rawOcrText: 'RAMEN 500',
    detectedReceiptTotalCentavos: 60000,
    detectedSubtotalCentavos: 55000,
    parserVersion: 1,
    discrepancyAcknowledged: false,
    createdAt: T1,
    updatedAt: T1,
    completedAt: T1,
  };
  const item = (id: string, sortOrder: number, lineTotalCentavos: number) => ({
    id,
    billId: 'bill-1',
    sortOrder,
    name: `Item ${id}`,
    quantity: 1,
    unitPriceCentavos: null,
    lineTotalCentavos,
    source: 'OCR' as const,
    confidence: null,
    rawText: null,
    createdAt: T1,
    updatedAt: T1,
  });
  const participant = (id: string, sortOrder: number) => ({
    id,
    billId: 'bill-1',
    sortOrder,
    name: `Person ${id}`,
    contributedCentavos: 0,
    tripParticipantId: null,
    createdAt: T1,
    updatedAt: T1,
  });
  return {
    bill,
    items: [item('i1', 0, 30000), item('i2', 1, 25000)],
    participants: [participant('p1', 0), participant('p2', 1)],
    assignments: [
      { lineItemId: 'i1', participantId: 'p1', weight: 1 },
      { lineItemId: 'i2', participantId: 'p2', weight: 1 },
    ],
    adjustments: [
      {
        id: 'a1',
        billId: 'bill-1',
        sortOrder: 0,
        type: 'SERVICE_CHARGE',
        label: 'Service charge',
        amountCentavos: 5000,
        allocationMethod: 'CUSTOM',
        source: 'OCR',
        createdAt: T1,
        updatedAt: T1,
      },
    ],
    allocations: [
      { adjustmentId: 'a1', participantId: 'p1', amountCentavos: 2500 },
      { adjustmentId: 'a1', participantId: 'p2', amountCentavos: 2500 },
    ],
  };
}

describe('buildBillContentFingerprint', () => {
  it('is the same for the same content in a different row order', () => {
    const content = makeContent();
    const reordered: BillContent = {
      ...content,
      items: [...content.items].reverse(),
      participants: [...content.participants].reverse(),
      assignments: [...content.assignments].reverse(),
      allocations: [...content.allocations].reverse(),
    };
    expect(buildBillContentFingerprint(reordered)).toBe(buildBillContentFingerprint(content));
  });

  it('ignores timestamps, status and completedAt', () => {
    const content = makeContent();
    const touched: BillContent = {
      ...content,
      bill: { ...content.bill, status: 'DRAFT', completedAt: null, updatedAt: T2 },
      items: content.items.map((item) => ({ ...item, updatedAt: T2 })),
      participants: content.participants.map((p) => ({ ...p, updatedAt: T2 })),
      adjustments: content.adjustments.map((a) => ({ ...a, updatedAt: T2 })),
    };
    expect(buildBillContentFingerprint(touched)).toBe(buildBillContentFingerprint(content));
  });

  const changes: [string, (content: BillContent) => BillContent][] = [
    [
      'an item price',
      (c) => ({ ...c, items: [{ ...c.items[0]!, lineTotalCentavos: 31000 }, c.items[1]!] }),
    ],
    ['a removed item', (c) => ({ ...c, items: [c.items[0]!] })],
    [
      'a participant name',
      (c) => ({
        ...c,
        participants: [{ ...c.participants[0]!, name: 'Other' }, c.participants[1]!],
      }),
    ],
    [
      'what a participant paid',
      (c) => ({
        ...c,
        participants: [{ ...c.participants[0]!, contributedCentavos: 100 }, c.participants[1]!],
      }),
    ],
    [
      'an assignment',
      (c) => ({
        ...c,
        assignments: [...c.assignments, { lineItemId: 'i1', participantId: 'p2', weight: 1 }],
      }),
    ],
    [
      'an adjustment amount',
      (c) => ({ ...c, adjustments: [{ ...c.adjustments[0]!, amountCentavos: 6000 }] }),
    ],
    [
      'a custom allocation',
      (c) => ({
        ...c,
        allocations: [
          { adjustmentId: 'a1', participantId: 'p1', amountCentavos: 3000 },
          { adjustmentId: 'a1', participantId: 'p2', amountCentavos: 2000 },
        ],
      }),
    ],
    ['the merchant', (c) => ({ ...c, bill: { ...c.bill, merchantName: 'Other Place' } })],
    ['the receipt date', (c) => ({ ...c, bill: { ...c.bill, receiptDate: '2026-01-02' } })],
    ['the split mode', (c) => ({ ...c, bill: { ...c.bill, splitMode: 'EQUAL' } })],
  ];

  it.each(changes)('changes when %s changes', (_label, change) => {
    const content = makeContent();
    expect(buildBillContentFingerprint(change(content))).not.toBe(
      buildBillContentFingerprint(content),
    );
  });
});

describe('shouldRestoreCompletedBill', () => {
  const pending = { fingerprint: 'abc', completedAt: T1, updatedAt: T1 };

  it('restores a DRAFT bill whose content is unchanged', () => {
    expect(shouldRestoreCompletedBill(pending, 'DRAFT', 'abc')).toBe(true);
  });

  it('keeps a bill whose content changed as a DRAFT', () => {
    expect(shouldRestoreCompletedBill(pending, 'DRAFT', 'xyz')).toBe(false);
  });

  it('does nothing for a bill that was already saved again', () => {
    expect(shouldRestoreCompletedBill(pending, 'COMPLETED', 'abc')).toBe(false);
  });

  it('does nothing when no edit was started', () => {
    expect(shouldRestoreCompletedBill(undefined, 'DRAFT', 'abc')).toBe(false);
  });
});
