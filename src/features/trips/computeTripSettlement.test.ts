import { MAX_SAFE_CENTAVOS } from '@/lib/money';
import { calculateSplit } from '@/features/splitting/splitCalculator';
import { computeSettlement } from '@/features/splitting/settlement';
import type { SplitAdjustment, SplitLineItem, SplitParticipant } from '@/features/splitting/split.types';

import { computeTripSettlement } from './computeTripSettlement';
import type { TripBillData } from './computeTripSettlement';

// Small helper for the common case in these tests: every participant on a
// bill is on the trip roster, so their identity is simply their
// tripParticipantId (here, reused as-is for readability).
function identityMapFromPairs(pairs: [string, string][]): Map<string, string> {
  return new Map(pairs);
}

describe('computeTripSettlement', () => {
  it('returns the empty result without throwing when there are no bills', () => {
    const result = computeTripSettlement([]);
    expect(result).toEqual({
      perPerson: [],
      settlement: { transactions: [], unaccountedCentavos: 0 },
    });
  });

  it('matches the existing single-bill settlement path exactly when given only one bill', () => {
    // Cross-checked against settlement.test.ts's "settles multiple debtors
    // against one creditor" case: Person 1 pays the whole 900.00 bill for
    // three people who each owe 300.00.
    const participants: SplitParticipant[] = [
      { participantId: 'p1' },
      { participantId: 'p2' },
      { participantId: 'p3' },
    ];
    const items: SplitLineItem[] = [
      { lineItemId: 'item1', lineTotalCentavos: 90000, assigneeParticipantIds: ['p1', 'p2', 'p3'] },
    ];
    const adjustments: SplitAdjustment[] = [];

    const directShareResult = calculateSplit({ participants, items, adjustments });
    const directSettlement = computeSettlement([
      { participantId: 'p1', fairShareCentavos: 30000, contributedCentavos: 90000 },
      { participantId: 'p2', fairShareCentavos: 30000, contributedCentavos: 0 },
      { participantId: 'p3', fairShareCentavos: 30000, contributedCentavos: 0 },
    ]);
    // Sanity check the fixture matches the shared example before using it as
    // a cross-check baseline.
    expect(
      directShareResult.participantShares.map((s) => s.finalTotalCentavos),
    ).toEqual([30000, 30000, 30000]);

    const bill: TripBillData = {
      billId: 'bill1',
      participants,
      items,
      adjustments,
      contributedCentavosByParticipantId: new Map([
        ['p1', 90000],
        ['p2', 0],
        ['p3', 0],
      ]),
      identityByParticipantId: identityMapFromPairs([
        ['p1', 'p1'],
        ['p2', 'p2'],
        ['p3', 'p3'],
      ]),
    };

    const tripResult = computeTripSettlement([bill]);

    expect(tripResult.settlement).toEqual(directSettlement);
    expect(tripResult.perPerson).toEqual([
      { identityId: 'p1', fairShareCentavos: 30000, contributedCentavos: 90000 },
      { identityId: 'p2', fairShareCentavos: 30000, contributedCentavos: 0 },
      { identityId: 'p3', fairShareCentavos: 30000, contributedCentavos: 0 },
    ]);
  });

  it('sums fair shares and contributions per person across two bills with the same roster', () => {
    // Both bills have the same three roster people (identity = tripParticipantId
    // 'alice'/'bob'/'carol'), but bill-scoped participant ids differ per bill
    // (as they would in the DB, since `participants` rows are per-bill).
    const billA: TripBillData = {
      billId: 'billA',
      participants: [{ participantId: 'a1' }, { participantId: 'a2' }, { participantId: 'a3' }],
      items: [
        {
          lineItemId: 'itemA1',
          lineTotalCentavos: 30000,
          assigneeParticipantIds: ['a1', 'a2', 'a3'],
        },
      ],
      adjustments: [],
      contributedCentavosByParticipantId: new Map([
        ['a1', 30000],
        ['a2', 0],
        ['a3', 0],
      ]),
      identityByParticipantId: identityMapFromPairs([
        ['a1', 'alice'],
        ['a2', 'bob'],
        ['a3', 'carol'],
      ]),
    };

    const billB: TripBillData = {
      billId: 'billB',
      participants: [{ participantId: 'b1' }, { participantId: 'b2' }, { participantId: 'b3' }],
      items: [
        {
          lineItemId: 'itemB1',
          lineTotalCentavos: 60000,
          assigneeParticipantIds: ['b1', 'b2', 'b3'],
        },
      ],
      adjustments: [],
      contributedCentavosByParticipantId: new Map([
        ['b1', 0],
        ['b2', 60000],
        ['b3', 0],
      ]),
      identityByParticipantId: identityMapFromPairs([
        ['b1', 'alice'],
        ['b2', 'bob'],
        ['b3', 'carol'],
      ]),
    };

    const result = computeTripSettlement([billA, billB]);

    // Each bill splits evenly across 3: bill A = 10000 each, bill B = 20000
    // each. Summed: 30000 fair share each across the trip.
    const byIdentity = new Map(result.perPerson.map((p) => [p.identityId, p]));
    expect(byIdentity.get('alice')).toEqual({
      identityId: 'alice',
      fairShareCentavos: 30000,
      contributedCentavos: 30000,
    });
    expect(byIdentity.get('bob')).toEqual({
      identityId: 'bob',
      fairShareCentavos: 30000,
      contributedCentavos: 60000,
    });
    expect(byIdentity.get('carol')).toEqual({
      identityId: 'carol',
      fairShareCentavos: 30000,
      contributedCentavos: 0,
    });

    // Sum of fair shares across the trip must equal the sum of the two
    // bills' computed totals (30000 + 60000 = 90000).
    const totalFairShare = result.perPerson.reduce((sum, p) => sum + p.fairShareCentavos, 0);
    expect(totalFairShare).toBe(90000);

    // bob over-contributed net across the trip (90000 contributed vs 90000
    // fair share total => balanced overall), so settlement should resolve
    // fully with no unaccounted gap: carol owes into the pool, alice is
    // basically even, bob is owed.
    expect(result.settlement.unaccountedCentavos).toBe(0);
  });

  it('correctly nets a bill-only person appearing in exactly one bill, without bleeding into the other bill', () => {
    // 'guest' only appears in billA and is not on the trip roster (their
    // identity is their own bill-scoped participant id, 'a-guest').
    const billA: TripBillData = {
      billId: 'billA',
      participants: [{ participantId: 'a1' }, { participantId: 'a-guest' }],
      items: [
        { lineItemId: 'itemA1', lineTotalCentavos: 20000, assigneeParticipantIds: ['a1', 'a-guest'] },
      ],
      adjustments: [],
      contributedCentavosByParticipantId: new Map([
        ['a1', 20000],
        ['a-guest', 0],
      ]),
      identityByParticipantId: identityMapFromPairs([
        ['a1', 'alice'],
        // 'a-guest' intentionally omitted from identityByParticipantId to
        // exercise the documented fallback-to-own-id behavior.
      ]),
    };

    const billB: TripBillData = {
      billId: 'billB',
      participants: [{ participantId: 'b1' }, { participantId: 'b2' }],
      items: [
        { lineItemId: 'itemB1', lineTotalCentavos: 40000, assigneeParticipantIds: ['b1', 'b2'] },
      ],
      adjustments: [],
      contributedCentavosByParticipantId: new Map([
        ['b1', 40000],
        ['b2', 0],
      ]),
      identityByParticipantId: identityMapFromPairs([
        ['b1', 'alice'],
        ['b2', 'bob'],
      ]),
    };

    const result = computeTripSettlement([billA, billB]);

    const byIdentity = new Map(result.perPerson.map((p) => [p.identityId, p]));
    // alice: 10000 (bill A) + 20000 (bill B) = 30000 fair share, 20000 +
    // 40000 = 60000 contributed.
    expect(byIdentity.get('alice')).toEqual({
      identityId: 'alice',
      fairShareCentavos: 30000,
      contributedCentavos: 60000,
    });
    // The guest only appears in bill A, keyed by their own bill-scoped id,
    // and must not merge with anyone in bill B.
    expect(byIdentity.get('a-guest')).toEqual({
      identityId: 'a-guest',
      fairShareCentavos: 10000,
      contributedCentavos: 0,
    });
    expect(byIdentity.get('bob')).toEqual({
      identityId: 'bob',
      fairShareCentavos: 20000,
      contributedCentavos: 0,
    });
    expect(result.perPerson).toHaveLength(3);
  });

  it('nets someone present in bill A but absent from bill B using only the bills they actually appear in', () => {
    const billA: TripBillData = {
      billId: 'billA',
      participants: [{ participantId: 'a1' }, { participantId: 'a2' }],
      items: [
        { lineItemId: 'itemA1', lineTotalCentavos: 20000, assigneeParticipantIds: ['a1', 'a2'] },
      ],
      adjustments: [],
      contributedCentavosByParticipantId: new Map([
        ['a1', 20000],
        ['a2', 0],
      ]),
      identityByParticipantId: identityMapFromPairs([
        ['a1', 'alice'],
        ['a2', 'bob'],
      ]),
    };

    // bob was removed from this bill; only alice attended.
    const billB: TripBillData = {
      billId: 'billB',
      participants: [{ participantId: 'b1' }],
      items: [{ lineItemId: 'itemB1', lineTotalCentavos: 15000, assigneeParticipantIds: ['b1'] }],
      adjustments: [],
      contributedCentavosByParticipantId: new Map([['b1', 15000]]),
      identityByParticipantId: identityMapFromPairs([['b1', 'alice']]),
    };

    const result = computeTripSettlement([billA, billB]);

    const byIdentity = new Map(result.perPerson.map((p) => [p.identityId, p]));
    expect(byIdentity.get('alice')).toEqual({
      identityId: 'alice',
      fairShareCentavos: 10000 + 15000,
      contributedCentavos: 20000 + 15000,
    });
    expect(byIdentity.get('bob')).toEqual({
      identityId: 'bob',
      fairShareCentavos: 10000,
      contributedCentavos: 0,
    });
    expect(result.perPerson).toHaveLength(2);
  });

  it('works correctly on whatever subset of bills the caller passes (e.g. only COMPLETED bills)', () => {
    // The caller is responsible for filtering by bill status before calling
    // this function; simulate that by only passing one of two bills that
    // "exist" for a trip in this scenario.
    const completedBillOnly: TripBillData = {
      billId: 'billCompleted',
      participants: [{ participantId: 'x1' }, { participantId: 'x2' }],
      items: [
        { lineItemId: 'item1', lineTotalCentavos: 10000, assigneeParticipantIds: ['x1', 'x2'] },
      ],
      adjustments: [],
      contributedCentavosByParticipantId: new Map([
        ['x1', 5000],
        ['x2', 5000],
      ]),
      identityByParticipantId: identityMapFromPairs([
        ['x1', 'dana'],
        ['x2', 'erin'],
      ]),
    };

    const result = computeTripSettlement([completedBillOnly]);

    const byIdentity = new Map(result.perPerson.map((p) => [p.identityId, p]));
    expect(byIdentity.get('dana')).toEqual({
      identityId: 'dana',
      fairShareCentavos: 5000,
      contributedCentavos: 5000,
    });
    expect(byIdentity.get('erin')).toEqual({
      identityId: 'erin',
      fairShareCentavos: 5000,
      contributedCentavos: 5000,
    });
    expect(result.settlement.transactions).toEqual([]);
    expect(result.settlement.unaccountedCentavos).toBe(0);
  });

  it('throws when an aggregated fair share across bills would exceed the safe centavo limit', () => {
    // Each individual bill amount is well within MAX_SAFE_CENTAVOS on its
    // own, but the same single participant's fair share summed across two
    // such bills exceeds it.
    const perBillAmount = 600_000_000; // < MAX_SAFE_CENTAVOS individually
    expect(perBillAmount).toBeLessThan(MAX_SAFE_CENTAVOS);
    expect(perBillAmount * 2).toBeGreaterThan(MAX_SAFE_CENTAVOS);

    const makeBill = (billId: string): TripBillData => ({
      billId,
      participants: [{ participantId: `${billId}-p1` }],
      items: [
        {
          lineItemId: `${billId}-item1`,
          lineTotalCentavos: perBillAmount,
          assigneeParticipantIds: [`${billId}-p1`],
        },
      ],
      adjustments: [],
      contributedCentavosByParticipantId: new Map([[`${billId}-p1`, 0]]),
      identityByParticipantId: identityMapFromPairs([[`${billId}-p1`, 'whale']]),
    });

    expect(() => computeTripSettlement([makeBill('bill1'), makeBill('bill2')])).toThrow();
  });

  it('handles a large-but-safe aggregated total without throwing', () => {
    const perBillAmount = Math.floor(MAX_SAFE_CENTAVOS / 2);
    const makeBill = (billId: string): TripBillData => ({
      billId,
      participants: [{ participantId: `${billId}-p1` }],
      items: [
        {
          lineItemId: `${billId}-item1`,
          lineTotalCentavos: perBillAmount,
          assigneeParticipantIds: [`${billId}-p1`],
        },
      ],
      adjustments: [],
      contributedCentavosByParticipantId: new Map([[`${billId}-p1`, perBillAmount]]),
      identityByParticipantId: identityMapFromPairs([[`${billId}-p1`, 'whale']]),
    });

    const result = computeTripSettlement([makeBill('bill1'), makeBill('bill2')]);
    expect(result.perPerson).toEqual([
      {
        identityId: 'whale',
        fairShareCentavos: perBillAmount * 2,
        contributedCentavos: perBillAmount * 2,
      },
    ]);
    expect(result.settlement.transactions).toEqual([]);
    expect(result.settlement.unaccountedCentavos).toBe(0);
  });
});
