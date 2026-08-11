// Shapes one participant's already-computed ParticipantShare (spec
// split.types.ts — plain ids and centavo amounts only) into the display-ready
// rows the summary screen's expanded PersonTotalCard renders (spec F-016):
// each nonzero item/adjustment share, matched to its display name/label, plus
// (for items only) whether that item was shared with anyone else — the
// signal spec 13.18's "shared item suffix" needs. Pulled out of the screen
// and component so this id-matching + "is this item shared" computation is
// directly unit-testable without rendering anything, mirroring the same
// reasoning documented on partitionLineItemsByAssignment.ts.
import type {
  ParticipantAdjustmentShare,
  ParticipantItemShare,
} from '@/features/splitting/split.types';

// Everything about a line item this module needs to know beyond what's
// already on ParticipantItemShare — its display name, and how many
// participants it's assigned to (spec 13.18: append the "shared" suffix only
// when more than one person shares an item).
export type SummaryItemInfo = {
  name: string;
  assigneeCount: number;
};

export type SummaryAdjustmentInfo = {
  label: string;
};

export type ParticipantItemShareDisplay = {
  lineItemId: string;
  name: string;
  amountCentavos: number;
  // True when the underlying line item has more than one assignee — the
  // summary screen appends copy.summary.sharedSuffix to `name` when this is
  // true (spec 13.18's "Shared item suffix").
  shared: boolean;
};

export type ParticipantAdjustmentShareDisplay = {
  adjustmentId: string;
  label: string;
  amountCentavos: number;
};

/**
 * Filters a participant's item shares down to the nonzero ones (a ₱0 share
 * of an item isn't worth showing — same omission rule buildShareText already
 * applies) and attaches each one's display name and "shared" flag.
 *
 * Throws if `itemInfoById` is missing an entry for one of `itemShares`' line
 * item ids — same "fail loud on a caller/data mismatch rather than silently
 * drop a row" precedent as buildShareText.
 */
export function buildParticipantItemShareDisplay(
  itemShares: ParticipantItemShare[],
  itemInfoById: Map<string, SummaryItemInfo>,
): ParticipantItemShareDisplay[] {
  return itemShares
    .filter((share) => share.amountCentavos !== 0)
    .map((share) => {
      const info = itemInfoById.get(share.lineItemId);
      if (!info) {
        throw new Error(
          `buildParticipantItemShareDisplay: no item info provided for line item ${share.lineItemId}`,
        );
      }
      return {
        lineItemId: share.lineItemId,
        name: info.name,
        amountCentavos: share.amountCentavos,
        shared: info.assigneeCount > 1,
      };
    });
}

/**
 * Filters a participant's adjustment shares down to the nonzero ones and
 * attaches each one's display label. Same nonzero-omission and
 * fail-loud-on-mismatch rules as buildParticipantItemShareDisplay above.
 */
export function buildParticipantAdjustmentShareDisplay(
  adjustmentShares: ParticipantAdjustmentShare[],
  adjustmentInfoById: Map<string, SummaryAdjustmentInfo>,
): ParticipantAdjustmentShareDisplay[] {
  return adjustmentShares
    .filter((share) => share.amountCentavos !== 0)
    .map((share) => {
      const info = adjustmentInfoById.get(share.adjustmentId);
      if (!info) {
        throw new Error(
          `buildParticipantAdjustmentShareDisplay: no adjustment info provided for adjustment ${share.adjustmentId}`,
        );
      }
      return {
        adjustmentId: share.adjustmentId,
        label: info.label,
        amountCentavos: share.amountCentavos,
      };
    });
}
