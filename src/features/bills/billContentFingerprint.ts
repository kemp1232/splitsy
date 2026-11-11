import type { AdjustmentAllocation } from '@/db/repositories/adjustmentAllocations.repository';
import type { Adjustment } from '@/db/repositories/adjustments.repository';
import type { Bill } from '@/db/repositories/bills.repository';
import type { ItemAssignment } from '@/db/repositories/itemAssignments.repository';
import type { LineItem } from '@/db/repositories/lineItems.repository';
import type { Participant } from '@/db/repositories/participants.repository';

// Everything a user can change while editing a bill — what "Edit bill" on a
// COMPLETED bill snapshots, so that coming back without changing anything
// can put the bill back to COMPLETED (see billEditSession.ts).
export type BillContent = {
  bill: Bill;
  items: LineItem[];
  participants: Participant[];
  assignments: ItemAssignment[];
  adjustments: Adjustment[];
  allocations: AdjustmentAllocation[];
};

// What an edit session remembers about the bill as it was when Edit started.
export type PendingBillEdit = {
  fingerprint: string;
  completedAt: string | null;
  updatedAt: string;
};

// Bookkeeping columns, not content: a write that stores the same values again
// (an autosave on blur, a no-op Continue) only bumps these.
const IGNORED_KEYS = new Set(['createdAt', 'updatedAt', 'status', 'completedAt']);

function stripIgnored(row: object): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(row)
      .filter(([key]) => !IGNORED_KEYS.has(key))
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  );
}

function sortedRows<T extends object>(rows: T[], keyOf: (row: T) => string): unknown[] {
  return [...rows]
    .sort((a, b) => (keyOf(a) < keyOf(b) ? -1 : keyOf(a) > keyOf(b) ? 1 : 0))
    .map(stripIgnored);
}

// A stable string for the bill's content: independent of the order the DB
// returns rows in and of timestamps/status, but sensitive to every value a
// user can edit (items, people and what they paid, assignments, fees and
// their custom allocations, merchant, date, split mode, receipt).
export function buildBillContentFingerprint(content: BillContent): string {
  return JSON.stringify({
    bill: stripIgnored(content.bill),
    items: sortedRows(content.items, (item) => item.id),
    participants: sortedRows(content.participants, (participant) => participant.id),
    assignments: sortedRows(content.assignments, (row) => `${row.lineItemId}:${row.participantId}`),
    adjustments: sortedRows(content.adjustments, (adjustment) => adjustment.id),
    allocations: sortedRows(
      content.allocations,
      (row) => `${row.adjustmentId}:${row.participantId}`,
    ),
  });
}

// Only a bill still in the DRAFT the edit put it in, whose content is
// exactly what it was when Edit started, goes back to COMPLETED. Any real
// change (or a bill already saved again) leaves it as it is.
export function shouldRestoreCompletedBill(
  pending: PendingBillEdit | undefined,
  currentStatus: Bill['status'],
  currentFingerprint: string,
): boolean {
  return (
    pending !== undefined && currentStatus === 'DRAFT' && pending.fingerprint === currentFingerprint
  );
}
