import { adjustmentAllocationsRepository } from '@/db/repositories/adjustmentAllocations.repository';
import { adjustmentsRepository } from '@/db/repositories/adjustments.repository';
import { billsRepository, type Bill } from '@/db/repositories/bills.repository';
import { itemAssignmentsRepository } from '@/db/repositories/itemAssignments.repository';
import { lineItemsRepository } from '@/db/repositories/lineItems.repository';
import { participantsRepository } from '@/db/repositories/participants.repository';
import { nowIso } from '@/lib/date';

import {
  buildBillContentFingerprint,
  shouldRestoreCompletedBill,
  type BillContent,
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

// Restores still running, per bill. Exposed (as a set of bill ids, through
// subscribeRestoringBillIds/getRestoringBillIds — see useRestoringBillIds)
// so the UI can disable that bill's Edit action until its restore settles,
// and awaited by beginCompletedBillEdit as a safety net.
const inFlightRestores = new Map<string, Promise<void>>();
let restoringBillIds: ReadonlySet<string> = new Set();
const restoringListeners = new Set<() => void>();

function publishRestoringBillIds() {
  // A new Set each time, so useSyncExternalStore sees a changed snapshot.
  restoringBillIds = new Set(inFlightRestores.keys());
  for (const listener of restoringListeners) listener();
}

export function subscribeRestoringBillIds(listener: () => void): () => void {
  restoringListeners.add(listener);
  return () => {
    restoringListeners.delete(listener);
  };
}

export function getRestoringBillIds(): ReadonlySet<string> {
  return restoringBillIds;
}

async function waitForRestore(billId: string): Promise<void> {
  await inFlightRestores.get(billId)?.catch(() => undefined);
}

// Everything but the bill row itself, all in parallel; custom allocations in
// one query for the whole bill.
async function loadBillContent(billId: string): Promise<Omit<BillContent, 'bill'>> {
  const [items, participants, assignments, adjustments, allocations] = await Promise.all([
    lineItemsRepository.listByBillId(billId),
    participantsRepository.listByBillId(billId),
    itemAssignmentsRepository.listByBillId(billId),
    adjustmentsRepository.listByBillId(billId),
    adjustmentAllocationsRepository.listByBillId(billId),
  ]);
  return { items, participants, assignments, adjustments, allocations };
}

// Flips a COMPLETED bill to DRAFT for editing, remembering its content first.
// Takes the bill the caller already loaded (no re-read) — unless a restore of
// this same bill is still running, in which case it waits for that and reads
// the bill again, since the caller's copy may predate the restore. A failed
// snapshot never blocks editing — it just means no restore later.
export async function beginCompletedBillEdit(bill: Bill): Promise<void> {
  let current: Bill | undefined = bill;
  if (inFlightRestores.has(bill.id)) {
    await waitForRestore(bill.id);
    current = await billsRepository.getById(bill.id);
  }
  if (!current || current.status !== 'COMPLETED') return;
  try {
    const content = await loadBillContent(current.id);
    pendingEdits.set(current.id, {
      fingerprint: buildBillContentFingerprint({ bill: current, ...content }),
      completedAt: current.completedAt,
      updatedAt: current.updatedAt,
    });
  } catch {
    pendingEdits.delete(current.id);
  }
  await billsRepository.update(current.id, {
    status: 'DRAFT',
    completedAt: null,
    updatedAt: nowIso(),
  });
}

async function restoreBillIfUnchanged(billId: string, pending: PendingBillEdit): Promise<void> {
  const [bill, content] = await Promise.all([
    billsRepository.getById(billId),
    loadBillContent(billId),
  ]);
  if (!bill) return;
  const fingerprint = buildBillContentFingerprint({ bill, ...content });
  if (shouldRestoreCompletedBill(pending, bill.status, fingerprint)) {
    await billsRepository.update(billId, {
      status: 'COMPLETED',
      completedAt: pending.completedAt,
      updatedAt: pending.updatedAt,
    });
  }
}

// Puts every bill whose edit changed nothing back to COMPLETED. Each pending
// edit is resolved exactly once (restored or dropped). No reads at all when
// nothing is pending. Each bill is in the restoring set from the moment this
// is called until its own restore settles.
export async function restoreUnchangedBillEdits(): Promise<void> {
  const entries = [...pendingEdits.entries()];
  if (entries.length === 0) return;
  const tasks = entries.map(([billId, pending]) => {
    pendingEdits.delete(billId);
    const task = restoreBillIfUnchanged(billId, pending).finally(() => {
      inFlightRestores.delete(billId);
      publishRestoringBillIds();
    });
    inFlightRestores.set(billId, task);
    return task;
  });
  publishRestoringBillIds();
  const results = await Promise.allSettled(tasks);
  const failure = results.find((result) => result.status === 'rejected');
  if (failure) throw failure.reason;
}

// For the edit wizard's own screens (receipt-review … summary) on focus: if
// the bill is COMPLETED while one of them is showing, a restore ran behind
// the still-mounted wizard (e.g. summary's "Back to {trip}" pushed the trip
// page, whose focus restored the unchanged bill, then the user came back).
// Re-enter edit mode — fresh snapshot, back to DRAFT — before any further
// edit writes to it. A no-op for a DRAFT bill (the normal case).
export async function ensureBillEditable(billId: string): Promise<void> {
  await waitForRestore(billId);
  const bill = await billsRepository.getById(billId);
  if (bill) await beginCompletedBillEdit(bill);
}

// "Finish and save" completed the edit itself — nothing left to restore.
export function endBillEdit(billId: string): void {
  pendingEdits.delete(billId);
}
