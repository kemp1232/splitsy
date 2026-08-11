import type { AdjustmentAllocation } from '@/db/repositories/adjustmentAllocations.repository';
import type { Adjustment } from '@/db/repositories/adjustments.repository';
import type { ItemAssignment } from '@/db/repositories/itemAssignments.repository';
import type { LineItem } from '@/db/repositories/lineItems.repository';

import { buildSplitAdjustments, buildSplitLineItems } from './buildSplitInputs';

function makeLineItem(id: string, lineTotalCentavos: number): LineItem {
  return {
    id,
    billId: 'bill-1',
    sortOrder: 0,
    name: `Item ${id}`,
    quantity: 1,
    unitPriceCentavos: null,
    lineTotalCentavos,
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

function makeAdjustment(
  id: string,
  amountCentavos: number,
  allocationMethod: Adjustment['allocationMethod'],
): Adjustment {
  return {
    id,
    billId: 'bill-1',
    sortOrder: 0,
    type: 'OTHER',
    label: `Adjustment ${id}`,
    amountCentavos,
    allocationMethod,
    source: 'MANUAL',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function makeAllocation(
  adjustmentId: string,
  participantId: string,
  amountCentavos: number,
): AdjustmentAllocation {
  return { adjustmentId, participantId, amountCentavos };
}

describe('buildSplitLineItems', () => {
  it('returns an empty array for no items', () => {
    expect(buildSplitLineItems([], [])).toEqual([]);
  });

  it('attaches every assignee to its line item, in assignment-row order', () => {
    const item = makeLineItem('item-1', 1000);
    const result = buildSplitLineItems(
      [item],
      [makeAssignment('item-1', 'p-1'), makeAssignment('item-1', 'p-2')],
    );
    expect(result).toEqual([
      { lineItemId: 'item-1', lineTotalCentavos: 1000, assigneeParticipantIds: ['p-1', 'p-2'] },
    ]);
  });

  it('gives an item with no assignment rows an empty assignee list rather than dropping it', () => {
    const item = makeLineItem('item-1', 1000);
    const result = buildSplitLineItems([item], []);
    expect(result).toEqual([
      { lineItemId: 'item-1', lineTotalCentavos: 1000, assigneeParticipantIds: [] },
    ]);
  });

  it('preserves the input items order and only matches assignments by id', () => {
    const item1 = makeLineItem('item-1', 500);
    const item2 = makeLineItem('item-2', 700);
    const result = buildSplitLineItems(
      [item1, item2],
      [makeAssignment('item-2', 'p-1'), makeAssignment('item-1', 'p-2')],
    );
    expect(result).toEqual([
      { lineItemId: 'item-1', lineTotalCentavos: 500, assigneeParticipantIds: ['p-2'] },
      { lineItemId: 'item-2', lineTotalCentavos: 700, assigneeParticipantIds: ['p-1'] },
    ]);
  });
});

describe('buildSplitAdjustments', () => {
  it('returns an empty array for no adjustments', () => {
    expect(buildSplitAdjustments([], new Map())).toEqual([]);
  });

  it('leaves customAllocations undefined for PROPORTIONAL and EQUAL adjustments', () => {
    const proportional = makeAdjustment('adj-1', 1000, 'PROPORTIONAL');
    const equal = makeAdjustment('adj-2', 500, 'EQUAL');
    const result = buildSplitAdjustments([proportional, equal], new Map());
    expect(result).toEqual([
      {
        adjustmentId: 'adj-1',
        amountCentavos: 1000,
        allocationMethod: 'PROPORTIONAL',
        customAllocations: undefined,
      },
      {
        adjustmentId: 'adj-2',
        amountCentavos: 500,
        allocationMethod: 'EQUAL',
        customAllocations: undefined,
      },
    ]);
  });

  it('attaches stored allocations for a CUSTOM adjustment', () => {
    const custom = makeAdjustment('adj-1', 1000, 'CUSTOM');
    const byAdjustmentId = new Map([
      ['adj-1', [makeAllocation('adj-1', 'p-1', 600), makeAllocation('adj-1', 'p-2', 400)]],
    ]);
    const result = buildSplitAdjustments([custom], byAdjustmentId);
    expect(result).toEqual([
      {
        adjustmentId: 'adj-1',
        amountCentavos: 1000,
        allocationMethod: 'CUSTOM',
        customAllocations: [
          { participantId: 'p-1', amountCentavos: 600 },
          { participantId: 'p-2', amountCentavos: 400 },
        ],
      },
    ]);
  });

  it('gives a CUSTOM adjustment with no stored rows yet an empty allocations array, not undefined', () => {
    const custom = makeAdjustment('adj-1', 1000, 'CUSTOM');
    const result = buildSplitAdjustments([custom], new Map());
    expect(result[0]?.customAllocations).toEqual([]);
  });
});
