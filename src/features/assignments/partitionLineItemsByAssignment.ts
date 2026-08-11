import type { ItemAssignment } from '@/db/repositories/itemAssignments.repository';
import type { LineItem } from '@/db/repositories/lineItems.repository';

// Groups raw assignment rows (one row per line-item/participant pair) into
// the participant ids assigned to each line item. Exported on its own so the
// assignments screen can reuse it for per-row assignee name lookups without
// re-deriving the partition below.
export function groupAssignedParticipantIdsByLineItem(
  assignmentRows: ItemAssignment[],
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const row of assignmentRows) {
    const existing = map.get(row.lineItemId);
    if (existing) {
      existing.push(row.participantId);
    } else {
      map.set(row.lineItemId, [row.participantId]);
    }
  }
  return map;
}

export type LineItemAssignmentPartition = {
  unassignedItems: LineItem[];
  assignedItems: LineItem[];
};

// Spec F-013 / section 20.2 ("Assignment screen blocks continuation with
// unassigned items"): splits a bill's line items into those with zero
// assignees ("Unassigned") and those with one or more ("Assigned"). Used both
// to render the two sections and to decide whether the continue button is
// blocked, so pulling it out here keeps that rule directly unit-testable.
export function partitionLineItemsByAssignment(
  items: LineItem[],
  assignmentRows: ItemAssignment[],
): LineItemAssignmentPartition {
  const assignedIdsByItem = groupAssignedParticipantIdsByLineItem(assignmentRows);
  const unassignedItems = items.filter(
    (item) => (assignedIdsByItem.get(item.id) ?? []).length === 0,
  );
  const assignedItems = items.filter((item) => (assignedIdsByItem.get(item.id) ?? []).length > 0);
  return { unassignedItems, assignedItems };
}
