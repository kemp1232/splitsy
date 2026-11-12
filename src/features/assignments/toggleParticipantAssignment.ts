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

function greatestCommonDivisor(a: number, b: number): number {
  return b === 0 ? a : greatestCommonDivisor(b, a % b);
}

// Reduces share counts to lowest terms (3 -> 1; 2,2 -> 1,1; 4,2 -> 2,1). The
// split is the same either way, but a lone assignee or an all-equal item
// then always reads as weight 1 — so no invisible count survives to skew
// the next person added to the item.
function reduceWeights(weights: number[]): number[] {
  const divisor = weights.reduce(greatestCommonDivisor, 0);
  return divisor > 1 ? weights.map((weight) => weight / divisor) : weights;
}

// Returns a copy of `rows` with one line item's assignments replaced by
// `participantIds` — the in-memory mirror of
// itemAssignmentsRepository.setForLineItem's delete-then-insert, used for
// optimistic updates. Each assignee's weight (share count, the 2026-11-12
// "unequal shares" amendment) comes from `weightsByParticipantId` when given
// (e.g. reverting to the last persisted rows), else the weight that person
// already had on this item, else 1 — so toggling someone on/off keeps
// everyone else's custom shares. Remaining people's counts are reduced to
// lowest terms before anyone new joins at 1, and the result is reduced again.
export function replaceLineItemAssignments(
  rows: ItemAssignment[],
  lineItemId: string,
  participantIds: string[],
  weightsByParticipantId?: ReadonlyMap<string, number>,
): ItemAssignment[] {
  const existingWeights = new Map(
    rows
      .filter((row) => row.lineItemId === lineItemId)
      .map((row) => [row.participantId, row.weight]),
  );
  let weights: number[];
  if (weightsByParticipantId) {
    weights = participantIds.map((participantId) => weightsByParticipantId.get(participantId) ?? 1);
  } else {
    const keptIds = participantIds.filter((participantId) => existingWeights.has(participantId));
    const keptWeights = reduceWeights(keptIds.map((id) => existingWeights.get(id) ?? 1));
    const keptWeightById = new Map(keptIds.map((id, index) => [id, keptWeights[index] ?? 1]));
    weights = participantIds.map((participantId) => keptWeightById.get(participantId) ?? 1);
  }
  const reduced = reduceWeights(weights);
  return [
    ...rows.filter((row) => row.lineItemId !== lineItemId),
    ...participantIds.map((participantId, index) => ({
      lineItemId,
      participantId,
      weight: reduced[index] ?? 1,
    })),
  ];
}

// Not from the spec — the 2026-11-12 "unequal shares" amendment: upper bound
// for one assignee's share count (same 1-99 range as NumberStepper's
// default, which the shares sheet uses).
export const MAX_ITEM_SHARE_WEIGHT = 99;

// Sets the share counts of one line item's current assignees. Each value is
// floored to a whole number and clamped to 1..MAX_ITEM_SHARE_WEIGHT, then
// the item's counts are reduced to lowest terms (2,2 -> 1,1; 4,2 -> 2,1);
// ids not currently assigned to the item are ignored (a share count never
// assigns anyone). Returns `rows` itself when nothing actually changes, so
// callers can skip a no-op write.
export function setLineItemAssigneeWeights(
  rows: ItemAssignment[],
  lineItemId: string,
  weightsByParticipantId: ReadonlyMap<string, number>,
): ItemAssignment[] {
  const itemRows = rows.filter((row) => row.lineItemId === lineItemId);
  const requestedWeights = itemRows.map((row) => {
    const requested = weightsByParticipantId.get(row.participantId);
    if (requested === undefined) return row.weight;
    return Math.min(
      MAX_ITEM_SHARE_WEIGHT,
      Math.max(1, Number.isFinite(requested) ? Math.floor(requested) : 1),
    );
  });
  const reduced = reduceWeights(requestedWeights);
  const weightById = new Map(itemRows.map((row, index) => [row.participantId, reduced[index]]));
  let changed = false;
  const next = rows.map((row) => {
    if (row.lineItemId !== lineItemId) return row;
    const weight = weightById.get(row.participantId) ?? row.weight;
    if (weight === row.weight) return row;
    changed = true;
    return { ...row, weight };
  });
  return changed ? next : rows;
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

// Order-insensitive comparison of one line item's rows by assignee and
// share count — what the assignments screen uses to decide whether a line
// item's optimistic rows still need writing (a weights-only change counts).
export function hasSameAssignments(a: ItemAssignment[], b: ItemAssignment[]): boolean {
  if (
    !hasSameIds(
      a.map((row) => row.participantId),
      b.map((row) => row.participantId),
    )
  ) {
    return false;
  }
  const weightById = new Map(b.map((row) => [row.participantId, row.weight]));
  return a.every((row) => weightById.get(row.participantId) === row.weight);
}

// Groups rows by line item, keeping whole rows (weights included) — the
// assignments screen's record of what was last persisted per item.
export function groupAssignmentRowsByLineItem(
  rows: ItemAssignment[],
): Map<string, ItemAssignment[]> {
  const map = new Map<string, ItemAssignment[]>();
  for (const row of rows) {
    const existing = map.get(row.lineItemId);
    if (existing) {
      existing.push(row);
    } else {
      map.set(row.lineItemId, [row]);
    }
  }
  return map;
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
