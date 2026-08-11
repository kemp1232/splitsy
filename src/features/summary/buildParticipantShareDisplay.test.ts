import {
  buildParticipantAdjustmentShareDisplay,
  buildParticipantItemShareDisplay,
  type SummaryAdjustmentInfo,
  type SummaryItemInfo,
} from './buildParticipantShareDisplay';

describe('buildParticipantItemShareDisplay', () => {
  it('attaches the item name to each nonzero share', () => {
    const itemInfoById = new Map<string, SummaryItemInfo>([
      ['chicken', { name: 'Chicken Meal', assigneeCount: 1 }],
    ]);

    const result = buildParticipantItemShareDisplay(
      [{ lineItemId: 'chicken', amountCentavos: 32000 }],
      itemInfoById,
    );

    expect(result).toEqual([
      { lineItemId: 'chicken', name: 'Chicken Meal', amountCentavos: 32000, shared: false },
    ]);
  });

  it('flags an item as shared when it has more than one assignee', () => {
    const itemInfoById = new Map<string, SummaryItemInfo>([
      ['nachos', { name: 'Nachos', assigneeCount: 3 }],
    ]);

    const result = buildParticipantItemShareDisplay(
      [{ lineItemId: 'nachos', amountCentavos: 10000 }],
      itemInfoById,
    );

    expect(result[0]?.shared).toBe(true);
  });

  it('does not flag an item as shared when it has exactly one assignee', () => {
    const itemInfoById = new Map<string, SummaryItemInfo>([
      ['salad', { name: 'Salad', assigneeCount: 1 }],
    ]);

    const result = buildParticipantItemShareDisplay(
      [{ lineItemId: 'salad', amountCentavos: 21500 }],
      itemInfoById,
    );

    expect(result[0]?.shared).toBe(false);
  });

  it('omits shares that are exactly zero centavos', () => {
    const itemInfoById = new Map<string, SummaryItemInfo>([
      ['chicken', { name: 'Chicken Meal', assigneeCount: 1 }],
      ['salad', { name: 'Salad', assigneeCount: 1 }],
    ]);

    const result = buildParticipantItemShareDisplay(
      [
        { lineItemId: 'chicken', amountCentavos: 0 },
        { lineItemId: 'salad', amountCentavos: 21500 },
      ],
      itemInfoById,
    );

    expect(result).toEqual([
      { lineItemId: 'salad', name: 'Salad', amountCentavos: 21500, shared: false },
    ]);
  });

  it('preserves the input order of the (already nonzero) item shares', () => {
    const itemInfoById = new Map<string, SummaryItemInfo>([
      ['a', { name: 'A', assigneeCount: 1 }],
      ['b', { name: 'B', assigneeCount: 1 }],
    ]);

    const result = buildParticipantItemShareDisplay(
      [
        { lineItemId: 'b', amountCentavos: 100 },
        { lineItemId: 'a', amountCentavos: 200 },
      ],
      itemInfoById,
    );

    expect(result.map((row) => row.lineItemId)).toEqual(['b', 'a']);
  });

  it('throws when no item info was provided for a share', () => {
    expect(() =>
      buildParticipantItemShareDisplay([{ lineItemId: 'missing', amountCentavos: 100 }], new Map()),
    ).toThrow(/no item info provided for line item missing/);
  });
});

describe('buildParticipantAdjustmentShareDisplay', () => {
  it('attaches the adjustment label to each nonzero share', () => {
    const adjustmentInfoById = new Map<string, SummaryAdjustmentInfo>([
      ['service', { label: 'Service charge' }],
    ]);

    const result = buildParticipantAdjustmentShareDisplay(
      [{ adjustmentId: 'service', amountCentavos: 5025 }],
      adjustmentInfoById,
    );

    expect(result).toEqual([
      { adjustmentId: 'service', label: 'Service charge', amountCentavos: 5025 },
    ]);
  });

  it('omits shares that are exactly zero centavos', () => {
    const adjustmentInfoById = new Map<string, SummaryAdjustmentInfo>([
      ['service', { label: 'Service charge' }],
      ['vat', { label: 'VAT' }],
    ]);

    const result = buildParticipantAdjustmentShareDisplay(
      [
        { adjustmentId: 'service', amountCentavos: 0 },
        { adjustmentId: 'vat', amountCentavos: 5000 },
      ],
      adjustmentInfoById,
    );

    expect(result).toEqual([{ adjustmentId: 'vat', label: 'VAT', amountCentavos: 5000 }]);
  });

  it('throws when no adjustment info was provided for a share', () => {
    expect(() =>
      buildParticipantAdjustmentShareDisplay(
        [{ adjustmentId: 'missing', amountCentavos: 100 }],
        new Map(),
      ),
    ).toThrow(/no adjustment info provided for adjustment missing/);
  });
});
