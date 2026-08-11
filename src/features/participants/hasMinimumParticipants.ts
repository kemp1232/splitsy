// Spec F-012 / section 20.1 ("Bill validation"): a bill needs at least two
// participants before continuing to item assignment. Pulled out of
// participants.tsx so the boundary itself is directly unit-testable.
export const MINIMUM_PARTICIPANTS = 2;

export function hasMinimumParticipants(participantCount: number): boolean {
  return participantCount >= MINIMUM_PARTICIPANTS;
}
