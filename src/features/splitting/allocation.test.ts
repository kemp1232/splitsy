import { MAX_SAFE_CENTAVOS } from '@/lib/money';

import { allocateEqual, allocateProportional, validateCustomAllocation } from './allocation';

describe('allocateEqual', () => {
  it('splits evenly when the total divides cleanly', () => {
    expect(allocateEqual(300, 3)).toEqual([100, 100, 100]);
  });

  it('gives the remainder centavos to the first participants in stable order', () => {
    const shares = allocateEqual(100, 3);
    expect(shares).toEqual([34, 33, 33]);
    expect(shares.reduce((sum, share) => sum + share, 0)).toBe(100);
  });

  it('keeps remainder assignment stable across different remainder sizes', () => {
    // remainder 2 of 5: first two participants get the extra centavo.
    expect(allocateEqual(52, 5)).toEqual([11, 11, 10, 10, 10]);
  });

  it('gives the entire total to a single participant', () => {
    expect(allocateEqual(12345, 1)).toEqual([12345]);
  });

  it('distributes a negative total (a discount) with the same remainder rule', () => {
    const shares = allocateEqual(-100, 3);
    expect(shares).toEqual([-33, -33, -34]);
    expect(shares.reduce((sum, share) => sum + share, 0)).toBe(-100);
  });

  it('handles a total of zero', () => {
    expect(allocateEqual(0, 4)).toEqual([0, 0, 0, 0]);
  });

  it('splits a large value near the safe limit without losing a centavo', () => {
    const shares = allocateEqual(MAX_SAFE_CENTAVOS, 7);
    expect(shares.reduce((sum, share) => sum + share, 0)).toBe(MAX_SAFE_CENTAVOS);
    // base = floor(999999999 / 7) = 142857142, remainder = 5.
    expect(shares).toEqual([
      142857143, 142857143, 142857143, 142857143, 142857143, 142857142, 142857142,
    ]);
  });

  it('throws for a non-positive participant count', () => {
    expect(() => allocateEqual(100, 0)).toThrow();
    expect(() => allocateEqual(100, -1)).toThrow();
  });
});

describe('allocateProportional', () => {
  it('splits an amount exactly proportional to typical weights', () => {
    expect(allocateProportional(100, [300, 700])).toEqual([30, 70]);
  });

  it('distributes the remainder via largest-remainder method, ties broken by index', () => {
    // Equal weights of 1 behave like allocateEqual's own remainder rule.
    const shares = allocateProportional(100, [1, 1, 1]);
    expect(shares).toEqual([34, 33, 33]);
    expect(shares.reduce((sum, share) => sum + share, 0)).toBe(100);
  });

  it('breaks a genuine remainder tie in favor of the earlier participant', () => {
    // weights [1, 3]: totalWeight 4, total 10. product0=10 -> floor 2, rem 2;
    // product1=30 -> floor 7, rem 2. Tied remainders -> index 0 wins the
    // single leftover centavo.
    const shares = allocateProportional(10, [1, 3]);
    expect(shares).toEqual([3, 7]);
  });

  it('allocates a negative total (a discount) proportionally', () => {
    // weights [1, 2], total -10: see allocation.ts's floorDivBigInt comment
    // for why floor/remainder of a negative product still produces exact,
    // deterministic shares.
    const shares = allocateProportional(-10, [1, 2]);
    expect(shares).toEqual([-3, -7]);
    expect(shares.reduce((sum, share) => sum + share, 0)).toBe(-10);
  });

  it('falls back to an equal split when every weight is zero', () => {
    // Spec 10.5: with no proportional basis at all (nobody has any item
    // subtotal yet), fall back to equal allocation instead of dividing by a
    // zero total weight.
    const shares = allocateProportional(100, [0, 0, 0]);
    expect(shares).toEqual(allocateEqual(100, 3));
  });

  it('sums exactly to the total for large weights and a large total near the safe limit', () => {
    const weights = [MAX_SAFE_CENTAVOS, 1];
    const shares = allocateProportional(MAX_SAFE_CENTAVOS, weights);
    expect(shares.reduce((sum, share) => sum + share, 0)).toBe(MAX_SAFE_CENTAVOS);
    expect(Number.isInteger(shares[0])).toBe(true);
    expect(Number.isInteger(shares[1])).toBe(true);
  });

  it('sums exactly to the total across a range of weight/total combinations (invariant check)', () => {
    const cases: [number, number[]][] = [
      [1000, [1, 1, 1, 1]],
      [999, [10, 20, 30]],
      [1, [1, 1, 1, 1, 1, 1, 1]],
      [-2500, [400, 350, 250]],
      [123456789, [1, 2, 3, 4, 5]],
    ];
    for (const [total, weights] of cases) {
      const shares = allocateProportional(total, weights);
      expect(shares).toHaveLength(weights.length);
      expect(shares.reduce((sum, share) => sum + share, 0)).toBe(total);
    }
  });

  it('throws for an empty weights array', () => {
    expect(() => allocateProportional(100, [])).toThrow();
  });
});

describe('validateCustomAllocation', () => {
  it('passes when custom amounts balance exactly', () => {
    expect(validateCustomAllocation(500, [200, 300])).toEqual({ valid: true });
  });

  it('fails when the custom amounts under-allocate the adjustment', () => {
    expect(validateCustomAllocation(500, [200, 200])).toEqual({
      valid: false,
      reason: 'sumMismatch',
    });
  });

  it('fails when the custom amounts over-allocate the adjustment', () => {
    expect(validateCustomAllocation(500, [300, 300])).toEqual({
      valid: false,
      reason: 'sumMismatch',
    });
  });

  it('fails on a negative amount for a positive adjustment', () => {
    expect(validateCustomAllocation(500, [-100, 600])).toEqual({
      valid: false,
      reason: 'signMismatch',
    });
  });

  it('fails on a positive amount for a negative (discount) adjustment', () => {
    expect(validateCustomAllocation(-500, [100, -600])).toEqual({
      valid: false,
      reason: 'signMismatch',
    });
  });

  it('allows a zero amount for one participant regardless of the adjustment sign', () => {
    expect(validateCustomAllocation(500, [0, 500])).toEqual({ valid: true });
    expect(validateCustomAllocation(-300, [-300, 0])).toEqual({ valid: true });
  });
});
