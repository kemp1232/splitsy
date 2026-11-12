import { adjustmentsRepository } from '@/db/repositories/adjustments.repository';
import type { Bill } from '@/db/repositories/bills.repository';
import { billsRepository } from '@/db/repositories/bills.repository';
import { lineItemsRepository } from '@/db/repositories/lineItems.repository';
import { participantsRepository } from '@/db/repositories/participants.repository';

import { deleteBill } from './bill.service';
import { discardUntouchedScanDraft, isUntouchedScanDraft } from './discardUntouchedScanDraft';

// Repositories and bill.service are mocked at module level so expo-sqlite /
// expo-file-system (native modules with no Jest implementation) are never
// loaded — same approach as galleryBill.test.ts.
jest.mock('@/db/repositories/bills.repository', () => ({
  billsRepository: { getById: jest.fn() },
}));
jest.mock('@/db/repositories/lineItems.repository', () => ({
  lineItemsRepository: { listByBillId: jest.fn() },
}));
jest.mock('@/db/repositories/participants.repository', () => ({
  participantsRepository: { listByBillId: jest.fn() },
}));
jest.mock('@/db/repositories/adjustments.repository', () => ({
  adjustmentsRepository: { listByBillId: jest.fn() },
}));
jest.mock('./bill.service', () => ({ deleteBill: jest.fn() }));

const getBill = billsRepository.getById as jest.Mock;
const listItems = lineItemsRepository.listByBillId as jest.Mock;
const listParticipants = participantsRepository.listByBillId as jest.Mock;
const listAdjustments = adjustmentsRepository.listByBillId as jest.Mock;
const deleteBillMock = deleteBill as jest.Mock;

function makeBill(overrides: Partial<Bill> = {}): Bill {
  return {
    id: 'bill-1',
    title: 'Receipt',
    merchantName: null,
    receiptDate: null,
    currency: 'PHP',
    tripId: null,
    entryMethod: 'CAMERA',
    status: 'DRAFT',
    splitMode: 'ITEMIZED',
    receiptImageUri: 'file:///receipt.jpg',
    originalReceiptImageUri: 'file:///receipt.jpg',
    rawOcrText: null,
    detectedReceiptTotalCentavos: null,
    detectedSubtotalCentavos: null,
    parserVersion: null,
    discrepancyAcknowledged: false,
    createdAt: '2026-11-12T00:00:00.000Z',
    updatedAt: '2026-11-12T00:00:00.000Z',
    completedAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  listItems.mockResolvedValue([]);
  listParticipants.mockResolvedValue([]);
  listAdjustments.mockResolvedValue([]);
  deleteBillMock.mockResolvedValue(undefined);
});

describe('isUntouchedScanDraft', () => {
  const empty = { items: 0, participants: 0, adjustments: 0 };
  const draft = { status: 'DRAFT', entryMethod: 'CAMERA' } as const;

  it('is true for an empty camera or gallery DRAFT', () => {
    expect(isUntouchedScanDraft(draft, empty)).toBe(true);
    expect(isUntouchedScanDraft({ status: 'DRAFT', entryMethod: 'GALLERY' }, empty)).toBe(true);
  });

  it('is false once the draft has items, participants or adjustments', () => {
    expect(isUntouchedScanDraft(draft, { ...empty, items: 1 })).toBe(false);
    expect(isUntouchedScanDraft(draft, { ...empty, participants: 1 })).toBe(false);
    expect(isUntouchedScanDraft(draft, { ...empty, adjustments: 1 })).toBe(false);
  });

  it('is false for a non-DRAFT or a manual bill', () => {
    expect(isUntouchedScanDraft({ status: 'COMPLETED', entryMethod: 'CAMERA' }, empty)).toBe(
      false,
    );
    expect(isUntouchedScanDraft({ status: 'DRAFT', entryMethod: 'MANUAL' }, empty)).toBe(false);
  });
});

describe('discardUntouchedScanDraft', () => {
  it('deletes an empty scan DRAFT', async () => {
    const bill = makeBill();
    getBill.mockResolvedValue(bill);

    await discardUntouchedScanDraft('bill-1');

    expect(deleteBillMock).toHaveBeenCalledWith(bill);
  });

  it('keeps a DRAFT that has items', async () => {
    getBill.mockResolvedValue(makeBill());
    listItems.mockResolvedValue([{ id: 'item-1' }]);

    await discardUntouchedScanDraft('bill-1');

    expect(deleteBillMock).not.toHaveBeenCalled();
  });

  it('keeps a DRAFT that has participants (e.g. added on an earlier visit)', async () => {
    getBill.mockResolvedValue(makeBill());
    listParticipants.mockResolvedValue([{ id: 'person-1' }]);

    await discardUntouchedScanDraft('bill-1');

    expect(deleteBillMock).not.toHaveBeenCalled();
  });

  it('keeps a DRAFT that has adjustments', async () => {
    getBill.mockResolvedValue(makeBill());
    listAdjustments.mockResolvedValue([{ id: 'adjustment-1' }]);

    await discardUntouchedScanDraft('bill-1');

    expect(deleteBillMock).not.toHaveBeenCalled();
  });

  it('keeps a bill that is not a DRAFT', async () => {
    getBill.mockResolvedValue(makeBill({ status: 'COMPLETED' }));

    await discardUntouchedScanDraft('bill-1');

    expect(deleteBillMock).not.toHaveBeenCalled();
  });

  it('keeps a manual bill', async () => {
    getBill.mockResolvedValue(makeBill({ entryMethod: 'MANUAL', receiptImageUri: null }));

    await discardUntouchedScanDraft('bill-1');

    expect(deleteBillMock).not.toHaveBeenCalled();
  });

  it('does nothing when the bill no longer exists', async () => {
    getBill.mockResolvedValue(undefined);

    await discardUntouchedScanDraft('bill-1');

    expect(deleteBillMock).not.toHaveBeenCalled();
  });

  it('never throws when the delete fails', async () => {
    getBill.mockResolvedValue(makeBill());
    deleteBillMock.mockRejectedValue(new Error('disk full'));
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    await expect(discardUntouchedScanDraft('bill-1')).resolves.toBeUndefined();

    errorSpy.mockRestore();
  });
});
