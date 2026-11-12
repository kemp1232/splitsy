import type { SettlementTransaction } from '@/features/splitting/settlement.types';

import {
  applyMarkChanges,
  debtKey,
  isLegacySettledTrip,
  planDebtToggle,
  resolvePaidDebts,
  tripStatusFor,
} from './debtPaidStatus';

const aOwesC: SettlementTransaction = {
  fromParticipantId: 'a',
  toParticipantId: 'c',
  amountCentavos: 50025,
};
const bOwesC: SettlementTransaction = {
  fromParticipantId: 'b',
  toParticipantId: 'c',
  amountCentavos: 12000,
};

describe('resolvePaidDebts', () => {
  it('marks a debt paid on an exact from/to/amount match', () => {
    const result = resolvePaidDebts(
      [aOwesC, bOwesC],
      [{ fromKey: 'a', toKey: 'c', amountCentavos: 50025 }],
    );
    expect([...result.paidKeys]).toEqual([debtKey('a', 'c')]);
    expect(result.allPaid).toBe(false);
  });

  it('treats a debt as unpaid when the stored amount differs by one centavo (higher or lower)', () => {
    for (const amountCentavos of [50024, 50026]) {
      const result = resolvePaidDebts([aOwesC], [{ fromKey: 'a', toKey: 'c', amountCentavos }]);
      expect(result.paidKeys.size).toBe(0);
      expect(result.allPaid).toBe(false);
    }
  });

  it('does not match a mark with swapped from/to', () => {
    const result = resolvePaidDebts(
      [aOwesC],
      [{ fromKey: 'c', toKey: 'a', amountCentavos: 50025 }],
    );
    expect(result.paidKeys.size).toBe(0);
  });

  it('ignores marks for debts no longer present', () => {
    const result = resolvePaidDebts(
      [bOwesC],
      [
        { fromKey: 'a', toKey: 'c', amountCentavos: 50025 },
        { fromKey: 'b', toKey: 'c', amountCentavos: 12000 },
      ],
    );
    expect([...result.paidKeys]).toEqual([debtKey('b', 'c')]);
    expect(result.allPaid).toBe(true);
  });

  it('allPaid is true when every debt is paid and when there are no debts', () => {
    const marks = [
      { fromKey: 'a', toKey: 'c', amountCentavos: 50025 },
      { fromKey: 'b', toKey: 'c', amountCentavos: 12000 },
    ];
    expect(resolvePaidDebts([aOwesC, bOwesC], marks).allPaid).toBe(true);
    expect(resolvePaidDebts([], []).allPaid).toBe(true);
  });

  it('treatAllAsPaid marks every debt paid without any marks', () => {
    const result = resolvePaidDebts([aOwesC, bOwesC], [], { treatAllAsPaid: true });
    expect(result.paidKeys.size).toBe(2);
    expect(result.allPaid).toBe(true);
  });
});

describe('isLegacySettledTrip', () => {
  it('is true only for a SETTLED trip with zero stored marks', () => {
    const mark = { fromKey: 'a', toKey: 'c', amountCentavos: 1 };
    expect(isLegacySettledTrip('SETTLED', [])).toBe(true);
    expect(isLegacySettledTrip('SETTLED', [mark])).toBe(false);
    expect(isLegacySettledTrip('ACTIVE', [])).toBe(false);
  });
});

describe('tripStatusFor', () => {
  it('is SETTLED when every debt is paid and ACTIVE otherwise', () => {
    expect(tripStatusFor(true)).toBe('SETTLED');
    expect(tripStatusFor(false)).toBe('ACTIVE');
  });
});

describe('planDebtToggle', () => {
  it('marking the last unpaid debt paid makes every debt paid (trip settles)', () => {
    const plan = planDebtToggle({
      transactions: [aOwesC, bOwesC],
      paidKeys: new Set([debtKey('a', 'c')]),
      target: bOwesC,
      paid: true,
      legacy: false,
    });
    expect(plan.marksToWrite).toEqual([{ fromKey: 'b', toKey: 'c', amountCentavos: 12000 }]);
    expect(plan.unmark).toBeNull();
    expect(tripStatusFor(plan.nextAllPaid)).toBe('SETTLED');
  });

  it('unmarking a paid debt deletes its mark and reopens the trip', () => {
    const plan = planDebtToggle({
      transactions: [aOwesC, bOwesC],
      paidKeys: new Set([debtKey('a', 'c'), debtKey('b', 'c')]),
      target: aOwesC,
      paid: false,
      legacy: false,
    });
    expect(plan.marksToWrite).toEqual([]);
    expect(plan.unmark).toEqual({ fromKey: 'a', toKey: 'c' });
    expect(tripStatusFor(plan.nextAllPaid)).toBe('ACTIVE');
  });

  it('a legacy settled trip unmark writes marks for every other debt instead', () => {
    const plan = planDebtToggle({
      transactions: [aOwesC, bOwesC],
      paidKeys: new Set([debtKey('a', 'c'), debtKey('b', 'c')]),
      target: aOwesC,
      paid: false,
      legacy: true,
    });
    expect(plan.marksToWrite).toEqual([{ fromKey: 'b', toKey: 'c', amountCentavos: 12000 }]);
    expect(plan.unmark).toBeNull();
    expect(plan.nextAllPaid).toBe(false);
  });
});

describe('applyMarkChanges', () => {
  it('replaces a stale mark for the same pair and removes an unmarked pair', () => {
    const stale = { fromKey: 'a', toKey: 'c', amountCentavos: 100 };
    const other = { fromKey: 'b', toKey: 'c', amountCentavos: 12000 };
    expect(
      applyMarkChanges([stale, other], {
        marksToWrite: [{ fromKey: 'a', toKey: 'c', amountCentavos: 50025 }],
        unmark: null,
      }),
    ).toEqual([other, { fromKey: 'a', toKey: 'c', amountCentavos: 50025 }]);
    expect(
      applyMarkChanges([stale, other], { marksToWrite: [], unmark: { fromKey: 'b', toKey: 'c' } }),
    ).toEqual([stale]);
  });
});
