// Post-MVP scope expansion (multi-bill trips, see the trip DB layer's own
// header/PR notes for the persisted `trips`/`tripParticipants` shapes this
// module aggregates). This is a pure, no-I/O consumer of the existing
// per-bill `calculateSplit`/`computeSettlement` pipeline — it deliberately
// does not reimplement any allocation or settlement math itself, it only
// aggregates their outputs across multiple bills sharing one trip roster.
//
// Placement decision: lives in its own `src/features/trips/` folder (not
// folded into `src/features/splitting/`) because unlike
// `buildSettlementParticipants.ts` or `settlement.ts`, this module's whole
// reason to exist is trip-shaped data (a roster spanning many bills) rather
// than being a direct one-bill consumer of `calculateSplit`'s output.

import { isSafeCentavos } from '@/lib/money';
import { calculateSplit } from '@/features/splitting/splitCalculator';
import { computeSettlement } from '@/features/splitting/settlement';
import type {
  SplitAdjustment,
  SplitLineItem,
  SplitParticipant,
} from '@/features/splitting/split.types';
import type { SettlementResult } from '@/features/splitting/settlement.types';

// Everything needed to run one bill's own `calculateSplit` plus fold its
// result into a trip-wide balance, per bill.
export type TripBillData = {
  billId: string;
  participants: SplitParticipant[];
  items: SplitLineItem[];
  adjustments: SplitAdjustment[];
  contributedCentavosByParticipantId: Map<string, number>;
  // participantId (this bill's own row id) -> canonical cross-bill identity
  // (tripParticipantId when the person was copied from the trip roster, or
  // the participant's own bill-scoped id when they were a one-off addition
  // to just this bill). Built by the caller, not this module.
  identityByParticipantId: Map<string, string>;
};

export type TripPersonBalance = {
  identityId: string;
  fairShareCentavos: number;
  contributedCentavos: number;
};

export type TripSettlementResult = {
  perPerson: TripPersonBalance[];
  settlement: SettlementResult;
};

// Resolves one bill-scoped participant id to its trip-wide canonical
// identity. Falls back to the participant's own id — never to name matching
// — because a bill-only participant (no `tripParticipantId`) cannot appear
// in any other bill of the trip by construction (they were added just for
// that one bill), so their own bill-scoped id is already a safe, unique
// stand-in for "this person, across the trip". Matching by display name
// instead would be a bug: two different people who each happened to type
// "Alex" into two different bills are NOT the same person, and must never be
// merged into one settlement identity just because their names collide.
function resolveIdentity(bill: TripBillData, participantId: string): string {
  return bill.identityByParticipantId.get(participantId) ?? participantId;
}

/**
 * Computes a trip-wide settlement across every bill passed in.
 *
 * 1. Each bill is run through the existing, unchanged `calculateSplit` on
 *    its own — never merged with another bill's items/adjustments into one
 *    call, since a PROPORTIONAL adjustment's weighting must reflect only
 *    that one bill's own item subtotals (mixing bills in would corrupt that
 *    weighting for every bill involved).
 * 2. Every participant share's `finalTotalCentavos` (that person's fair
 *    share on that one bill) and every recorded contribution are resolved to
 *    a canonical cross-bill identity (see `resolveIdentity` above) and
 *    accumulated into running per-identity totals across all bills.
 * 3. The aggregated per-identity totals are validated against
 *    `isSafeCentavos` — a per-bill amount can be safe on its own but a sum
 *    across many bills could still exceed `MAX_SAFE_CENTAVOS`, which nothing
 *    upstream of this aggregation step checks.
 * 4. The aggregated per-identity balances are handed to the existing,
 *    unchanged `computeSettlement` exactly as a single-bill settlement would
 *    be, since by this point they are shaped identically to a one-bill
 *    settlement's input.
 *
 * Bills with zero participants, zero bills total, or any other degenerate
 * input are the caller's responsibility to avoid passing in (except the
 * explicit empty-`bills` case below, which is handled directly since
 * `calculateSplit` throws on zero participants and would otherwise make an
 * empty trip unrepresentable).
 */
export function computeTripSettlement(bills: TripBillData[]): TripSettlementResult {
  if (bills.length === 0) {
    return { perPerson: [], settlement: { transactions: [], unaccountedCentavos: 0 } };
  }

  const fairShareByIdentity = new Map<string, number>();
  const contributedByIdentity = new Map<string, number>();
  // Preserves first-seen order across bills for a stable, deterministic
  // `perPerson` array (and therefore a stable tie-break order once handed to
  // `computeSettlement`).
  const identityOrder: string[] = [];

  function ensureIdentity(identityId: string): void {
    if (!fairShareByIdentity.has(identityId)) {
      fairShareByIdentity.set(identityId, 0);
      contributedByIdentity.set(identityId, 0);
      identityOrder.push(identityId);
    }
  }

  for (const bill of bills) {
    const result = calculateSplit({
      participants: bill.participants,
      items: bill.items,
      adjustments: bill.adjustments,
    });

    for (const share of result.participantShares) {
      const identityId = resolveIdentity(bill, share.participantId);
      ensureIdentity(identityId);
      fairShareByIdentity.set(
        identityId,
        (fairShareByIdentity.get(identityId) ?? 0) + share.finalTotalCentavos,
      );
    }

    for (const [participantId, contributedCentavos] of bill.contributedCentavosByParticipantId) {
      const identityId = resolveIdentity(bill, participantId);
      ensureIdentity(identityId);
      contributedByIdentity.set(
        identityId,
        (contributedByIdentity.get(identityId) ?? 0) + contributedCentavos,
      );
    }
  }

  const perPerson: TripPersonBalance[] = identityOrder.map((identityId) => ({
    identityId,
    fairShareCentavos: fairShareByIdentity.get(identityId) ?? 0,
    contributedCentavos: contributedByIdentity.get(identityId) ?? 0,
  }));

  for (const person of perPerson) {
    if (!isSafeCentavos(person.fairShareCentavos)) {
      throw new Error(
        `computeTripSettlement: aggregated fair share for ${person.identityId} (${person.fairShareCentavos}) exceeds the safe centavo limit`,
      );
    }
    if (!isSafeCentavos(person.contributedCentavos)) {
      throw new Error(
        `computeTripSettlement: aggregated contribution for ${person.identityId} (${person.contributedCentavos}) exceeds the safe centavo limit`,
      );
    }
  }

  const settlement = computeSettlement(
    perPerson.map((person) => ({
      participantId: person.identityId,
      fairShareCentavos: person.fairShareCentavos,
      contributedCentavos: person.contributedCentavos,
    })),
  );

  return { perPerson, settlement };
}
