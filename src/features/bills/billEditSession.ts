import { adjustmentAllocationsRepository } from '@/db/repositories/adjustmentAllocations.repository';
import { adjustmentsRepository } from '@/db/repositories/adjustments.repository';
import { billsRepository } from '@/db/repositories/bills.repository';
import { itemAssignmentsRepository } from '@/db/repositories/itemAssignments.repository';
import { lineItemsRepository } from '@/db/repositories/lineItems.repository';
import { participantsRepository } from '@/db/repositories/participants.repository';
import { nowIso } from '@/lib/date';

import {
  buildBillContentFingerprint,
  shouldRestoreCompletedBill,
  type PendingBillEdit,
} from './billContentFingerprint';

// Spec 15 "Completed bill editing": Edit bill turns a COMPLETED bill back into
// a DRAFT. If the user then leaves without changing anything, the bill should
// not be stuck as a draft — so Edit snapshots the bill's content first, and
// Home / the trip page / bill detail call restoreUnchangedBillEdits() when they
// load, which puts an unchanged bill back to COMPLETED (with its original
// completedAt and updatedAt, so it keeps its place in the lists).
//
// In memory only: an app/tab reload drops the snapshots and an edited-but-
// unchanged bill simply stays a DRAFT until "Finish and save" — the behavior
// before this existed. Uses repositories only (they carry their own .web
// variants), so no platform split is needed here.
const pendingEdits = new Map<string, PendingBillEdit>();

async function loadBillFingerprint(billId: string): Promise<string | null> {
  const [bill, items, participants, assignments, adjustments] = await Promise.all([
    billsRepository.getById(billId),
    lineItemsRepository.listByBillId(billId),
    participantsRepository.listByBillId(billId),
    itemAssignmentsRepository.listByBillId(billId),
    adjustmentsRepository.listByBillId(billId),
  ]);
  if (!bill) return null;
  const allocationLists = await Promise.all(
    adjustments.map((adjustment) =>
      adjustmentAllocationsRepository.listByAdjustmentId(adjustment.id),
    ),
  );
  return buildBillContentFingerprint({
    bill,
    items,
    participants,
    assignments,
    adjustments,
    allocations: allocationLists.flat(),
  });
}

// Flips a COMPLETED bill to DRAFT for editing, remembering its content first.
// A failed snapshot never blocks editing — it just means no restore later.
export async function beginCompletedBillEdit(billId: string): Promise<void> {
  const bill = await billsRepository.getById(billId);
  if (!bill || bill.status !== 'COMPLETED') return;
  try {
    const fingerprint = await loadBillFingerprint(billId);
    if (fingerprint !== null) {
      pendingEdits.set(billId, {
        fingerprint,
        completedAt: bill.completedAt,
        updatedAt: bill.updatedAt,
      });
    }
  } catch {
    pendingEdits.delete(billId);
  }
  await billsRepository.update(billId, {
    status: 'DRAFT',
    completedAt: null,
    updatedAt: nowIso(),
  });
}

// Puts every bill whose edit changed nothing back to COMPLETED. Each pending
// edit is resolved exactly once (restored or dropped). No reads at all when
// nothing is pending.
export async function restoreUnchangedBillEdits(): Promise<void> {
  const entries = [...pendingEdits.entries()];
  for (const [billId, pending] of entries) {
    pendingEdits.delete(billId);
    const bill = await billsRepository.getById(billId);
    if (!bill || bill.status !== 'DRAFT') continue;
    const fingerprint = await loadBillFingerprint(billId);
    if (fingerprint === null) continue;
    if (shouldRestoreCompletedBill(pending, bill.status, fingerprint)) {
      await billsRepository.update(billId, {
        status: 'COMPLETED',
        completedAt: pending.completedAt,
        updatedAt: pending.updatedAt,
      });
    }
  }
}

// For the edit wizard's own screens (receipt-review … summary) on focus: if
// the bill is COMPLETED while one of them is showing, a restore ran behind
// the still-mounted wizard (e.g. summary's "Back to {trip}" pushed the trip
// page, whose focus restored the unchanged bill, then the user came back).
// Re-enter edit mode — fresh snapshot, back to DRAFT — before any further
// edit writes to it. A no-op for a DRAFT bill (the normal case).
export async function ensureBillEditable(billId: string): Promise<void> {
  await beginCompletedBillEdit(billId);
}

// "Finish and save" completed the edit itself — nothing left to restore.
export function endBillEdit(billId: string): void {
  pendingEdits.delete(billId);
}
