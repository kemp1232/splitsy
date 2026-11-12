import type { ItemAssignment } from '@/db/repositories/itemAssignments.repository';
import type { LineItem } from '@/db/repositories/lineItems.repository';
import type { Participant } from '@/db/repositories/participants.repository';

import { groupAssignedParticipantIdsByLineItem } from './partitionLineItemsByAssignment';

export type LineItemAssignmentUpdate = {
  lineItemId: string;
  participantIds: string[];
};

// Not from the spec — the post-MVP "split evenly" addition (see PLAN.md):
// while a bill's splitMode is 'EQUAL', every line item must always be
// assigned to every current participant (whether the bill started that way
// via createQuickSplitBill, or an itemized bill's "Split everything equally"
// toggle was just turned on). itemAssignmentsRepository.setForLineItem is a
// full delete-then-insert, not an additive append, so blindly re-running it
// for every item on every screen load/refresh would be a needless write (and
// a flash of stale-then-fresh rows) even when nothing has changed since the
// last sync.
//
// This computes only the line items whose *current* assignee set doesn't
// already exactly match "every participant" — the assignments screen calls
// this every time it loads or refreshes (idempotent: safe and cheap to
// re-check constantly), but only touches the DB for items that actually
// drifted, e.g. a participant was just added or removed on the Participants
// screen.
export function computeEqualSplitAssignmentUpdates(
  items: LineItem[],
  participants: Participant[],
  assignmentRows: ItemAssignment[],
): LineItemAssignmentUpdate[] {
  const allParticipantIds = participants.map((participant) => participant.id);
  const allParticipantIdSet = new Set(allParticipantIds);
  const assignedIdsByItem = groupAssignedParticipantIdsByLineItem(assignmentRows);
  // An equal split also means equal shares: an item still carrying a custom
  // share count (the 2026-11-12 "unequal shares" amendment) has drifted too,
  // and rewriting it resets every weight to 1.
  const itemIdsWithCustomShares = new Set(
    assignmentRows.filter((row) => row.weight !== 1).map((row) => row.lineItemId),
  );

  const updates: LineItemAssignmentUpdate[] = [];
  for (const item of items) {
    const currentIds = assignedIdsByItem.get(item.id) ?? [];
    const currentIdSet = new Set(currentIds);
    const alreadyMatches =
      currentIdSet.size === allParticipantIdSet.size &&
      allParticipantIds.every((participantId) => currentIdSet.has(participantId)) &&
      !itemIdsWithCustomShares.has(item.id);

    if (!alreadyMatches) {
      updates.push({ lineItemId: item.id, participantIds: allParticipantIds });
    }
  }
  return updates;
}

// Applies the updates one at a time, never concurrently. On web,
// setForLineItem is an async drizzle sqlite-proxy transaction on a single
// connection: running several at once (Promise.all) makes every BEGIN after
// the first fail ("cannot start a transaction within a transaction") while
// the first still commits — which left an equal split only half-applied
// when the toggle was turned on and quickly off again. The web db client now
// serializes every transaction globally (src/db/createTransactionLock.ts);
// this stays as well because it also stops at (and rethrows) the first
// failure instead of firing the rest — the next refresh re-syncs whatever
// is left.
export async function applyLineItemAssignmentUpdatesSequentially(
  updates: LineItemAssignmentUpdate[],
  write: (lineItemId: string, participantIds: string[]) => Promise<void>,
): Promise<void> {
  for (const update of updates) {
    await write(update.lineItemId, update.participantIds);
  }
}
