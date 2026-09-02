import { calculateSplit } from './splitCalculator';
import type { SplitCalculationInput } from './split.types';
import { buildShareText } from './shareText';
import type { ShareTextInput } from './shareText';

describe('buildShareText', () => {
  it("reproduces spec F-017's exact example output", () => {
    // Reconstructs the bill behind spec F-017's example: three participants
    // (Kemp, Alex, Jamie), four items — three solo, one ("Shared Nachos")
    // split three ways with no remainder — and two adjustments (a service
    // charge and VAT) allocated via CUSTOM amounts that reproduce the
    // spec's exact per-participant figures, including Jamie's zero share
    // of both adjustments (hand-verified against the spec text below).
    const splitInput: SplitCalculationInput = {
      participants: [
        { participantId: 'kemp' },
        { participantId: 'alex' },
        { participantId: 'jamie' },
      ],
      items: [
        { lineItemId: 'chicken', lineTotalCentavos: 32000, assigneeParticipantIds: ['kemp'] },
        { lineItemId: 'pasta', lineTotalCentavos: 26000, assigneeParticipantIds: ['alex'] },
        { lineItemId: 'salad', lineTotalCentavos: 21500, assigneeParticipantIds: ['jamie'] },
        {
          lineItemId: 'nachos',
          lineTotalCentavos: 30000,
          assigneeParticipantIds: ['kemp', 'alex', 'jamie'],
        },
      ],
      adjustments: [
        {
          adjustmentId: 'service',
          amountCentavos: 8050,
          allocationMethod: 'CUSTOM',
          customAllocations: [
            { participantId: 'kemp', amountCentavos: 5025 },
            { participantId: 'alex', amountCentavos: 3025 },
            { participantId: 'jamie', amountCentavos: 0 },
          ],
        },
        {
          adjustmentId: 'vat',
          amountCentavos: 7000,
          allocationMethod: 'CUSTOM',
          customAllocations: [
            { participantId: 'kemp', amountCentavos: 5000 },
            { participantId: 'alex', amountCentavos: 2000 },
            { participantId: 'jamie', amountCentavos: 0 },
          ],
        },
      ],
    };

    const splitResult = calculateSplit(splitInput);
    // Sanity-check the reconstruction actually matches the spec's headline
    // total before asserting on the rendered text.
    expect(splitResult.computedTotalCentavos).toBe(124550);

    const input: ShareTextInput = {
      billTitle: 'Dinner at Sample Restaurant',
      participants: [
        { participantId: 'kemp', name: 'Kemp' },
        { participantId: 'alex', name: 'Alex' },
        { participantId: 'jamie', name: 'Jamie' },
      ],
      items: [
        { lineItemId: 'chicken', name: 'Chicken Meal' },
        { lineItemId: 'pasta', name: 'Pasta' },
        { lineItemId: 'salad', name: 'Salad' },
        { lineItemId: 'nachos', name: 'Shared Nachos' },
      ],
      adjustments: [
        { adjustmentId: 'service', label: 'Service charge' },
        { adjustmentId: 'vat', label: 'VAT' },
      ],
      splitResult,
    };

    const expected = [
      'Splitsy — Dinner at Sample Restaurant',
      'Total: ₱1,245.50',
      '',
      'Kemp — ₱520.25',
      '• Chicken Meal — ₱320.00',
      '• Shared Nachos — ₱100.00',
      '• Service charge — ₱50.25',
      '• VAT — ₱50.00',
      '',
      'Alex — ₱410.25',
      '• Pasta — ₱260.00',
      '• Shared Nachos — ₱100.00',
      '• Service charge — ₱30.25',
      '• VAT — ₱20.00',
      '',
      'Jamie — ₱315.00',
      '• Salad — ₱215.00',
      '• Shared Nachos — ₱100.00',
      '',
      'Calculated with Splitsy.',
    ].join('\n');

    expect(buildShareText(input)).toBe(expected);
  });

  it('renders a single-participant bill', () => {
    const splitInput: SplitCalculationInput = {
      participants: [{ participantId: 'solo' }],
      items: [{ lineItemId: 'burger', lineTotalCentavos: 15000, assigneeParticipantIds: ['solo'] }],
      adjustments: [{ adjustmentId: 'tax', amountCentavos: 1800, allocationMethod: 'EQUAL' }],
    };
    const splitResult = calculateSplit(splitInput);

    const text = buildShareText({
      billTitle: 'Solo Lunch',
      participants: [{ participantId: 'solo', name: 'Kemp' }],
      items: [{ lineItemId: 'burger', name: 'Burger' }],
      adjustments: [{ adjustmentId: 'tax', label: 'Tax' }],
      splitResult,
    });

    expect(text).toBe(
      [
        'Splitsy — Solo Lunch',
        'Total: ₱168.00',
        '',
        'Kemp — ₱168.00',
        '• Burger — ₱150.00',
        '• Tax — ₱18.00',
        '',
        'Calculated with Splitsy.',
      ].join('\n'),
    );
  });

  it("shows each participant's partial share of an item split unevenly across them, not the full price", () => {
    // 1000 centavos across 3 people: base 333, remainder 1 -> first
    // participant (stable order) gets 334. No participant's line shows the
    // full 1000.
    const splitInput: SplitCalculationInput = {
      participants: [{ participantId: 'a' }, { participantId: 'b' }, { participantId: 'c' }],
      items: [
        { lineItemId: 'pizza', lineTotalCentavos: 1000, assigneeParticipantIds: ['a', 'b', 'c'] },
      ],
      adjustments: [],
    };
    const splitResult = calculateSplit(splitInput);

    const text = buildShareText({
      billTitle: 'Shared Pizza',
      participants: [
        { participantId: 'a', name: 'Ana' },
        { participantId: 'b', name: 'Bea' },
        { participantId: 'c', name: 'Cid' },
      ],
      items: [{ lineItemId: 'pizza', name: 'Pizza' }],
      adjustments: [],
      splitResult,
    });

    expect(text).toContain('Ana — ₱3.34\n• Pizza — ₱3.34');
    expect(text).toContain('Bea — ₱3.33\n• Pizza — ₱3.33');
    expect(text).toContain('Cid — ₱3.33\n• Pizza — ₱3.33');
    // No participant's bullet line ever shows the item's full ₱10.00 price
    // (only the header's bill total legitimately does).
    expect(text).not.toContain('• Pizza — ₱10.00');
  });

  it("shows an adjustment allocated equally across everyone as each participant's own share", () => {
    const splitInput: SplitCalculationInput = {
      participants: [{ participantId: 'a' }, { participantId: 'b' }],
      items: [{ lineItemId: 'meal', lineTotalCentavos: 2000, assigneeParticipantIds: ['a', 'b'] }],
      adjustments: [{ adjustmentId: 'tip', amountCentavos: 101, allocationMethod: 'EQUAL' }],
    };
    const splitResult = calculateSplit(splitInput);

    const text = buildShareText({
      billTitle: 'Coffee Run',
      participants: [
        { participantId: 'a', name: 'Ana' },
        { participantId: 'b', name: 'Bea' },
      ],
      items: [{ lineItemId: 'meal', name: 'Meal' }],
      adjustments: [{ adjustmentId: 'tip', label: 'Tip' }],
      splitResult,
    });

    // 101 split equally across 2: base 50, remainder 1 -> Ana (first in
    // stable order) gets 51, Bea gets 50.
    expect(text).toBe(
      [
        'Splitsy — Coffee Run',
        'Total: ₱21.01',
        '',
        'Ana — ₱10.51',
        '• Meal — ₱10.00',
        '• Tip — ₱0.51',
        '',
        'Bea — ₱10.50',
        '• Meal — ₱10.00',
        '• Tip — ₱0.50',
        '',
        'Calculated with Splitsy.',
      ].join('\n'),
    );
  });

  it("omits a participant's line entirely for an item/adjustment they have a zero share of", () => {
    // Jamie is assigned no item and has a CUSTOM adjustment amount of 0 —
    // neither should produce a bullet line, but Jamie's header line (at
    // ₱0.00) must still print.
    const splitInput: SplitCalculationInput = {
      participants: [{ participantId: 'kemp' }, { participantId: 'jamie' }],
      items: [{ lineItemId: 'steak', lineTotalCentavos: 50000, assigneeParticipantIds: ['kemp'] }],
      adjustments: [
        {
          adjustmentId: 'discount',
          amountCentavos: -5000,
          allocationMethod: 'CUSTOM',
          customAllocations: [
            { participantId: 'kemp', amountCentavos: -5000 },
            { participantId: 'jamie', amountCentavos: 0 },
          ],
        },
      ],
    };
    const splitResult = calculateSplit(splitInput);

    const text = buildShareText({
      billTitle: 'Steak Night',
      participants: [
        { participantId: 'kemp', name: 'Kemp' },
        { participantId: 'jamie', name: 'Jamie' },
      ],
      items: [{ lineItemId: 'steak', name: 'Steak' }],
      adjustments: [{ adjustmentId: 'discount', label: 'Loyalty discount' }],
      splitResult,
    });

    expect(text).toBe(
      [
        'Splitsy — Steak Night',
        'Total: ₱450.00',
        '',
        'Kemp — ₱450.00',
        '• Steak — ₱500.00',
        '• Loyalty discount — -₱50.00',
        '',
        'Jamie — ₱0.00',
        '',
        'Calculated with Splitsy.',
      ].join('\n'),
    );
    expect(text).not.toContain('Jamie — ₱0.00\n•');
  });

  it('appends a "Settle up" block when settlementTransactions is provided and non-empty', () => {
    const splitInput: SplitCalculationInput = {
      participants: [{ participantId: 'a' }, { participantId: 'b' }],
      items: [{ lineItemId: 'meal', lineTotalCentavos: 2000, assigneeParticipantIds: ['a', 'b'] }],
      adjustments: [],
    };
    const splitResult = calculateSplit(splitInput);

    const text = buildShareText({
      billTitle: 'Coffee Run',
      participants: [
        { participantId: 'a', name: 'Ana' },
        { participantId: 'b', name: 'Bea' },
      ],
      items: [{ lineItemId: 'meal', name: 'Meal' }],
      adjustments: [],
      splitResult,
      settlementTransactions: [
        { fromParticipantId: 'b', toParticipantId: 'a', amountCentavos: 1000 },
      ],
    });

    expect(text).toBe(
      [
        'Splitsy — Coffee Run',
        'Total: ₱20.00',
        '',
        'Ana — ₱10.00',
        '• Meal — ₱10.00',
        '',
        'Bea — ₱10.00',
        '• Meal — ₱10.00',
        '',
        'Settle up',
        'Bea owes Ana — ₱10.00',
        '',
        'Calculated with Splitsy.',
      ].join('\n'),
    );
  });

  it('omits the "Settle up" block entirely when settlementTransactions is undefined or empty', () => {
    const splitInput: SplitCalculationInput = {
      participants: [{ participantId: 'solo' }],
      items: [{ lineItemId: 'burger', lineTotalCentavos: 15000, assigneeParticipantIds: ['solo'] }],
      adjustments: [],
    };
    const splitResult = calculateSplit(splitInput);
    const baseInput: ShareTextInput = {
      billTitle: 'Solo Lunch',
      participants: [{ participantId: 'solo', name: 'Kemp' }],
      items: [{ lineItemId: 'burger', name: 'Burger' }],
      adjustments: [],
      splitResult,
    };

    const withoutField = buildShareText(baseInput);
    const withEmptyArray = buildShareText({ ...baseInput, settlementTransactions: [] });

    expect(withoutField).not.toContain('Settle up');
    expect(withEmptyArray).not.toContain('Settle up');
    expect(withEmptyArray).toBe(withoutField);
  });

  it("appends each participant's own \"Paid\" line when paidCentavos is provided", () => {
    const splitInput: SplitCalculationInput = {
      participants: [{ participantId: 'a' }, { participantId: 'b' }],
      items: [{ lineItemId: 'meal', lineTotalCentavos: 2000, assigneeParticipantIds: ['a', 'b'] }],
      adjustments: [],
    };
    const splitResult = calculateSplit(splitInput);

    const text = buildShareText({
      billTitle: 'Coffee Run',
      participants: [
        { participantId: 'a', name: 'Ana', paidCentavos: 2000 },
        { participantId: 'b', name: 'Bea', paidCentavos: 0 },
      ],
      items: [{ lineItemId: 'meal', name: 'Meal' }],
      adjustments: [],
      splitResult,
    });

    expect(text).toBe(
      [
        'Splitsy — Coffee Run',
        'Total: ₱20.00',
        '',
        'Ana — ₱10.00',
        '• Meal — ₱10.00',
        'Paid: ₱20.00',
        '',
        'Bea — ₱10.00',
        '• Meal — ₱10.00',
        'Paid: ₱0.00',
        '',
        'Calculated with Splitsy.',
      ].join('\n'),
    );
  });

  it('omits every "Paid" line when paidCentavos is not provided', () => {
    const splitInput: SplitCalculationInput = {
      participants: [{ participantId: 'solo' }],
      items: [{ lineItemId: 'burger', lineTotalCentavos: 15000, assigneeParticipantIds: ['solo'] }],
      adjustments: [],
    };
    const splitResult = calculateSplit(splitInput);

    const text = buildShareText({
      billTitle: 'Solo Lunch',
      participants: [{ participantId: 'solo', name: 'Kemp' }],
      items: [{ lineItemId: 'burger', name: 'Burger' }],
      adjustments: [],
      splitResult,
    });

    expect(text).not.toContain('Paid:');
  });

  it('throws when a participant display name is missing', () => {
    const splitResult = calculateSplit({
      participants: [{ participantId: 'ghost' }],
      items: [{ lineItemId: 'x', lineTotalCentavos: 100, assigneeParticipantIds: ['ghost'] }],
      adjustments: [],
    });

    expect(() =>
      buildShareText({
        billTitle: 'Missing Name',
        participants: [],
        items: [{ lineItemId: 'x', name: 'Item' }],
        adjustments: [],
        splitResult,
      }),
    ).toThrow();
  });
});
