// Post-MVP scope expansion (approved 2026-08-04, same treatment as the
// 2026-07-31 VLM-backend amendment documented in docs/Splitsy_MVP_Spec.md
// and PLAN.md): tracking who actually contributed toward a bill and
// computing peer-to-peer settlement between participants. This is not part
// of the original MVP spec's section 10 money rules, but it is built to the
// exact same standard — integer centavos only, pure functions, no I/O, and
// an asserted/tested sum invariant.
//
// Placement decision: this lives in `src/features/splitting/` alongside
// `calculateSplit`/`reconciliation.ts` rather than in its own
// `src/features/settlement/` folder. Reasoning (mirrors shareText.ts's own
// placement note for the same kind of decision):
//
// - `computeSettlement` is a direct, pure consumer of `calculateSplit`'s
//   output — a `SettlementParticipant.fairShareCentavos` is exactly one
//   participant's `ParticipantShare.finalTotalCentavos`, the same relationship
//   shareText.ts already has to `SplitCalculationResult`.
// - It adds no new concerns (no contribution-entry UI, no persistence
//   schema) at this layer — it is only the money math for "who owes whom",
//   which is squarely what this folder already owns.
// - A separate `features/settlement/` folder would be justified once this
//   feature grows its own persisted data model (e.g. a `contributions` table)
//   or its own screens/hooks; until then, splitting it out would just add an
//   import hop between two modules that are conceptually one layer.

import type {
  SettlementParticipant,
  SettlementResult,
  SettlementTransaction,
} from './settlement.types';

type Balance = {
  participantId: string;
  // Original index in the `participants` array passed to
  // `computeSettlement` — used only to break ties deterministically (spec
  // 10.3/10.4/10.5's "stable participant sort order" convention, applied
  // here to debtor/creditor matching order instead of remainder-centavo
  // order).
  index: number;
  // Always a positive magnitude: how much this participant is owed
  // (creditor) or owes (debtor), never the signed net balance itself.
  remaining: number;
};

// Larger magnitude first; equal magnitudes keep the earlier original index
// first. Used to pick "the largest-magnitude debtor" / "the largest-
// magnitude creditor" at each step of the greedy match, and to make that
// choice deterministic when two participants are tied.
function byRemainingDescThenStableIndex(a: Balance, b: Balance): number {
  if (a.remaining !== b.remaining) return b.remaining - a.remaining;
  return a.index - b.index;
}

/**
 * Computes the minimal-ish set of peer-to-peer transactions that settles a
 * bill's participants against each other, given what each participant's fair
 * share was (`calculateSplit`'s output) and what they actually contributed.
 *
 * For each participant, `netBalanceCentavos = contributedCentavos -
 * fairShareCentavos`: positive means they paid more than their share (a
 * creditor, owed money by the group), negative means they paid less (a
 * debtor, owes money to the group), zero means they're already settled.
 *
 * Standard greedy debt-simplification: split participants into debtors
 * (negative balance) and creditors (positive balance), repeatedly match the
 * current largest-magnitude debtor against the current largest-magnitude
 * creditor, create a transaction for `min(|debtor balance|, creditor
 * balance)`, reduce both balances by that amount, drop whichever hits
 * exactly zero, and repeat until one side is empty. Both lists are re-sorted
 * every iteration (not just once up front) because reducing the matched
 * pair's balances can change which participant is now the largest remaining
 * debtor/creditor on either side — this keeps the choice at every step
 * genuinely "the current largest", not just the largest in some initial
 * snapshot. Ties (equal remaining magnitude) are always broken by the
 * original `participants` array order via `byRemainingDescThenStableIndex`,
 * so results are deterministic run-to-run for the same input.
 *
 * `sum(all contributedCentavos)` will not generally equal
 * `sum(all fairShareCentavos)` (the bill's computed total) — most commonly
 * because nobody has recorded a contribution yet (every
 * `contributedCentavos` is the 0 default), in which case every participant
 * is technically a debtor and there are no creditors at all to settle
 * against. That is a different situation from "money needs to move between
 * group members" — it means the bill itself hasn't been paid to the
 * merchant/organizer yet. This gap is surfaced explicitly as
 * `unaccountedCentavos` (`sum(fairShareCentavos) - sum(contributedCentavos)`,
 * positive when the bill is under-covered, negative when more was
 * contributed than the bill required) rather than silently forcing a
 * settlement that cannot fully resolve. When the greedy loop above runs out
 * of one side first, whatever is left unmatched on the other side is always
 * consistent with `unaccountedCentavos` (verified as an invariant in
 * settlement.test.ts) — the two are computed independently on purpose, as a
 * cross-check, rather than one being derived from the other in the
 * implementation itself.
 */
export function computeSettlement(participants: SettlementParticipant[]): SettlementResult {
  const totalFairShareCentavos = participants.reduce(
    (sum, participant) => sum + participant.fairShareCentavos,
    0,
  );
  const totalContributedCentavos = participants.reduce(
    (sum, participant) => sum + participant.contributedCentavos,
    0,
  );
  const unaccountedCentavos = totalFairShareCentavos - totalContributedCentavos;

  const debtors: Balance[] = [];
  const creditors: Balance[] = [];

  participants.forEach((participant, index) => {
    const { participantId } = participant;
    const netBalanceCentavos = participant.contributedCentavos - participant.fairShareCentavos;
    if (netBalanceCentavos < 0) {
      debtors.push({ participantId, index, remaining: -netBalanceCentavos });
    } else if (netBalanceCentavos > 0) {
      creditors.push({ participantId, index, remaining: netBalanceCentavos });
    }
  });

  const transactions: SettlementTransaction[] = [];

  while (debtors.length > 0 && creditors.length > 0) {
    debtors.sort(byRemainingDescThenStableIndex);
    creditors.sort(byRemainingDescThenStableIndex);

    const debtor = debtors[0]!;
    const creditor = creditors[0]!;
    const amountCentavos = Math.min(debtor.remaining, creditor.remaining);

    transactions.push({
      fromParticipantId: debtor.participantId,
      toParticipantId: creditor.participantId,
      amountCentavos,
    });

    debtor.remaining -= amountCentavos;
    creditor.remaining -= amountCentavos;

    if (debtor.remaining === 0) debtors.shift();
    if (creditor.remaining === 0) creditors.shift();
  }

  return { transactions, unaccountedCentavos };
}
