// Post-MVP scope expansion (approved 2026-08-04, same treatment as the
// settlement feature it supports — see settlement.ts's header comment).
//
// Diffs the Payments screen's in-progress local form state against what was
// originally loaded from participantsRepository, returning only the entries
// whose contribution actually changed this session — so Continue only writes
// the participants a user actually touched (spec-adjacent "don't write what
// didn't change" convention, matching adjustments.tsx's own
// only-persist-what's-dirty handling elsewhere in this codebase) rather than
// unconditionally re-saving every participant on the bill.
//
// Pulled out of the screen so this diffing logic is directly unit-testable
// without a database or a rendered screen in the loop.

export type ContributionUpdate = {
  participantId: string;
  contributedCentavos: number;
};

/**
 * `original` is the already-loaded participant rows (id + the
 * contributedCentavos value they had when the Payments screen loaded).
 * `currentContributionsByParticipantId` is the screen's current local form
 * state, keyed by participant id.
 *
 * A participant id present in `original` but missing from
 * `currentContributionsByParticipantId` is left out of the result entirely
 * (nothing to write — the form never touched it), rather than treated as an
 * implicit zero.
 */
export function computeContributionUpdates(
  original: { id: string; contributedCentavos: number }[],
  currentContributionsByParticipantId: Map<string, number>,
): ContributionUpdate[] {
  const updates: ContributionUpdate[] = [];

  for (const participant of original) {
    const current = currentContributionsByParticipantId.get(participant.id);
    if (current === undefined) continue;
    if (current !== participant.contributedCentavos) {
      updates.push({ participantId: participant.id, contributedCentavos: current });
    }
  }

  return updates;
}
