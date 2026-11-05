import { findMeParticipant } from '@/features/participants/validateParticipantName';

// Initial local form state for the Payments screen, keyed by participant id
// (integer centavos). Starts from each participant's saved contribution; when
// nothing has been saved yet (every contribution is 0), the signed-in user's
// participant is pre-filled with the full bill total — the common "I paid the
// whole bill" case. Local only: Continue still owns persisting it, and Skip
// discards it. No matching participant means no pre-fill.
export function buildInitialContributions(
  participants: { id: string; name: string; contributedCentavos: number }[],
  billTotalCentavos: number,
  meName: string,
): Record<string, number> {
  const contributions: Record<string, number> = {};
  for (const participant of participants) {
    contributions[participant.id] = participant.contributedCentavos;
  }

  const nothingSavedYet = participants.every(
    (participant) => participant.contributedCentavos === 0,
  );
  if (!nothingSavedYet) return contributions;

  const me = findMeParticipant(participants, meName);
  if (me) contributions[me.id] = billTotalCentavos;
  return contributions;
}
