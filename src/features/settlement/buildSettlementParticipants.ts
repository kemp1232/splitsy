// Post-MVP scope expansion (see settlement.ts's header comment for the full
// rationale) — shapes calculateSplit's already-computed ParticipantShare[]
// (fair share = finalTotalCentavos, spec 10.7 invariant) alongside each
// participant's currently-saved contributedCentavos (the Payments screen's
// own data, src/db/schema.ts) into computeSettlement's plain
// SettlementParticipant[] input.
//
// Pulled out of the summary/saved-bill-detail screens so this
// repository-row -> settlement-input shaping is directly unit-testable
// without a database or a rendered screen in the loop — mirrors
// buildParticipantShareDisplay.ts's own precedent for the same kind of
// screen-adjacent shaping work.
import type { SettlementParticipant } from '@/features/splitting/settlement.types';
import type { ParticipantShare } from '@/features/splitting/split.types';

export type SettlementContributionInfo = {
  contributedCentavos: number;
};

/**
 * Order is preserved from `shares` (calculateSplit's own stable participant
 * order, spec 10.3-10.5) — computeSettlement's tie-breaking depends on that
 * order (settlement.types.ts's own doc comment), so this never re-sorts or
 * otherwise reorders its input.
 *
 * Throws if `contributionByParticipantId` is missing an entry for one of
 * `shares`' participant ids — same fail-loud-on-caller/data-mismatch
 * precedent as buildParticipantShareDisplay.ts, rather than silently
 * defaulting a genuinely-missing participant to a zero contribution.
 */
export function buildSettlementParticipants(
  shares: Pick<ParticipantShare, 'participantId' | 'finalTotalCentavos'>[],
  contributionByParticipantId: Map<string, SettlementContributionInfo>,
): SettlementParticipant[] {
  return shares.map((share) => {
    const info = contributionByParticipantId.get(share.participantId);
    if (!info) {
      throw new Error(
        `buildSettlementParticipants: no contribution info provided for participant ${share.participantId}`,
      );
    }
    return {
      participantId: share.participantId,
      fairShareCentavos: share.finalTotalCentavos,
      contributedCentavos: info.contributedCentavos,
    };
  });
}
