import { calculateSplit, assertSplitInvariant, SplitInvariantError } from './splitCalculator';
import type { SplitCalculationInput, SplitCalculationResult } from './split.types';

describe('calculateSplit', () => {
  it('computes item subtotals, adjustment shares, and final totals for a small multi-participant bill', () => {
    // Three participants (stable order A, B, C), three items (one solo, two
    // shared with a remainder), and three adjustments covering all three
    // allocation methods including a CUSTOM discount — hand-verified below.
    const input: SplitCalculationInput = {
      participants: [{ participantId: 'A' }, { participantId: 'B' }, { participantId: 'C' }],
      items: [
        { lineItemId: 'item1', lineTotalCentavos: 1000, assigneeParticipantIds: ['A'] },
        { lineItemId: 'item2', lineTotalCentavos: 1000, assigneeParticipantIds: ['A', 'B', 'C'] },
        { lineItemId: 'item3', lineTotalCentavos: 500, assigneeParticipantIds: ['B', 'C'] },
      ],
      adjustments: [
        { adjustmentId: 'tax', amountCentavos: 250, allocationMethod: 'PROPORTIONAL' },
        { adjustmentId: 'service', amountCentavos: 91, allocationMethod: 'EQUAL' },
        {
          adjustmentId: 'discount',
          amountCentavos: -100,
          allocationMethod: 'CUSTOM',
          customAllocations: [
            { participantId: 'A', amountCentavos: -40 },
            { participantId: 'B', amountCentavos: -30 },
            { participantId: 'C', amountCentavos: -30 },
          ],
        },
      ],
    };

    const result = calculateSplit(input);

    // Item subtotals: A = 1000 (solo) + 334 (item2 share of 1000/3) = 1334.
    // B = C = 333 (item2 share) + 250 (item3 share of 500/2) = 583.
    expect(result.itemSubtotalCentavos).toBe(2500);
    // Adjustment total: 250 (tax) + 91 (service) - 100 (discount) = 241.
    expect(result.adjustmentTotalCentavos).toBe(241);
    expect(result.computedTotalCentavos).toBe(2741);

    const byId = new Map(result.participantShares.map((share) => [share.participantId, share]));

    // Tax (proportional to 1334/583/583 of 250): A=134, B=58, C=58 (A gets
    // the single leftover centavo — largest remainder).
    // Service (equal split of 91 across 3): A=31 (leftover centavo, stable
    // order), B=30, C=30.
    // Discount (custom, stored as-is): A=-40, B=-30, C=-30.
    expect(byId.get('A')).toEqual({
      participantId: 'A',
      itemShares: [
        { lineItemId: 'item1', amountCentavos: 1000 },
        { lineItemId: 'item2', amountCentavos: 334 },
      ],
      adjustmentShares: [
        { adjustmentId: 'tax', amountCentavos: 134 },
        { adjustmentId: 'service', amountCentavos: 31 },
        { adjustmentId: 'discount', amountCentavos: -40 },
      ],
      itemSubtotalCentavos: 1334,
      adjustmentTotalCentavos: 125,
      finalTotalCentavos: 1459,
    });
    expect(byId.get('B')).toEqual({
      participantId: 'B',
      itemShares: [
        { lineItemId: 'item2', amountCentavos: 333 },
        { lineItemId: 'item3', amountCentavos: 250 },
      ],
      adjustmentShares: [
        { adjustmentId: 'tax', amountCentavos: 58 },
        { adjustmentId: 'service', amountCentavos: 30 },
        { adjustmentId: 'discount', amountCentavos: -30 },
      ],
      itemSubtotalCentavos: 583,
      adjustmentTotalCentavos: 58,
      finalTotalCentavos: 641,
    });
    expect(byId.get('C')).toEqual({
      participantId: 'C',
      itemShares: [
        { lineItemId: 'item2', amountCentavos: 333 },
        { lineItemId: 'item3', amountCentavos: 250 },
      ],
      adjustmentShares: [
        { adjustmentId: 'tax', amountCentavos: 58 },
        { adjustmentId: 'service', amountCentavos: 30 },
        { adjustmentId: 'discount', amountCentavos: -30 },
      ],
      itemSubtotalCentavos: 583,
      adjustmentTotalCentavos: 58,
      finalTotalCentavos: 641,
    });

    // The new itemized arrays must sum to the existing aggregate fields for
    // every participant — the additive invariant this task calls out
    // explicitly, checked directly rather than only implied by the equality
    // checks above.
    for (const share of result.participantShares) {
      const sumOfItemShares = share.itemShares.reduce((sum, s) => sum + s.amountCentavos, 0);
      const sumOfAdjustmentShares = share.adjustmentShares.reduce(
        (sum, s) => sum + s.amountCentavos,
        0,
      );
      expect(sumOfItemShares).toBe(share.itemSubtotalCentavos);
      expect(sumOfAdjustmentShares).toBe(share.adjustmentTotalCentavos);
    }

    // Spec 10.7: sum of every participant's final total must equal the
    // computed bill total — checked end-to-end here, not just per-function.
    const sumOfFinalTotals = result.participantShares.reduce(
      (sum, share) => sum + share.finalTotalCentavos,
      0,
    );
    expect(sumOfFinalTotals).toBe(result.computedTotalCentavos);
    expect(() => assertSplitInvariant(result)).not.toThrow();
  });

  it('handles a bill with no adjustments', () => {
    const input: SplitCalculationInput = {
      participants: [{ participantId: 'A' }, { participantId: 'B' }],
      items: [{ lineItemId: 'item1', lineTotalCentavos: 999, assigneeParticipantIds: ['A', 'B'] }],
      adjustments: [],
    };

    const result = calculateSplit(input);
    expect(result.computedTotalCentavos).toBe(999);
    const sumOfFinalTotals = result.participantShares.reduce(
      (sum, share) => sum + share.finalTotalCentavos,
      0,
    );
    expect(sumOfFinalTotals).toBe(999);
  });

  it('falls back to an equal proportional split when no items have been assigned yet', () => {
    // Spec 10.5's zero-subtotal fallback surfaced through the full
    // orchestrator: a PROPORTIONAL adjustment with nobody having any item
    // subtotal splits equally instead of dividing by zero.
    const input: SplitCalculationInput = {
      participants: [{ participantId: 'A' }, { participantId: 'B' }],
      items: [],
      adjustments: [{ adjustmentId: 'tip', amountCentavos: 101, allocationMethod: 'PROPORTIONAL' }],
    };

    const result = calculateSplit(input);
    const byId = new Map(result.participantShares.map((share) => [share.participantId, share]));
    expect(byId.get('A')?.adjustmentTotalCentavos).toBe(51);
    expect(byId.get('B')?.adjustmentTotalCentavos).toBe(50);
    expect(result.computedTotalCentavos).toBe(101);
  });

  it('throws when a line item is assigned to a participant not in the participants list', () => {
    const input: SplitCalculationInput = {
      participants: [{ participantId: 'A' }],
      items: [{ lineItemId: 'item1', lineTotalCentavos: 100, assigneeParticipantIds: ['ghost'] }],
      adjustments: [],
    };
    expect(() => calculateSplit(input)).toThrow();
  });

  it('throws when a CUSTOM adjustment has no stored allocations', () => {
    const input: SplitCalculationInput = {
      participants: [{ participantId: 'A' }, { participantId: 'B' }],
      items: [{ lineItemId: 'item1', lineTotalCentavos: 100, assigneeParticipantIds: ['A', 'B'] }],
      adjustments: [{ adjustmentId: 'custom1', amountCentavos: 50, allocationMethod: 'CUSTOM' }],
    };
    expect(() => calculateSplit(input)).toThrow();
  });
});

describe('assertSplitInvariant', () => {
  it('throws a SplitInvariantError when participant final totals do not sum to the computed total', () => {
    const brokenResult: SplitCalculationResult = {
      participantShares: [
        {
          participantId: 'A',
          itemShares: [{ lineItemId: 'item1', amountCentavos: 100 }],
          adjustmentShares: [],
          itemSubtotalCentavos: 100,
          adjustmentTotalCentavos: 0,
          finalTotalCentavos: 100,
        },
      ],
      itemSubtotalCentavos: 100,
      adjustmentTotalCentavos: 0,
      // Deliberately wrong so the assertion has something to catch.
      computedTotalCentavos: 999,
    };

    expect(() => assertSplitInvariant(brokenResult)).toThrow(SplitInvariantError);
  });

  it('does not throw when totals already balance', () => {
    const okResult: SplitCalculationResult = {
      participantShares: [
        {
          participantId: 'A',
          itemShares: [{ lineItemId: 'item1', amountCentavos: 100 }],
          adjustmentShares: [],
          itemSubtotalCentavos: 100,
          adjustmentTotalCentavos: 0,
          finalTotalCentavos: 100,
        },
      ],
      itemSubtotalCentavos: 100,
      adjustmentTotalCentavos: 0,
      computedTotalCentavos: 100,
    };

    expect(() => assertSplitInvariant(okResult)).not.toThrow();
  });
});
