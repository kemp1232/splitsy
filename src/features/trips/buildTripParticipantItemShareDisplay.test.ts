import {
  buildTripParticipantItemShareDisplay,
  type TripItemInfo,
} from './buildTripParticipantItemShareDisplay';

describe('buildTripParticipantItemShareDisplay', () => {
  it('attaches the item name and an empty sharedWithNames when solely assigned', () => {
    const itemInfoById = new Map<string, TripItemInfo>([
      ['chicken', { name: 'Chicken Meal', assigneeParticipantIds: ['alex'] }],
    ]);
    const nameByParticipantId = new Map([['alex', 'Alex']]);

    const result = buildTripParticipantItemShareDisplay(
      'alex',
      [{ lineItemId: 'chicken', amountCentavos: 32000 }],
      itemInfoById,
      nameByParticipantId,
    );

    expect(result).toEqual([
      {
        lineItemId: 'chicken',
        name: 'Chicken Meal',
        amountCentavos: 32000,
        sharedWithNames: [],
      },
    ]);
  });

  it('names every other assignee on a shared item, excluding the participant themself', () => {
    const itemInfoById = new Map<string, TripItemInfo>([
      ['nachos', { name: 'Nachos', assigneeParticipantIds: ['alex', 'sam', 'jo'] }],
    ]);
    const nameByParticipantId = new Map([
      ['alex', 'Alex'],
      ['sam', 'Sam'],
      ['jo', 'Jo'],
    ]);

    const result = buildTripParticipantItemShareDisplay(
      'alex',
      [{ lineItemId: 'nachos', amountCentavos: 10000 }],
      itemInfoById,
      nameByParticipantId,
    );

    expect(result[0]?.sharedWithNames).toEqual(['Sam', 'Jo']);
  });

  it('preserves assignment order of co-assignee names', () => {
    const itemInfoById = new Map<string, TripItemInfo>([
      ['nachos', { name: 'Nachos', assigneeParticipantIds: ['jo', 'alex', 'sam'] }],
    ]);
    const nameByParticipantId = new Map([
      ['alex', 'Alex'],
      ['sam', 'Sam'],
      ['jo', 'Jo'],
    ]);

    const result = buildTripParticipantItemShareDisplay(
      'alex',
      [{ lineItemId: 'nachos', amountCentavos: 10000 }],
      itemInfoById,
      nameByParticipantId,
    );

    expect(result[0]?.sharedWithNames).toEqual(['Jo', 'Sam']);
  });

  it('omits shares that are exactly zero centavos', () => {
    const itemInfoById = new Map<string, TripItemInfo>([
      ['chicken', { name: 'Chicken Meal', assigneeParticipantIds: ['alex'] }],
      ['salad', { name: 'Salad', assigneeParticipantIds: ['alex'] }],
    ]);
    const nameByParticipantId = new Map([['alex', 'Alex']]);

    const result = buildTripParticipantItemShareDisplay(
      'alex',
      [
        { lineItemId: 'chicken', amountCentavos: 0 },
        { lineItemId: 'salad', amountCentavos: 21500 },
      ],
      itemInfoById,
      nameByParticipantId,
    );

    expect(result).toEqual([
      { lineItemId: 'salad', name: 'Salad', amountCentavos: 21500, sharedWithNames: [] },
    ]);
  });

  it('preserves the input order of the (already nonzero) item shares', () => {
    const itemInfoById = new Map<string, TripItemInfo>([
      ['a', { name: 'A', assigneeParticipantIds: ['alex'] }],
      ['b', { name: 'B', assigneeParticipantIds: ['alex'] }],
    ]);
    const nameByParticipantId = new Map([['alex', 'Alex']]);

    const result = buildTripParticipantItemShareDisplay(
      'alex',
      [
        { lineItemId: 'b', amountCentavos: 100 },
        { lineItemId: 'a', amountCentavos: 200 },
      ],
      itemInfoById,
      nameByParticipantId,
    );

    expect(result.map((row) => row.lineItemId)).toEqual(['b', 'a']);
  });

  it('throws when no item info was provided for a share', () => {
    expect(() =>
      buildTripParticipantItemShareDisplay(
        'alex',
        [{ lineItemId: 'missing', amountCentavos: 100 }],
        new Map(),
        new Map(),
      ),
    ).toThrow(/no item info provided for line item missing/);
  });
});
