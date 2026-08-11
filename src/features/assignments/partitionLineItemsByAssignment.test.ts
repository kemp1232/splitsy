import type { ItemAssignment } from '@/db/repositories/itemAssignments.repository';
import type { LineItem } from '@/db/repositories/lineItems.repository';

import {
  groupAssignedParticipantIdsByLineItem,
  partitionLineItemsByAssignment,
} from './partitionLineItemsByAssignment';

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

function makeAssignment(lineItemId: string, participantId: string): ItemAssignment {
  return { lineItemId, participantId, weight: 1 };
}

describe('groupAssignedParticipantIdsByLineItem', () => {
  it('returns an empty map for no assignment rows', () => {
    expect(groupAssignedParticipantIdsByLineItem([])).toEqual(new Map());
  });

  it('groups multiple participants assigned to the same item', () => {
    const map = groupAssignedParticipantIdsByLineItem([
      makeAssignment('item-1', 'p-1'),
      makeAssignment('item-1', 'p-2'),
    ]);
    expect(map.get('item-1')).toEqual(['p-1', 'p-2']);
  });

  it('does not create an entry for items with no assignment rows', () => {
    const map = groupAssignedParticipantIdsByLineItem([makeAssignment('item-1', 'p-1')]);
    expect(map.has('item-2')).toBe(false);
  });
});

describe('partitionLineItemsByAssignment', () => {
  it('returns two empty lists for zero items', () => {
    expect(partitionLineItemsByAssignment([], [])).toEqual({
      unassignedItems: [],
      assignedItems: [],
    });
  });

  it('puts every item in assignedItems when all items have at least one assignee', () => {
    const item1 = makeLineItem('item-1');
    const item2 = makeLineItem('item-2');
    const result = partitionLineItemsByAssignment(
      [item1, item2],
      [makeAssignment('item-1', 'p-1'), makeAssignment('item-2', 'p-2')],
    );
    expect(result.unassignedItems).toEqual([]);
    expect(result.assignedItems).toEqual([item1, item2]);
  });

  it('puts every item in unassignedItems when there are no assignment rows at all', () => {
    const item1 = makeLineItem('item-1');
    const item2 = makeLineItem('item-2');
    const result = partitionLineItemsByAssignment([item1, item2], []);
    expect(result.unassignedItems).toEqual([item1, item2]);
    expect(result.assignedItems).toEqual([]);
  });

  it('splits a mix of assigned and unassigned items correctly', () => {
    const assigned = makeLineItem('item-1');
    const unassigned = makeLineItem('item-2');
    const result = partitionLineItemsByAssignment(
      [assigned, unassigned],
      [makeAssignment('item-1', 'p-1')],
    );
    expect(result.unassignedItems).toEqual([unassigned]);
    expect(result.assignedItems).toEqual([assigned]);
  });

  it('treats an item with an empty assignee list the same as no assignment row', () => {
    // setForLineItem(lineItemId, []) is a valid way to clear assignees back to
    // unassigned — groupAssignedParticipantIdsByLineItem never stores empty
    // arrays, but this guards the partition logic's own `.length === 0` checks.
    const item = makeLineItem('item-1');
    const result = partitionLineItemsByAssignment([item], []);
    expect(result.unassignedItems).toEqual([item]);
  });
});
