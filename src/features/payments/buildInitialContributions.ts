import { findMeParticipant } from '@/features/participants/validateParticipantName';

// Initial local form state for the Payments screen, keyed by participant id
// (integer centavos). Starts from each participant's saved contribution; when
// nothing has been saved yet (every contribution is 0), the signed-in user's
// participant is pre-filled with the full bill total — the common "I paid the
// whole bill" case. Local only: Continue still owns persisting it, and Skip
// discards it. No matching participant means no pre-fill.
// A saved whole-bill payment that has gone stale (the signed-in user is the
// only nonzero payer, but at an amount other than the current total — the
// items changed after it was saved) is treated the same way and follows the
// current total. Anyone else's saved amount, or a split between several
// payers, is kept exactly as loaded.
export function buildInitialContributions(
  participants: { id: string; name: string; contributedCentavos: number }[],
  billTotalCentavos: number,
  meName: string,
): Record<string, number> {
  const contributions: Record<string, number> = {};
  for (const participant of participants) {
    contributions[participant.id] = participant.contributedCentavos;
  }

  const me = findMeParticipant(participants, meName);
  if (!me) return contributions;

  const nonzeroPayers = participants.filter((participant) => participant.contributedCentavos !== 0);
  const nothingSavedYet = nonzeroPayers.length === 0;
  const meIsOnlyPayer = nonzeroPayers.length === 1 && nonzeroPayers[0]?.id === me.id;
  if (nothingSavedYet || meIsOnlyPayer) contributions[me.id] = billTotalCentavos;
  return contributions;
}

// Keeps a "paid the whole bill" amount in step with a bill total that changed
// while the Payments screen stayed mounted (e.g. items edited from Summary):
// when exactly one participant has a nonzero amount and it equals the
// previous total, it moves to the new total. Anything else — a split, a
// partial payment, an amount the user typed — comes back unchanged (the same
// object, so callers can tell nothing changed).
export function followWholeBillPayer(
  contributions: Record<string, number>,
  previousTotalCentavos: number,
  newTotalCentavos: number,
): Record<string, number> {
  if (previousTotalCentavos === newTotalCentavos) return contributions;
  const nonzero = Object.entries(contributions).filter(([, centavos]) => centavos !== 0);
  const onlyPayer = nonzero.length === 1 ? nonzero[0] : undefined;
  if (!onlyPayer) return contributions;
  const [payerId, centavos] = onlyPayer;
  if (centavos !== previousTotalCentavos) return contributions;
  return { ...contributions, [payerId]: newTotalCentavos };
}
