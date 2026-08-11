import type { ItemAssignment } from '@/db/repositories/itemAssignments.repository';
import type { LineItem } from '@/db/repositories/lineItems.repository';
import type { Participant } from '@/db/repositories/participants.repository';

import { computeEqualSplitAssignmentUpdates } from './computeEqualSplitAssignmentUpdates';

function makeLineItem(id: string): LineItem {
  return {
    id,
    billId: 'bill-1',
    sortOrder: 0,
    name: `Item ${id}`,
    quantity: 1,
    unitPriceCentavos: null,
    lineTotalCentavos: 1000,
    source: 'MANUAL',
    confidence: null,
    rawText: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function makeParticipant(id: string): Participant {
  return {
    id,
    billId: 'bill-1',
    sortOrder: 0,
    name: `Participant ${id}`,
    contributedCentavos: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function makeAssignment(lineItemId: string, participantId: string): ItemAssignment {
  return { lineItemId, participantId, weight: 1 };
}

describe('computeEqualSplitAssignmentUpdates', () => {
  it('returns no updates for zero items', () => {
    expect(computeEqualSplitAssignmentUpdates([], [makeParticipant('p-1')], [])).toEqual([]);
  });

  it('flags every item as needing an update when there are no assignment rows at all', () => {
    const item1 = makeLineItem('item-1');
    const item2 = makeLineItem('item-2');
    const participants = [makeParticipant('p-1'), makeParticipant('p-2')];

    const updates = computeEqualSplitAssignmentUpdates([item1, item2], participants, []);

    expect(updates).toEqual([
      { lineItemId: 'item-1', participantIds: ['p-1', 'p-2'] },
      { lineItemId: 'item-2', participantIds: ['p-1', 'p-2'] },
    ]);
  });

  it('returns no updates when every item is already assigned to every participant', () => {
    const item1 = makeLineItem('item-1');
    const participants = [makeParticipant('p-1'), makeParticipant('p-2')];
    const assignmentRows = [makeAssignment('item-1', 'p-1'), makeAssignment('item-1', 'p-2')];

    expect(computeEqualSplitAssignmentUpdates([item1], participants, assignmentRows)).toEqual([]);
  });

  it('flags an item missing a newly added participant', () => {
    const item1 = makeLineItem('item-1');
    const participants = [makeParticipant('p-1'), makeParticipant('p-2')];
    // p-2 was just added on the Participants screen; item-1 only has p-1 so far.
    const assignmentRows = [makeAssignment('item-1', 'p-1')];

    const updates = computeEqualSplitAssignmentUpdates([item1], participants, assignmentRows);

    expect(updates).toEqual([{ lineItemId: 'item-1', participantIds: ['p-1', 'p-2'] }]);
  });

  it('flags an item still assigned to a participant who was since removed', () => {
    const item1 = makeLineItem('item-1');
    // Only p-1 remains; p-2 was removed on the Participants screen but the
    // stale assignment row for it hasn't been cleaned up yet.
    const participants = [makeParticipant('p-1')];
    const assignmentRows = [makeAssignment('item-1', 'p-1'), makeAssignment('item-1', 'p-2')];

    const updates = computeEqualSplitAssignmentUpdates([item1], participants, assignmentRows);

    expect(updates).toEqual([{ lineItemId: 'item-1', participantIds: ['p-1'] }]);
  });

  it('only returns updates for items that actually drifted, leaving already-synced items alone', () => {
    const synced = makeLineItem('item-synced');
    const drifted = makeLineItem('item-drifted');
    const participants = [makeParticipant('p-1'), makeParticipant('p-2')];
    const assignmentRows = [
      makeAssignment('item-synced', 'p-1'),
      makeAssignment('item-synced', 'p-2'),
      makeAssignment('item-drifted', 'p-1'),
    ];

    const updates = computeEqualSplitAssignmentUpdates(
      [synced, drifted],
      participants,
      assignmentRows,
    );

    expect(updates).toEqual([{ lineItemId: 'item-drifted', participantIds: ['p-1', 'p-2'] }]);
  });
});
