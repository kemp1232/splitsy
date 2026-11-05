import type { ItemAssignment } from '@/db/repositories/itemAssignments.repository';

import {
  buildEqualSplitAssignmentRows,
  hasSameIds,
  mergeRefreshedAssignments,
  replaceLineItemAssignments,
  toggleParticipantId,
} from './toggleParticipantAssignment';

function makeAssignment(lineItemId: string, participantId: string): ItemAssignment {
  return { lineItemId, participantId, weight: 1 };
}

const ORDER = ['p1', 'p2', 'p3'];

describe('toggleParticipantId', () => {
  it('adds a participant in participant order regardless of tap order', () => {
    expect(toggleParticipantId(['p3'], 'p1', ORDER)).toEqual(['p1', 'p3']);
    expect(toggleParticipantId(['p3', 'p1'], 'p2', ORDER)).toEqual(['p1', 'p2', 'p3']);
  });

  it('removes a participant that is already assigned', () => {
    expect(toggleParticipantId(['p1', 'p2'], 'p1', ORDER)).toEqual(['p2']);
  });

  it('returns an empty list when the last participant is removed', () => {
    expect(toggleParticipantId(['p2'], 'p2', ORDER)).toEqual([]);
  });

  it('ignores an unknown participant id', () => {
    expect(toggleParticipantId(['p2', 'p1'], 'ghost', ORDER)).toEqual(['p1', 'p2']);
  });

  it('drops stale ids that are no longer current participants', () => {
    expect(toggleParticipantId(['gone', 'p1'], 'p3', ORDER)).toEqual(['p1', 'p3']);
  });

  it('does not mutate its input', () => {
    const ids = ['p1'];
    toggleParticipantId(ids, 'p2', ORDER);
    expect(ids).toEqual(['p1']);
  });
});

describe('replaceLineItemAssignments', () => {
  const rows = [
    makeAssignment('item-1', 'p1'),
    makeAssignment('item-2', 'p2'),
    makeAssignment('item-1', 'p2'),
  ];

  it('replaces only the target line item and leaves other items untouched', () => {
    const next = replaceLineItemAssignments(rows, 'item-1', ['p3']);
    expect(next).toEqual([makeAssignment('item-2', 'p2'), makeAssignment('item-1', 'p3')]);
    expect(rows).toHaveLength(3);
  });

  it('removes every row for the item when given an empty list', () => {
    expect(replaceLineItemAssignments(rows, 'item-1', [])).toEqual([
      makeAssignment('item-2', 'p2'),
    ]);
  });

  it('writes new rows with weight 1', () => {
    const next = replaceLineItemAssignments([], 'item-9', ['p1', 'p2']);
    expect(next.every((row) => row.weight === 1)).toBe(true);
  });
});

describe('buildEqualSplitAssignmentRows', () => {
  it('assigns every line item to every participant with weight 1', () => {
    expect(buildEqualSplitAssignmentRows(['item-1', 'item-2'], ['p1', 'p2'])).toEqual([
      makeAssignment('item-1', 'p1'),
      makeAssignment('item-1', 'p2'),
      makeAssignment('item-2', 'p1'),
      makeAssignment('item-2', 'p2'),
    ]);
  });

  it('returns no rows when there are no participants or no items', () => {
    expect(buildEqualSplitAssignmentRows(['item-1'], [])).toEqual([]);
    expect(buildEqualSplitAssignmentRows([], ['p1'])).toEqual([]);
  });
});

describe('hasSameIds', () => {
  it('compares ids regardless of order', () => {
    expect(hasSameIds(['p1', 'p2'], ['p2', 'p1'])).toBe(true);
  });

  it('detects added or removed ids', () => {
    expect(hasSameIds(['p1'], ['p1', 'p2'])).toBe(false);
    expect(hasSameIds(['p1', 'p3'], ['p1', 'p2'])).toBe(false);
    expect(hasSameIds([], [])).toBe(true);
  });
});

describe('mergeRefreshedAssignments', () => {
  it('keeps local rows for dirty items and takes DB rows for clean items', () => {
    const dbRows = [makeAssignment('item-1', 'p1'), makeAssignment('item-2', 'p1')];
    const localRows = [makeAssignment('item-1', 'p9'), makeAssignment('item-2', 'p2')];

    const merged = mergeRefreshedAssignments(dbRows, localRows, new Set(['item-2']));

    expect(merged).toEqual([makeAssignment('item-1', 'p1'), makeAssignment('item-2', 'p2')]);
  });

  it('keeps a dirty item unassigned locally even if the DB still has rows for it', () => {
    const dbRows = [makeAssignment('item-1', 'p1')];
    expect(mergeRefreshedAssignments(dbRows, [], new Set(['item-1']))).toEqual([]);
  });
});
