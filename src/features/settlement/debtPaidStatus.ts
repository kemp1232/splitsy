import type { SettlementTransaction } from '@/features/splitting/settlement.types';

// Not from the spec — per-debt "paid" marks on the settle-up screens. Debts
// are re-derived on every render, so a stored mark only counts while the
// recomputed debt still has the same debtor, creditor AND exact amount; a
// mark whose amount no longer matches (a bill was edited) or whose debt no
// longer exists is simply ignored, and that debt shows unpaid again.

export type DebtMark = { fromKey: string; toKey: string; amountCentavos: number };

export type PaidDebts = { paidKeys: Set<string>; allPaid: boolean };

// Stable per-debt key. computeSettlement never emits the same
// debtor/creditor pair twice, so this is unique within one settlement.
export function debtKey(fromId: string, toId: string): string {
  return `${fromId}|${toId}`;
}

export function transactionKey(transaction: SettlementTransaction): string {
  return debtKey(transaction.fromParticipantId, transaction.toParticipantId);
}

export function toDebtMark(transaction: SettlementTransaction): DebtMark {
  return {
    fromKey: transaction.fromParticipantId,
    toKey: transaction.toParticipantId,
    amountCentavos: transaction.amountCentavos,
  };
}

/**
 * Which of `transactions` count as paid given the stored `marks`.
 * `treatAllAsPaid` covers a legacy settled trip (see isLegacySettledTrip).
 * `allPaid` is true when every transaction is paid (vacuously so for none).
 */
export function resolvePaidDebts(
  transactions: SettlementTransaction[],
  marks: DebtMark[],
  options: { treatAllAsPaid?: boolean } = {},
): PaidDebts {
  const markedAmountByKey = new Map<string, number>();
  for (const mark of marks) {
    markedAmountByKey.set(debtKey(mark.fromKey, mark.toKey), mark.amountCentavos);
  }

  const paidKeys = new Set<string>();
  for (const transaction of transactions) {
    const key = transactionKey(transaction);
    if (options.treatAllAsPaid || markedAmountByKey.get(key) === transaction.amountCentavos) {
      paidKeys.add(key);
    }
  }

  return { paidKeys, allPaid: paidKeys.size === transactions.length };
}

// A trip marked SETTLED before per-debt marks existed has no marks at all;
// it keeps showing every debt as paid until the user changes one.
export function isLegacySettledTrip(status: 'ACTIVE' | 'SETTLED', marks: DebtMark[]): boolean {
  return status === 'SETTLED' && marks.length === 0;
}

// Marking the last trip debt paid settles the trip; unmarking any reopens it.
export function tripStatusFor(allPaid: boolean): 'ACTIVE' | 'SETTLED' {
  return allPaid ? 'SETTLED' : 'ACTIVE';
}

export type DebtTogglePlan = {
  // Marks to upsert (current amounts).
  marksToWrite: DebtMark[];
  // Pair to delete, when unmarking a stored mark.
  unmark: { fromKey: string; toKey: string } | null;
  nextAllPaid: boolean;
};

/**
 * The writes needed to set `target` to `paid`. In the legacy state (every
 * debt shown paid with zero stored marks) unmarking one debt instead stores
 * marks for every other debt, so they stay paid once the legacy rule no
 * longer applies.
 */
export function planDebtToggle({
  transactions,
  paidKeys,
  target,
  paid,
  legacy,
}: {
  transactions: SettlementTransaction[];
  paidKeys: Set<string>;
  target: SettlementTransaction;
  paid: boolean;
  legacy: boolean;
}): DebtTogglePlan {
  const targetKey = transactionKey(target);
  const nextPaidKeys = new Set(paidKeys);
  if (paid) {
    nextPaidKeys.add(targetKey);
  } else {
    nextPaidKeys.delete(targetKey);
  }
  const nextAllPaid = transactions.every((transaction) =>
    nextPaidKeys.has(transactionKey(transaction)),
  );

  if (paid) {
    return { marksToWrite: [toDebtMark(target)], unmark: null, nextAllPaid };
  }
  if (legacy) {
    return {
      marksToWrite: transactions
        .filter((transaction) => nextPaidKeys.has(transactionKey(transaction)))
        .map(toDebtMark),
      unmark: null,
      nextAllPaid,
    };
  }
  return {
    marksToWrite: [],
    unmark: { fromKey: target.fromParticipantId, toKey: target.toParticipantId },
    nextAllPaid,
  };
}

// Local-state patch after a successful write: replaces or removes the
// pair's stored mark the same way the repository upsert/delete did.
export function applyMarkChanges(
  marks: DebtMark[],
  plan: Pick<DebtTogglePlan, 'marksToWrite' | 'unmark'>,
): DebtMark[] {
  const touched = new Set(plan.marksToWrite.map((mark) => debtKey(mark.fromKey, mark.toKey)));
  if (plan.unmark) touched.add(debtKey(plan.unmark.fromKey, plan.unmark.toKey));
  return [
    ...marks.filter((mark) => !touched.has(debtKey(mark.fromKey, mark.toKey))),
    ...plan.marksToWrite,
  ];
}
