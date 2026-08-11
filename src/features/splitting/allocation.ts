// Pure integer-centavo allocation primitives (spec sections 10.3-10.6). No
// floating-point math is used to decide any share here — every function
// returns an array of integer centavos that sums exactly to the input total,
// which is what the spec 10.7 final-total invariant depends on downstream.

/**
 * Splits `totalCentavos` into exactly `participantCount` integer shares that
 * sum exactly to `totalCentavos`.
 *
 * This is spec 10.3's equal item allocation and spec 10.4's equal adjustment
 * allocation — the two are defined as literally the same integer
 * division/remainder process, so one function serves both call sites
 * (item-splitting and EQUAL-method adjustments).
 *
 * `base = floor(total / n)`; the remainder (`total - base * n`, always in
 * `[0, n)` even when `total` is negative, since `Math.floor` rounds toward
 * -Infinity) is distributed one centavo at a time to the first `remainder`
 * entries. Callers must already provide `participantCount` for a list
 * iterated in the bill's stable participant/assignee order (spec 10.3/10.4's
 * "stable participant sort order") — this function only knows about
 * position, not participant identity.
 */
export function allocateEqual(totalCentavos: number, participantCount: number): number[] {
  if (!Number.isInteger(participantCount) || participantCount <= 0) {
    throw new Error('allocateEqual requires a positive integer participantCount');
  }

  const base = Math.floor(totalCentavos / participantCount);
  const remainder = totalCentavos - base * participantCount;

  return Array.from({ length: participantCount }, (_, index) =>
    index < remainder ? base + 1 : base,
  );
}

// BigInt division truncates toward zero, not toward -Infinity like
// Math.floor. allocateProportional's numerator (totalCentavos * weight) can
// be negative when totalCentavos is (a discount allocated proportionally),
// so this corrects the truncated quotient to a true mathematical floor.
// `denominator` (total weight) is always positive here, since
// allocateProportional only reaches this helper after ruling out an
// all-zero weight sum.
function floorDivBigInt(numerator: bigint, denominator: bigint): bigint {
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  return remainder !== 0n && remainder < 0n ? quotient - 1n : quotient;
}

type ProportionalEntry = {
  index: number;
  floor: bigint;
  remainder: bigint;
};

/**
 * Splits `totalCentavos` across participants weighted by `weights` — each
 * participant's item subtotal before adjustments (spec 10.5's proportional
 * basis) — via exact rational share, floor, then the largest-remainder
 * method, ties broken by stable array index (callers must pass `weights` in
 * the bill's stable participant order).
 *
 * `totalCentavos` may be negative (e.g. a discount allocated
 * proportionally) — every value is carried through as BigInt until the
 * final floor/remainder split so nothing rounds early, and so a
 * `totalCentavos * weight` product that would exceed
 * Number.MAX_SAFE_INTEGER (easily possible well within the spec's
 * ₱9,999,999.99 safe range on both operands) never silently loses
 * precision. Every final share is bounded by `totalCentavos` itself, safely
 * inside Number range, so converting back to Number at the end is safe.
 *
 * When every weight is zero (e.g. no items have been assigned to anyone
 * yet, so nobody has any item subtotal), there is no proportional basis to
 * allocate against — this falls back to `allocateEqual` instead, per spec
 * 10.5's explicit zero-subtotal fallback rule. Covered explicitly by
 * allocation.test.ts's "zero subtotal fallback" case.
 */
export function allocateProportional(totalCentavos: number, weights: number[]): number[] {
  const participantCount = weights.length;
  if (participantCount === 0) {
    throw new Error('allocateProportional requires at least one weight');
  }

  const totalWeightBig = weights.reduce((sum, weight) => sum + BigInt(weight), 0n);

  if (totalWeightBig === 0n) {
    return allocateEqual(totalCentavos, participantCount);
  }
  if (totalWeightBig < 0n) {
    throw new Error(
      'allocateProportional requires non-negative weights (item subtotals cannot be negative)',
    );
  }

  const totalBig = BigInt(totalCentavos);

  const entries: ProportionalEntry[] = weights.map((weight, index) => {
    const product = totalBig * BigInt(weight);
    const floor = floorDivBigInt(product, totalWeightBig);
    const remainder = product - floor * totalWeightBig;
    return { index, floor, remainder };
  });

  const flooredSum = entries.reduce((sum, entry) => sum + entry.floor, 0n);
  // Always a non-negative integer strictly less than participantCount — see
  // the largest-remainder method's standard proof: each remainder is in
  // [0, totalWeight), and their sum is always an exact multiple of
  // totalWeight equal to totalWeight * leftover.
  const leftover = Number(totalBig - flooredSum);

  const byRemainderDesc = [...entries].sort((a, b) => {
    if (a.remainder === b.remainder) return 0;
    return a.remainder > b.remainder ? -1 : 1;
  });
  const extraIndices = new Set(byRemainderDesc.slice(0, leftover).map((entry) => entry.index));

  const shares = new Array<number>(participantCount);
  for (const entry of entries) {
    shares[entry.index] = Number(entry.floor) + (extraIndices.has(entry.index) ? 1 : 0);
  }
  return shares;
}

export type CustomAllocationValidationResult =
  { valid: true } | { valid: false; reason: 'sumMismatch' | 'signMismatch' };

/**
 * Validates a set of user-entered custom per-participant amounts against
 * spec 10.6's rules for one adjustment:
 *
 * - Every non-zero amount's sign must match the adjustment's sign (negative
 *   amounts only for a negative/discount adjustment, positive amounts only
 *   for a positive adjustment; a zero amount for one participant is always
 *   allowed regardless of the adjustment's sign).
 * - The amounts must sum exactly to `adjustmentAmountCentavos`.
 *
 * Returns a reason code (mirroring ParticipantNameValidationResult's style)
 * rather than a bare boolean so the UI can show a specific message instead
 * of one generic "out of balance" error.
 */
export function validateCustomAllocation(
  adjustmentAmountCentavos: number,
  allocatedAmountsCentavos: number[],
): CustomAllocationValidationResult {
  const adjustmentSign = Math.sign(adjustmentAmountCentavos);

  for (const amount of allocatedAmountsCentavos) {
    const amountSign = Math.sign(amount);
    if (amountSign !== 0 && amountSign !== adjustmentSign) {
      return { valid: false, reason: 'signMismatch' };
    }
  }

  const sum = allocatedAmountsCentavos.reduce((total, amount) => total + amount, 0);
  if (sum !== adjustmentAmountCentavos) {
    return { valid: false, reason: 'sumMismatch' };
  }

  return { valid: true };
}
