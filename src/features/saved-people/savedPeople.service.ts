import { savedPeopleRepository } from '@/db/repositories/savedPeople.repository';
import { normalizeParticipantName } from '@/features/participants/validateParticipantName';
import { nowIso } from '@/lib/date';

// Remembers names just added to a bill as saved people (#6). Only standalone
// bills (tripId null) feed the store — trip bills have their own roster.
// Never throws: remembering is a convenience and must never block or fail
// adding the participant, so storage errors are swallowed (logged in dev).
export async function rememberParticipantNames(
  names: string[],
  tripId: string | null,
): Promise<void> {
  if (tripId !== null) return;
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const raw of names) {
    const name = raw.trim();
    const normalized = normalizeParticipantName(name);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    unique.push(name);
  }
  const timestamp = nowIso();
  try {
    for (const name of unique) {
      await savedPeopleRepository.touch(name, timestamp);
    }
  } catch (error) {
    if (__DEV__) console.error('[rememberParticipantNames] failed:', error);
  }
}
