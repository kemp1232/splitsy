import { adjustmentsRepository } from '@/db/repositories/adjustments.repository';
import type { Bill } from '@/db/repositories/bills.repository';
import { billsRepository } from '@/db/repositories/bills.repository';
import { lineItemsRepository } from '@/db/repositories/lineItems.repository';
import { participantsRepository } from '@/db/repositories/participants.repository';

import { deleteBill } from './bill.service';

// A scan (camera/gallery) draft the user left before it got any content:
// cancelled while scanning, backed out of the scan error screen, or backed
// out of review after a scan that found nothing. Deliberately strict, since
// a deleted bill can't be recovered: only a DRAFT, never a manual bill, and
// only with zero items, zero participants and zero adjustments (a trip
// bill's roster copies count as participants, so those drafts are kept).
// A typed merchant name or date doesn't count as content.
export function isUntouchedScanDraft(
  bill: Pick<Bill, 'status' | 'entryMethod'>,
  counts: { items: number; participants: number; adjustments: number },
): boolean {
  return (
    bill.status === 'DRAFT' &&
    bill.entryMethod !== 'MANUAL' &&
    counts.items === 0 &&
    counts.participants === 0 &&
    counts.adjustments === 0
  );
}

// Re-reads the bill and its items/participants/adjustments (the same
// repositories receipt-review reads) right before deciding (never
// a screen's possibly stale state), then deletes it only when it's still an
// untouched scan draft. Best-effort: a failure just leaves the draft in the
// bill list, where it can be deleted by hand, so it never blocks the caller's
// navigation. Metro resolves './bill.service' to its .web variant on web
// (async deleteBill there; native's is synchronous — awaiting covers both).
export async function discardUntouchedScanDraft(billId: string): Promise<void> {
  try {
    const bill = await billsRepository.getById(billId);
    if (!bill) return;
    const [itemRows, participantRows, adjustmentRows] = await Promise.all([
      lineItemsRepository.listByBillId(billId),
      participantsRepository.listByBillId(billId),
      adjustmentsRepository.listByBillId(billId),
    ]);
    const counts = {
      items: itemRows.length,
      participants: participantRows.length,
      adjustments: adjustmentRows.length,
    };
    if (!isUntouchedScanDraft(bill, counts)) return;
    await deleteBill(bill);
  } catch (error) {
    if (__DEV__) console.error('[discardUntouchedScanDraft] failed:', error);
  }
}
