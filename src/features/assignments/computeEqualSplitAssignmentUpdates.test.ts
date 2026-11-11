import type { ItemAssignment } from '@/db/repositories/itemAssignments.repository';
import type { LineItem } from '@/db/repositories/lineItems.repository';
import type { Participant } from '@/db/repositories/participants.repository';

import {
  applyLineItemAssignmentUpdatesSequentially,
  computeEqualSplitAssignmentUpdates,
} from './computeEqualSplitAssignmentUpdates';

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
    tripParticipantId: null,
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

describe('applyLineItemAssignmentUpdatesSequentially', () => {
  // Mirrors web's single-connection sqlite-proxy: a second transaction that
  // starts while one is still open fails its BEGIN.
  function createFakeStore(initial: ItemAssignment[]) {
    let rows = [...initial];
    let inFlight = false;
    return {
      rows: () => rows,
      async write(lineItemId: string, participantIds: string[]) {
        if (inFlight) throw new Error('cannot start a transaction within a transaction');
        inFlight = true;
        await Promise.resolve();
        rows = [
          ...rows.filter((row) => row.lineItemId !== lineItemId),
          ...participantIds.map((participantId) => makeAssignment(lineItemId, participantId)),
        ];
        inFlight = false;
      },
    };
  }

  it('applies every update one at a time, never overlapping', async () => {
    const store = createFakeStore([]);
    await applyLineItemAssignmentUpdatesSequentially(
      [
        { lineItemId: 'i1', participantIds: ['a'] },
        { lineItemId: 'i2', participantIds: ['a', 'b'] },
        { lineItemId: 'i3', participantIds: ['b'] },
      ],
      store.write,
    );
    expect(store.rows()).toEqual([
      makeAssignment('i1', 'a'),
      makeAssignment('i2', 'a'),
      makeAssignment('i2', 'b'),
      makeAssignment('i3', 'b'),
    ]);
  });

  it('turning equal split on from the QA state assigns every item to every participant', async () => {
    const items = ['aji', 'gyoza', 'miso', 'tonk'].map(makeLineItem);
    const participants = ['A', 'B', 'C'].map(makeParticipant);
    const store = createFakeStore([
      makeAssignment('aji', 'A'),
      makeAssignment('aji', 'B'),
      makeAssignment('gyoza', 'A'),
      makeAssignment('gyoza', 'B'),
      makeAssignment('gyoza', 'C'),
      makeAssignment('miso', 'C'),
    ]);

    const updates = computeEqualSplitAssignmentUpdates(items, participants, store.rows());
    await applyLineItemAssignmentUpdatesSequentially(updates, store.write);

    expect(computeEqualSplitAssignmentUpdates(items, participants, store.rows())).toEqual([]);
    expect(store.rows()).toHaveLength(12);
  });

  it('stops at the first failing write and rethrows', async () => {
    const write = jest
      .fn<Promise<void>, [string, string[]]>()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('disk full'));
    await expect(
      applyLineItemAssignmentUpdatesSequentially(
        [
          { lineItemId: 'i1', participantIds: ['a'] },
          { lineItemId: 'i2', participantIds: ['a'] },
          { lineItemId: 'i3', participantIds: ['a'] },
        ],
        write,
      ),
    ).rejects.toThrow('disk full');
    expect(write).toHaveBeenCalledTimes(2);
  });
});
