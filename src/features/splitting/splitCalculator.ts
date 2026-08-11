import { allocateEqual, allocateProportional } from './allocation';
import type {
  ParticipantAdjustmentShare,
  ParticipantItemShare,
  ParticipantShare,
  SplitAdjustment,
  SplitCalculationInput,
  SplitCalculationResult,
} from './split.types';

/**
 * Computes every participant's final total for one bill (spec section 10),
 * from plain data only — no repository or database types, so this is
 * callable with whatever a screen/hook has already loaded and shaped into
 * split.types.ts's shapes.
 *
 * 1. Each line item's total is split across its assignees via
 *    `allocateEqual` (spec 10.3), collected into each assignee's
 *    `itemShares` (spec F-016/F-017's itemized breakdown) and accumulated
 *    into each assignee's item subtotal.
 * 2. Each adjustment's amount is split across every participant: via
 *    `allocateEqual` for EQUAL (10.4), `allocateProportional` weighted by
 *    each participant's item subtotal for PROPORTIONAL (10.5), or the
 *    adjustment's already-stored, already-validated custom amounts for
 *    CUSTOM (10.6) — collected into each participant's `adjustmentShares`
 *    and accumulated into each participant's adjustment total.
 * 3. Each participant's final total is their item subtotal plus their
 *    adjustment total.
 *
 * `itemSubtotalCentavos`/`adjustmentTotalCentavos` on each ParticipantShare
 * are exactly `sum(itemShares)`/`sum(adjustmentShares)` — the itemized
 * arrays are the same allocation work these aggregates were already built
 * from, just also retained instead of discarded, so this stays a single
 * source of truth rather than two independently-computed numbers that could
 * drift apart.
 *
 * `input.participants` must already be in the bill's stable sort order
 * (spec 9.3's `sortOrder`) — that positional order is what `allocateEqual`/
 * `allocateProportional` use to break remainder ties, so passing
 * participants out of order changes who receives an extra centavo.
 *
 * Before returning, this asserts the spec 10.7 invariant
 * (`sum(finalTotalCentavos) === computedTotalCentavos`) via
 * `assertSplitInvariant` — a violation throws rather than returning a
 * silently-wrong result.
 */
export function calculateSplit(input: SplitCalculationInput): SplitCalculationResult {
  const { participants, items, adjustments } = input;

  if (participants.length === 0) {
    throw new Error('calculateSplit requires at least one participant');
  }

  const participantIds = participants.map((participant) => participant.participantId);
  const participantIdSet = new Set(participantIds);

  // Per-participant itemized breakdowns (spec F-016/F-017), built up in the
  // same loops that used to only accumulate the aggregate totals.
  const itemSharesByParticipantId = new Map<string, ParticipantItemShare[]>(
    participantIds.map((participantId) => [participantId, []]),
  );
  const itemSubtotalByParticipantId = new Map<string, number>(
    participantIds.map((participantId) => [participantId, 0]),
  );

  for (const item of items) {
    const shares = allocateEqual(item.lineTotalCentavos, item.assigneeParticipantIds.length);
    item.assigneeParticipantIds.forEach((participantId, assigneeIndex) => {
      if (!participantIdSet.has(participantId)) {
        throw new Error(
          `calculateSplit: line item ${item.lineItemId} is assigned to unknown participant ${participantId}`,
        );
      }
      const share = shares[assigneeIndex] ?? 0;
      itemSharesByParticipantId.get(participantId)?.push({
        lineItemId: item.lineItemId,
        amountCentavos: share,
      });
      itemSubtotalByParticipantId.set(
        participantId,
        (itemSubtotalByParticipantId.get(participantId) ?? 0) + share,
      );
    });
  }

  // Positional weights in the same stable order as `participants`, for
  // PROPORTIONAL adjustments (spec 10.5) — each participant's item subtotal
  // computed above, before any adjustment is applied.
  const itemSubtotalWeights = participantIds.map(
    (participantId) => itemSubtotalByParticipantId.get(participantId) ?? 0,
  );

  const adjustmentSharesByParticipantId = new Map<string, ParticipantAdjustmentShare[]>(
    participantIds.map((participantId) => [participantId, []]),
  );
  const adjustmentTotalByParticipantId = new Map<string, number>(
    participantIds.map((participantId) => [participantId, 0]),
  );

  for (const adjustment of adjustments) {
    const shares = allocateAdjustmentShares(adjustment, participantIds, itemSubtotalWeights);
    shares.forEach((share, index) => {
      const participantId = participantIds[index]!;
      adjustmentSharesByParticipantId.get(participantId)?.push({
        adjustmentId: adjustment.adjustmentId,
        amountCentavos: share,
      });
      adjustmentTotalByParticipantId.set(
        participantId,
        (adjustmentTotalByParticipantId.get(participantId) ?? 0) + share,
      );
    });
  }

  const participantShares: ParticipantShare[] = participantIds.map((participantId) => {
    const itemShares = itemSharesByParticipantId.get(participantId) ?? [];
    const adjustmentShares = adjustmentSharesByParticipantId.get(participantId) ?? [];
    // Derived from the itemized arrays above (not the running-total maps
    // directly) so the aggregate fields can never drift from the itemized
    // breakdown they're supposed to summarize.
    const itemSubtotalCentavos = itemShares.reduce((sum, share) => sum + share.amountCentavos, 0);
    const adjustmentTotalCentavos = adjustmentShares.reduce(
      (sum, share) => sum + share.amountCentavos,
      0,
    );
    return {
      participantId,
      itemShares,
      adjustmentShares,
      itemSubtotalCentavos,
      adjustmentTotalCentavos,
      finalTotalCentavos: itemSubtotalCentavos + adjustmentTotalCentavos,
    };
  });

  const itemSubtotalCentavos = items.reduce((sum, item) => sum + item.lineTotalCentavos, 0);
  const adjustmentTotalCentavos = adjustments.reduce(
    (sum, adjustment) => sum + adjustment.amountCentavos,
    0,
  );
  const computedTotalCentavos = itemSubtotalCentavos + adjustmentTotalCentavos;

  const result: SplitCalculationResult = {
    participantShares,
    itemSubtotalCentavos,
    adjustmentTotalCentavos,
    computedTotalCentavos,
  };

  assertSplitInvariant(result);

  return result;
}

function allocateAdjustmentShares(
  adjustment: SplitAdjustment,
  participantIds: string[],
  itemSubtotalWeights: number[],
): number[] {
  switch (adjustment.allocationMethod) {
    case 'EQUAL':
      return allocateEqual(adjustment.amountCentavos, participantIds.length);
    case 'PROPORTIONAL':
      return allocateProportional(adjustment.amountCentavos, itemSubtotalWeights);
    case 'CUSTOM': {
      if (!adjustment.customAllocations) {
        throw new Error(
          `calculateSplit: adjustment ${adjustment.adjustmentId} is CUSTOM but has no stored allocations`,
        );
      }
      const amountByParticipantId = new Map(
        adjustment.customAllocations.map((allocation) => [
          allocation.participantId,
          allocation.amountCentavos,
        ]),
      );
      return participantIds.map((participantId) => amountByParticipantId.get(participantId) ?? 0);
    }
    default: {
      const exhaustiveCheck: never = adjustment.allocationMethod;
      throw new Error(`calculateSplit: unknown allocation method ${String(exhaustiveCheck)}`);
    }
  }
}

// Thrown by assertSplitInvariant so a spec 10.7 violation is loud (a thrown,
// identifiable error) rather than a silently wrong total reaching the UI.
export class SplitInvariantError extends Error {}

/**
 * Verifies spec 10.7's final total invariant:
 * `sum(all participant final totals) === computed bill total`. Exported on
 * its own (not just called internally by calculateSplit) so it can also be
 * unit-tested directly against a deliberately-broken result.
 */
export function assertSplitInvariant(result: SplitCalculationResult): void {
  const sumOfFinalTotals = result.participantShares.reduce(
    (sum, share) => sum + share.finalTotalCentavos,
    0,
  );
  if (sumOfFinalTotals !== result.computedTotalCentavos) {
    throw new SplitInvariantError(
      `Split invariant violated (spec 10.7): sum of participant final totals ` +
        `(${sumOfFinalTotals}) does not equal the computed bill total (${result.computedTotalCentavos}).`,
    );
  }
}
