import {
  mergeBillToTripMapping,
  planBillToTripMove,
  suggestBillToTripMapping,
  validateBillToTripMapping,
} from './buildBillToTripMapping';

const roster = [
  { id: 'tp-ana', name: 'Ana' },
  { id: 'tp-ben', name: 'Ben' },
];

describe('suggestBillToTripMapping', () => {
  it('suggests the roster member whose name matches after trim/case', () => {
    const mapping = suggestBillToTripMapping(
      [
        { id: 'p1', name: '  ana ' },
        { id: 'p2', name: 'BEN' },
      ],
      roster,
    );
    expect(mapping).toEqual({
      p1: { kind: 'existing', tripParticipantId: 'tp-ana' },
      p2: { kind: 'existing', tripParticipantId: 'tp-ben' },
    });
  });

  it('suggests Add to trip when no name matches', () => {
    expect(suggestBillToTripMapping([{ id: 'p1', name: 'Cara' }], roster)).toEqual({
      p1: { kind: 'new' },
    });
    expect(suggestBillToTripMapping([{ id: 'p1', name: 'Ana' }], [])).toEqual({
      p1: { kind: 'new' },
    });
  });

  it('never suggests the same roster member twice', () => {
    const mapping = suggestBillToTripMapping(
      [
        { id: 'p1', name: 'Ana' },
        { id: 'p2', name: 'ana' },
      ],
      roster,
    );
    expect(mapping).toEqual({
      p1: { kind: 'existing', tripParticipantId: 'tp-ana' },
      p2: { kind: 'new' },
    });
  });
});

describe('validateBillToTripMapping', () => {
  const participants = [
    { id: 'p1', name: 'Ana' },
    { id: 'p2', name: 'Cara' },
  ];

  it('accepts a complete mapping', () => {
    expect(
      validateBillToTripMapping(participants, roster, {
        p1: { kind: 'existing', tripParticipantId: 'tp-ana' },
        p2: { kind: 'new' },
      }),
    ).toEqual({ valid: true });
  });

  it('accepts an empty bill', () => {
    expect(validateBillToTripMapping([], roster, {})).toEqual({ valid: true });
  });

  it('rejects an unmapped participant', () => {
    expect(
      validateBillToTripMapping(participants, roster, {
        p1: { kind: 'existing', tripParticipantId: 'tp-ana' },
      }),
    ).toEqual({ valid: false, reason: 'unmapped', participantId: 'p2' });
  });

  it('rejects a mapping entry for someone no longer on the bill', () => {
    expect(
      validateBillToTripMapping(participants, roster, {
        p1: { kind: 'existing', tripParticipantId: 'tp-ana' },
        p2: { kind: 'new' },
        gone: { kind: 'new' },
      }),
    ).toEqual({ valid: false, reason: 'unmapped', participantId: 'gone' });
  });

  it('rejects a member id not in the active roster', () => {
    expect(
      validateBillToTripMapping(participants, roster, {
        p1: { kind: 'existing', tripParticipantId: 'tp-removed' },
        p2: { kind: 'new' },
      }),
    ).toEqual({ valid: false, reason: 'unknownMember', participantId: 'p1' });
  });

  it('rejects one member used for two participants', () => {
    expect(
      validateBillToTripMapping(participants, roster, {
        p1: { kind: 'existing', tripParticipantId: 'tp-ben' },
        p2: { kind: 'existing', tripParticipantId: 'tp-ben' },
      }),
    ).toEqual({ valid: false, reason: 'memberUsedTwice', participantId: 'p2' });
  });

  it('rejects a new person whose name is already on the roster', () => {
    expect(
      validateBillToTripMapping(participants, roster, {
        p1: { kind: 'new' },
        p2: { kind: 'new' },
      }),
    ).toEqual({ valid: false, reason: 'invalidNewName', participantId: 'p1' });
  });

  it('rejects two new people with the same name', () => {
    expect(
      validateBillToTripMapping(
        [
          { id: 'p1', name: 'Cara' },
          { id: 'p2', name: 'cara ' },
        ],
        roster,
        { p1: { kind: 'new' }, p2: { kind: 'new' } },
      ),
    ).toEqual({ valid: false, reason: 'invalidNewName', participantId: 'p2' });
  });
});

describe('mergeBillToTripMapping', () => {
  it('keeps still-valid choices when re-suggesting after a change', () => {
    const merged = mergeBillToTripMapping(
      {
        // Manual choice that differs from the name suggestion — kept.
        p1: { kind: 'existing', tripParticipantId: 'tp-ben' },
        p2: { kind: 'new' },
        gone: { kind: 'new' },
      },
      [
        { id: 'p1', name: 'Ana' },
        { id: 'p2', name: 'Cara' },
        // Added to the bill since the screen loaded — gets a suggestion.
        { id: 'p3', name: 'ana' },
      ],
      roster,
    );
    expect(merged).toEqual({
      p1: { kind: 'existing', tripParticipantId: 'tp-ben' },
      p2: { kind: 'new' },
      p3: { kind: 'existing', tripParticipantId: 'tp-ana' },
    });
  });

  it('drops a choice whose member was removed', () => {
    const merged = mergeBillToTripMapping(
      { p1: { kind: 'existing', tripParticipantId: 'tp-gone' } },
      [{ id: 'p1', name: 'Ben' }],
      roster,
    );
    expect(merged).toEqual({ p1: { kind: 'existing', tripParticipantId: 'tp-ben' } });
  });

  it('drops a new-person choice whose name is now on the roster', () => {
    const merged = mergeBillToTripMapping(
      { p1: { kind: 'new' } },
      [{ id: 'p1', name: 'Ana' }],
      roster,
    );
    expect(merged).toEqual({ p1: { kind: 'existing', tripParticipantId: 'tp-ana' } });
  });
});

describe('planBillToTripMove', () => {
  const baseState = {
    bill: { id: 'b1', tripId: null },
    trip: { id: 't1', status: 'ACTIVE' as const },
    paidMarkCount: 0,
    participants: [{ id: 'p1', name: 'Dee' }],
  };

  it('reactivates the lowest-sortOrder deactivated member with the same name', () => {
    const plan = planBillToTripMove(
      {
        ...baseState,
        roster: [
          { id: 'tp-dee-late', name: 'dee', sortOrder: 7, isActive: false },
          { id: 'tp-dee-early', name: 'Dee', sortOrder: 2, isActive: false },
          { id: 'tp-ana', name: 'Ana', sortOrder: 0, isActive: true },
        ],
      },
      { p1: { kind: 'new' } },
    );
    expect(plan.reactivateMemberIds).toEqual(['tp-dee-early']);
    expect(plan.links).toEqual([{ participantId: 'p1', tripParticipantId: 'tp-dee-early' }]);
    expect(plan.newMembers).toEqual([]);
  });

  it('creates a new member when no deactivated member has the name', () => {
    const plan = planBillToTripMove(
      { ...baseState, roster: [{ id: 'tp-x', name: 'Xu', sortOrder: 3, isActive: false }] },
      { p1: { kind: 'new' } },
    );
    expect(plan.reactivateMemberIds).toEqual([]);
    expect(plan.newMembers).toEqual([{ participantId: 'p1', name: 'Dee', sortOrder: 4 }]);
  });
});
