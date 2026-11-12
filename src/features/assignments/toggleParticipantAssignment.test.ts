import type { ItemAssignment } from '@/db/repositories/itemAssignments.repository';

import {
  buildEqualSplitAssignmentRows,
  groupAssignmentRowsByLineItem,
  hasSameAssignments,
  hasSameIds,
  MAX_ITEM_SHARE_WEIGHT,
  mergeRefreshedAssignments,
  replaceLineItemAssignments,
  setLineItemAssigneeWeights,
  toggleParticipantId,
} from './toggleParticipantAssignment';

function makeAssignment(lineItemId: string, participantId: string, weight = 1): ItemAssignment {
  return { lineItemId, participantId, weight };
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

  it("keeps other assignees' share counts when someone is added, and gives the new one 1", () => {
    const weighted = [makeAssignment('item-1', 'p1', 3), makeAssignment('item-1', 'p2', 2)];
    expect(replaceLineItemAssignments(weighted, 'item-1', ['p1', 'p2', 'p3'])).toEqual([
      makeAssignment('item-1', 'p1', 3),
      makeAssignment('item-1', 'p2', 2),
      makeAssignment('item-1', 'p3', 1),
    ]);
  });

  it('drops a removed assignee and keeps the remaining share counts', () => {
    const weighted = [
      makeAssignment('item-1', 'p1', 3),
      makeAssignment('item-1', 'p2', 2),
      makeAssignment('item-1', 'p3', 4),
      makeAssignment('item-2', 'p1', 4),
    ];
    expect(replaceLineItemAssignments(weighted, 'item-1', ['p1', 'p2'])).toEqual([
      makeAssignment('item-2', 'p1', 4),
      makeAssignment('item-1', 'p1', 3),
      makeAssignment('item-1', 'p2', 2),
    ]);
  });

  it('resets a lone remaining assignee to 1, so the next person added splits equally', () => {
    const weighted = [makeAssignment('item-1', 'p1', 3), makeAssignment('item-1', 'p2', 1)];
    const alone = replaceLineItemAssignments(weighted, 'item-1', ['p1']);
    expect(alone).toEqual([makeAssignment('item-1', 'p1', 1)]);
    expect(replaceLineItemAssignments(alone, 'item-1', ['p1', 'p3'])).toEqual([
      makeAssignment('item-1', 'p1', 1),
      makeAssignment('item-1', 'p3', 1),
    ]);
  });

  it('reduces equal non-1 counts before adding someone (2,2 + new -> 1,1,1)', () => {
    const weighted = [makeAssignment('item-1', 'p1', 2), makeAssignment('item-1', 'p2', 2)];
    expect(replaceLineItemAssignments(weighted, 'item-1', ['p1', 'p2', 'p3'])).toEqual([
      makeAssignment('item-1', 'p1', 1),
      makeAssignment('item-1', 'p2', 1),
      makeAssignment('item-1', 'p3', 1),
    ]);
  });

  it('uses explicit weights over existing ones (reverting to persisted rows)', () => {
    const weighted = [makeAssignment('item-1', 'p1', 3), makeAssignment('item-1', 'p2', 2)];
    expect(
      replaceLineItemAssignments(
        weighted,
        'item-1',
        ['p1', 'p2'],
        new Map([
          ['p1', 1],
          ['p2', 2],
        ]),
      ),
    ).toEqual([makeAssignment('item-1', 'p1', 1), makeAssignment('item-1', 'p2', 2)]);
  });
});

describe('setLineItemAssigneeWeights', () => {
  const rows = [
    makeAssignment('item-1', 'p1'),
    makeAssignment('item-1', 'p2'),
    makeAssignment('item-2', 'p1'),
  ];

  it("sets one item's share counts and leaves other items untouched", () => {
    expect(
      setLineItemAssigneeWeights(
        rows,
        'item-1',
        new Map([
          ['p1', 3],
          ['p2', 2],
        ]),
      ),
    ).toEqual([
      makeAssignment('item-1', 'p1', 3),
      makeAssignment('item-1', 'p2', 2),
      makeAssignment('item-2', 'p1'),
    ]);
    expect(rows[0]?.weight).toBe(1);
  });

  it('clamps share counts to whole numbers from 1 to the maximum', () => {
    const next = setLineItemAssigneeWeights(
      rows,
      'item-1',
      new Map([
        ['p1', 0],
        ['p2', 150],
      ]),
    );
    expect(next.slice(0, 2).map((row) => row.weight)).toEqual([1, MAX_ITEM_SHARE_WEIGHT]);
    expect(
      setLineItemAssigneeWeights(
        rows,
        'item-1',
        new Map([
          ['p1', -5],
          ['p2', 2.7],
        ]),
      )
        .slice(0, 2)
        .map((row) => row.weight),
    ).toEqual([1, 2]);
  });

  it('ignores participants not assigned to the item', () => {
    const next = setLineItemAssigneeWeights(
      rows,
      'item-2',
      new Map([
        ['p2', 4],
        ['ghost', 4],
      ]),
    );
    expect(next).toBe(rows);
    expect(next).toHaveLength(3);
  });

  it('returns the same rows when nothing changes', () => {
    expect(setLineItemAssigneeWeights(rows, 'item-1', new Map([['p1', 1]]))).toBe(rows);
  });

  it('reduces counts to lowest terms (2,2 -> 1,1 and 4,2 -> 2,1)', () => {
    expect(
      setLineItemAssigneeWeights(
        rows,
        'item-1',
        new Map([
          ['p1', 2],
          ['p2', 2],
        ]),
      ),
    ).toBe(rows);
    expect(
      setLineItemAssigneeWeights(
        rows,
        'item-1',
        new Map([
          ['p1', 4],
          ['p2', 2],
        ]),
      )
        .slice(0, 2)
        .map((row) => row.weight),
    ).toEqual([2, 1]);
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

describe('hasSameAssignments', () => {
  it('compares assignees and share counts regardless of order', () => {
    expect(
      hasSameAssignments(
        [makeAssignment('item-1', 'p1', 3), makeAssignment('item-1', 'p2')],
        [makeAssignment('item-1', 'p2'), makeAssignment('item-1', 'p1', 3)],
      ),
    ).toBe(true);
  });

  it('detects a share-count-only change', () => {
    expect(
      hasSameAssignments([makeAssignment('item-1', 'p1', 2)], [makeAssignment('item-1', 'p1')]),
    ).toBe(false);
  });

  it('detects added or removed assignees', () => {
    expect(
      hasSameAssignments(
        [makeAssignment('item-1', 'p1')],
        [makeAssignment('item-1', 'p1'), makeAssignment('item-1', 'p2')],
      ),
    ).toBe(false);
  });
});

describe('groupAssignmentRowsByLineItem', () => {
  it('groups whole rows (weights included) by line item', () => {
    const grouped = groupAssignmentRowsByLineItem([
      makeAssignment('item-1', 'p1', 3),
      makeAssignment('item-2', 'p1'),
      makeAssignment('item-1', 'p2', 2),
    ]);
    expect(grouped.get('item-1')).toEqual([
      makeAssignment('item-1', 'p1', 3),
      makeAssignment('item-1', 'p2', 2),
    ]);
    expect(grouped.get('item-2')).toEqual([makeAssignment('item-2', 'p1')]);
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
