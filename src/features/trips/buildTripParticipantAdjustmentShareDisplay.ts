// Adjustment counterpart to buildTripParticipantItemShareDisplay: one bill's
// worth of a person's share of each fee, tax, tip or discount, labeled with
// the adjustment's own label. Listed under that bill's items on the trip
// settlement card so each bill's lines add up to what the person owes for it
// (ParticipantShare.finalTotalCentavos = sum(itemShares) + sum(adjustmentShares)).
import type { ParticipantAdjustmentShare } from '@/features/splitting/split.types';

export type TripAdjustmentShareDisplay = {
  adjustmentId: string;
  label: string;
  // Negative for a discount.
  amountCentavos: number;
};

/**
 * Drops zero shares (same omission rule as the item builder) and attaches
 * each remaining share's label. Throws if `labelByAdjustmentId` has no entry
 * for a share — same "fail loud on a caller/data mismatch" precedent as
 * buildTripParticipantItemShareDisplay.
 */
export function buildTripParticipantAdjustmentShareDisplay(
  adjustmentShares: ParticipantAdjustmentShare[],
  labelByAdjustmentId: Map<string, string>,
): TripAdjustmentShareDisplay[] {
  return adjustmentShares
    .filter((share) => share.amountCentavos !== 0)
    .map((share) => {
      const label = labelByAdjustmentId.get(share.adjustmentId);
      if (label === undefined) {
        throw new Error(
          `buildTripParticipantAdjustmentShareDisplay: no label provided for adjustment ${share.adjustmentId}`,
        );
      }
      return { adjustmentId: share.adjustmentId, label, amountCentavos: share.amountCentavos };
    });
}
