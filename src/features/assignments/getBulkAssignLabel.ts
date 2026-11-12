import { copy } from '@/constants/copy';
import { displayParticipantName } from '@/features/participants/validateParticipantName';

// Label for the assignments screen's one-tap "assign everything left" action.
// When the signed-in user's participant was found (findMeParticipant), the
// tap assigns every unassigned item straight to them, so the label names who
// ("Assign rest to Kemp"); a legacy 'Me' participant reads as the signed-in
// user's name. With no such participant the tap opens the picker instead,
// and the generic label stays.
export function getBulkAssignLabel(
  meParticipant: { name: string } | undefined,
  meName: string,
): string {
  if (!meParticipant) return copy.assignments.bulkAssignAction;
  return copy.assignments.bulkAssignToAction.replace('{name}', () =>
    displayParticipantName(meParticipant.name, meName),
  );
}
