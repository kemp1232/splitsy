import type { ItemAssignment } from '@/db/repositories/itemAssignments.repository';

// Tap-to-toggle on the assignments screen: flips one participant on/off for
// one line item. The result is always returned in `participantOrder` (the
// bill's participant sortOrder), so the stored/compared ids never depend on
// the order the user happened to tap names in. A participantId that isn't in
// `participantOrder` is ignored (no-op), and any stale ids in `ids` that no
// longer belong to a current participant are dropped.
export function toggleParticipantId(
  ids: string[],
  participantId: string,
  participantOrder: string[],
): string[] {
  const nextSet = new Set(ids);
  if (participantOrder.includes(participantId)) {
    if (nextSet.has(participantId)) {
      nextSet.delete(participantId);
    } else {
      nextSet.add(participantId);
    }
  }
  return participantOrder.filter((id) => nextSet.has(id));
}

// Returns a copy of `rows` with one line item's assignments replaced by
// `participantIds` — the in-memory mirror of
// itemAssignmentsRepository.setForLineItem's delete-then-insert, used for
// optimistic updates. weight is fixed to 1 (spec section 9.4, same as the
// column's default).
export function replaceLineItemAssignments(
  rows: ItemAssignment[],
  lineItemId: string,
  participantIds: string[],
): ItemAssignment[] {
  return [
    ...rows.filter((row) => row.lineItemId !== lineItemId),
    ...participantIds.map((participantId) => ({ lineItemId, participantId, weight: 1 })),
  ];
}

// Every line item assigned to every participant (weight 1) — the in-memory
// equivalent of what syncEqualSplitAssignments writes for an EQUAL bill,
// used to optimistically show an equal split the moment it's turned on.
export function buildEqualSplitAssignmentRows(
  lineItemIds: string[],
  participantIds: string[],
): ItemAssignment[] {
  return lineItemIds.flatMap((lineItemId) =>
    participantIds.map((participantId) => ({ lineItemId, participantId, weight: 1 })),
  );
}

// Order-insensitive id comparison — DB rows come back in no guaranteed order.
export function hasSameIds(a: string[], b: string[]): boolean {
  const aSet = new Set(a);
  const bSet = new Set(b);
  if (aSet.size !== bSet.size) return false;
  for (const id of aSet) {
    if (!bSet.has(id)) return false;
  }
  return true;
}

// Merges a fresh DB read into the screen's optimistic state: line items with
// a write still queued ("dirty") keep their local rows, so a refresh that
// lands mid-burst never clobbers taps the queue hasn't persisted yet; every
// other line item takes the DB's rows.
export function mergeRefreshedAssignments(
  dbRows: ItemAssignment[],
  localRows: ItemAssignment[],
  dirtyLineItemIds: ReadonlySet<string>,
): ItemAssignment[] {
  return [
    ...dbRows.filter((row) => !dirtyLineItemIds.has(row.lineItemId)),
    ...localRows.filter((row) => dirtyLineItemIds.has(row.lineItemId)),
  ];
}
