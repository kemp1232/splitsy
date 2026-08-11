import { MAX_SAFE_CENTAVOS } from '@/lib/money';

import { computeSettlement } from './settlement';
import type { SettlementParticipant, SettlementResult } from './settlement.types';

// Cross-checks settlement.ts's doc-comment claim: whatever is left unmatched
// on the non-empty side after computeSettlement's greedy loop finishes
// should always be consistent with the independently-computed
// `unaccountedCentavos`. Recomputed here from scratch (not by importing any
// internals) so this is a genuine second code path, not the same
// computation restated.
function leftoverImbalance(
  participants: SettlementParticipant[],
  result: SettlementResult,
): number {
  const netBalanceByParticipantId = new Map(
    participants.map((p) => [p.participantId, p.contributedCentavos - p.fairShareCentavos]),
  );

  for (const transaction of result.transactions) {
    netBalanceByParticipantId.set(
      transaction.fromParticipantId,
      (netBalanceByParticipantId.get(transaction.fromParticipantId) ?? 0) +
        transaction.amountCentavos,
    );
    netBalanceByParticipantId.set(
      transaction.toParticipantId,
      (netBalanceByParticipantId.get(transaction.toParticipantId) ?? 0) -
        transaction.amountCentavos,
    );
  }

  // After every transaction is "undone" this way, every remaining balance
  // should be the same sign (or zero) — sum them and negate to match
  // unaccountedCentavos's sign convention (fairShare - contributed).
  const leftoverSum = [...netBalanceByParticipantId.values()].reduce(
    (sum, balance) => sum + balance,
    0,
  );
  // Normalize a `-0` result (possible since `-leftoverSum` of an exact-zero
  // sum is `-0` in JS) to plain `0` so `toBe(0)` assertions using
  // `Object.is` semantics don't fail on a value that is mathematically zero.
  return leftoverSum === 0 ? 0 : -leftoverSum;
}

describe('computeSettlement', () => {
  it('settles multiple debtors against one creditor who paid the full bill', () => {
    // The user's worked example: Person 1 pays the whole ₱900 bill for three
    // people who each owe ₱300.
    const participants: SettlementParticipant[] = [
      { participantId: 'p1', fairShareCentavos: 30000, contributedCentavos: 90000 },
      { participantId: 'p2', fairShareCentavos: 30000, contributedCentavos: 0 },
      { participantId: 'p3', fairShareCentavos: 30000, contributedCentavos: 0 },
    ];

    const result = computeSettlement(participants);

    expect(result.unaccountedCentavos).toBe(0);
    expect(result.transactions).toEqual([
      { fromParticipantId: 'p2', toParticipantId: 'p1', amountCentavos: 30000 },
      { fromParticipantId: 'p3', toParticipantId: 'p1', amountCentavos: 30000 },
    ]);

    const totalToP1 = result.transactions
      .filter((t) => t.toParticipantId === 'p1')
      .reduce((sum, t) => sum + t.amountCentavos, 0);
    expect(totalToP1).toBe(60000);
    expect(leftoverImbalance(participants, result)).toBe(0);
  });

  it('handles multiple creditors and multiple debtors with a valid, fully-netting transaction set', () => {
    // Two people split paying upfront (P1 covers 500, P2 covers 400), the
    // rest contributed nothing toward a bill where everyone's fair share is
    // 300 across 6 participants (total bill 1800).
    const participants: SettlementParticipant[] = [
      { participantId: 'p1', fairShareCentavos: 30000, contributedCentavos: 50000 },
      { participantId: 'p2', fairShareCentavos: 30000, contributedCentavos: 40000 },
      { participantId: 'p3', fairShareCentavos: 30000, contributedCentavos: 30000 },
      { participantId: 'p4', fairShareCentavos: 30000, contributedCentavos: 20000 },
      { participantId: 'p5', fairShareCentavos: 30000, contributedCentavos: 25000 },
      { participantId: 'p6', fairShareCentavos: 30000, contributedCentavos: 15000 },
    ];

    const result = computeSettlement(participants);

    expect(result.unaccountedCentavos).toBe(0);
    // p1 is owed 20000, p2 is owed 10000. p3 is settled (excluded from
    // matching). p4 owes 10000, p5 owes 5000, p6 owes 15000.
    expect(result.transactions).toEqual([
      { fromParticipantId: 'p6', toParticipantId: 'p1', amountCentavos: 15000 },
      { fromParticipantId: 'p4', toParticipantId: 'p2', amountCentavos: 10000 },
      { fromParticipantId: 'p5', toParticipantId: 'p1', amountCentavos: 5000 },
    ]);

    const netByParticipant = new Map<string, number>();
    for (const p of participants) {
      netByParticipant.set(p.participantId, p.contributedCentavos - p.fairShareCentavos);
    }
    for (const t of result.transactions) {
      netByParticipant.set(
        t.fromParticipantId,
        (netByParticipant.get(t.fromParticipantId) ?? 0) + t.amountCentavos,
      );
      netByParticipant.set(
        t.toParticipantId,
        (netByParticipant.get(t.toParticipantId) ?? 0) - t.amountCentavos,
      );
    }
    // Every participant's balance should net to exactly zero once every
    // transaction is applied (no unaccounted gap in this case).
    for (const balance of netByParticipant.values()) {
      expect(balance).toBe(0);
    }
    expect(leftoverImbalance(participants, result)).toBe(0);
  });

  it('reports the full bill as unaccounted when nobody has contributed anything yet', () => {
    const participants: SettlementParticipant[] = [
      { participantId: 'p1', fairShareCentavos: 50000, contributedCentavos: 0 },
      { participantId: 'p2', fairShareCentavos: 30000, contributedCentavos: 0 },
      { participantId: 'p3', fairShareCentavos: 20000, contributedCentavos: 0 },
    ];

    const result = computeSettlement(participants);

    expect(result.transactions).toEqual([]);
    expect(result.unaccountedCentavos).toBe(100000);
    expect(leftoverImbalance(participants, result)).toBe(100000);
  });

  it('produces no transactions and no unaccounted gap when everyone already paid their exact fair share', () => {
    const participants: SettlementParticipant[] = [
      { participantId: 'p1', fairShareCentavos: 12345, contributedCentavos: 12345 },
      { participantId: 'p2', fairShareCentavos: 6789, contributedCentavos: 6789 },
    ];

    const result = computeSettlement(participants);

    expect(result.transactions).toEqual([]);
    expect(result.unaccountedCentavos).toBe(0);
  });

  it('breaks a tie between two equal-magnitude debtors using stable input order', () => {
    // p2 and p3 both owe exactly 10000; p1 is the sole creditor owed 20000.
    // Stable order means p2 (earlier in the input array) is matched first.
    const participants: SettlementParticipant[] = [
      { participantId: 'p1', fairShareCentavos: 0, contributedCentavos: 20000 },
      { participantId: 'p2', fairShareCentavos: 10000, contributedCentavos: 0 },
      { participantId: 'p3', fairShareCentavos: 10000, contributedCentavos: 0 },
    ];

    const result = computeSettlement(participants);

    expect(result.transactions).toEqual([
      { fromParticipantId: 'p2', toParticipantId: 'p1', amountCentavos: 10000 },
      { fromParticipantId: 'p3', toParticipantId: 'p1', amountCentavos: 10000 },
    ]);
  });

  it('breaks a tie between two equal-magnitude creditors using stable input order', () => {
    // p1 and p2 are both owed exactly 10000; p3 is the sole debtor who owes
    // 20000. Stable order means p1 (earlier in the input array) is paid
    // first, in full, before p2 receives anything.
    const participants: SettlementParticipant[] = [
      { participantId: 'p1', fairShareCentavos: 0, contributedCentavos: 10000 },
      { participantId: 'p2', fairShareCentavos: 0, contributedCentavos: 10000 },
      { participantId: 'p3', fairShareCentavos: 20000, contributedCentavos: 0 },
    ];

    const result = computeSettlement(participants);

    expect(result.transactions).toEqual([
      { fromParticipantId: 'p3', toParticipantId: 'p1', amountCentavos: 10000 },
      { fromParticipantId: 'p3', toParticipantId: 'p2', amountCentavos: 10000 },
    ]);
  });

  it('reports a negative unaccounted amount when more was contributed than the bill required', () => {
    // A tip pooled on top, or a data-entry mistake: total contributed
    // (150.00) exceeds the total fair share (100.00) by 50.00.
    const participants: SettlementParticipant[] = [
      { participantId: 'p1', fairShareCentavos: 5000, contributedCentavos: 10000 },
      { participantId: 'p2', fairShareCentavos: 5000, contributedCentavos: 5000 },
    ];

    const result = computeSettlement(participants);

    expect(result.unaccountedCentavos).toBe(-5000);
    // p1 over-contributed by 5000 and is the sole creditor; p2 is exactly
    // settled and is neither a debtor nor a creditor, so there is no debtor
    // to match p1 against.
    expect(result.transactions).toEqual([]);
    expect(leftoverImbalance(participants, result)).toBe(-5000);
  });

  it('produces no transactions for a single-participant bill', () => {
    const participants: SettlementParticipant[] = [
      { participantId: 'p1', fairShareCentavos: 50000, contributedCentavos: 0 },
    ];

    const result = computeSettlement(participants);

    expect(result.transactions).toEqual([]);
    expect(result.unaccountedCentavos).toBe(50000);
  });

  it('produces no transactions for a single-participant bill that already paid in full', () => {
    const participants: SettlementParticipant[] = [
      { participantId: 'p1', fairShareCentavos: 50000, contributedCentavos: 50000 },
    ];

    const result = computeSettlement(participants);

    expect(result.transactions).toEqual([]);
    expect(result.unaccountedCentavos).toBe(0);
  });

  it('handles large values within the safe centavo limit without losing precision', () => {
    const participants: SettlementParticipant[] = [
      { participantId: 'p1', fairShareCentavos: 0, contributedCentavos: MAX_SAFE_CENTAVOS },
      { participantId: 'p2', fairShareCentavos: MAX_SAFE_CENTAVOS, contributedCentavos: 0 },
    ];

    const result = computeSettlement(participants);

    expect(result.unaccountedCentavos).toBe(0);
    expect(result.transactions).toEqual([
      { fromParticipantId: 'p2', toParticipantId: 'p1', amountCentavos: MAX_SAFE_CENTAVOS },
    ]);
    expect(Number.isInteger(result.transactions[0]!.amountCentavos)).toBe(true);
  });

  it('re-evaluates the largest remaining debtor/creditor after each match, not just an initial sort', () => {
    // debtor magnitudes [100.00, 99.00], creditor magnitudes [80.00, 25.00]
    // (all in centavos below). Matching the two largest first (debtor 100
    // against creditor 80) leaves debtor 100 reduced to 20.00 — smaller than
    // the untouched debtor 99.00. A naive fixed two-pointer walk (sort once,
    // never re-sort, just advance whichever side zeroes out) would keep
    // using the same reduced debtor-100 entry next round instead of
    // recognizing debtor-99 is now the largest remaining debtor, and would
    // wrongly match debtor-100 against creditor-25 next. The correct greedy
    // result re-evaluates from scratch each round, so debtor-99 (now the
    // largest) must be matched against creditor-25 next, not debtor-100.
    const participants: SettlementParticipant[] = [
      { participantId: 'debtor-100', fairShareCentavos: 10000, contributedCentavos: 0 },
      { participantId: 'debtor-99', fairShareCentavos: 9900, contributedCentavos: 0 },
      { participantId: 'creditor-80', fairShareCentavos: 0, contributedCentavos: 8000 },
      { participantId: 'creditor-25', fairShareCentavos: 0, contributedCentavos: 2500 },
    ];

    const result = computeSettlement(participants);

    expect(result.transactions).toEqual([
      { fromParticipantId: 'debtor-100', toParticipantId: 'creditor-80', amountCentavos: 8000 },
      { fromParticipantId: 'debtor-99', toParticipantId: 'creditor-25', amountCentavos: 2500 },
    ]);
    // Total fair share (19900) exceeds total contributed (10500): the two
    // creditors are fully paid off (10500), leaving 9400 of debt unmatched
    // and unaccounted for (debtor-100 has 2000 left owing, debtor-99 has
    // 7400 left owing — nobody is left to receive it).
    expect(result.unaccountedCentavos).toBe(9400);
    expect(leftoverImbalance(participants, result)).toBe(9400);
  });

  it('never produces a transaction for a participant who is already exactly settled', () => {
    const participants: SettlementParticipant[] = [
      { participantId: 'p1', fairShareCentavos: 10000, contributedCentavos: 20000 },
      { participantId: 'p2', fairShareCentavos: 10000, contributedCentavos: 10000 },
      { participantId: 'p3', fairShareCentavos: 10000, contributedCentavos: 0 },
    ];

    const result = computeSettlement(participants);

    const involvedParticipantIds = new Set(
      result.transactions.flatMap((t) => [t.fromParticipantId, t.toParticipantId]),
    );
    expect(involvedParticipantIds.has('p2')).toBe(false);
  });
});
