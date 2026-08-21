// Trip-settlement counterpart to
// src/features/summary/buildParticipantShareDisplay.ts's
// buildParticipantItemShareDisplay — same nonzero-filtering and
// fail-loud-on-mismatch discipline, but this one names every other assignee
// on a shared item instead of a plain boolean. A single-bill summary can get
// away with a generic "(shared)" suffix since the whole card is already
// scoped to one bill's own roster; the trip settlement screen shows a
// person's items across every bill in the trip at once, where "shared" alone
// doesn't say with whom. Kept as its own function (not a new parameter on
// the existing one) so the single-bill Summary screen's already-tested
// behavior is untouched.
import type { ParticipantItemShare } from '@/features/splitting/split.types';

export type TripItemInfo = {
  name: string;
  // Every participant id assigned to this line item (this bill's own ids),
  // including the person whose shares are being built — this function
  // excludes "self" itself, so callers don't have to pre-filter.
  assigneeParticipantIds: string[];
};

export type TripItemShareDisplay = {
  lineItemId: string;
  name: string;
  amountCentavos: number;
  // Display names of every OTHER participant sharing this item, in
  // assignment order; empty when this person is the item's sole assignee.
  sharedWithNames: string[];
};

/**
 * Filters one bill's worth of a participant's item shares down to the
 * nonzero ones (same omission rule as buildParticipantItemShareDisplay) and
 * attaches each one's display name plus the display names of every other
 * assignee it's shared with.
 *
 * Throws if `itemInfoById` is missing an entry for one of `itemShares`' line
 * item ids — same "fail loud on a caller/data mismatch" precedent as
 * buildParticipantItemShareDisplay.
 */
export function buildTripParticipantItemShareDisplay(
  participantId: string,
  itemShares: ParticipantItemShare[],
  itemInfoById: Map<string, TripItemInfo>,
  nameByParticipantId: Map<string, string>,
): TripItemShareDisplay[] {
  return itemShares
    .filter((share) => share.amountCentavos !== 0)
    .map((share) => {
      const info = itemInfoById.get(share.lineItemId);
      if (!info) {
        throw new Error(
          `buildTripParticipantItemShareDisplay: no item info provided for line item ${share.lineItemId}`,
        );
      }
      const sharedWithNames = info.assigneeParticipantIds
        .filter((id) => id !== participantId)
        .map((id) => nameByParticipantId.get(id) ?? '');
      return {
        lineItemId: share.lineItemId,
        name: info.name,
        amountCentavos: share.amountCentavos,
        sharedWithNames,
      };
    });
}
