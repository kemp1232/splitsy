// Pure selection rules for saved people and groups (#6), kept free of the
// repository and UI layers so they're directly unit-testable (same approach
// as validateParticipantName.ts).
import {
  isDuplicateParticipantName,
  validateParticipantName,
} from '@/features/participants/validateParticipantName';

// How many saved-people chips the participants screen offers at most.
export const SAVED_PEOPLE_SUGGESTION_LIMIT = 12;

// Saved people not already on the bill (case-insensitive, trimmed), most
// recently used first (ties by name), capped at `limit`. Callers pass the
// "Add me" name in `existingNames` too, so it never shows as a chip.
export function selectSavedPeopleSuggestions<T extends { name: string; lastUsedAt: string }>(
  savedPeople: T[],
  existingNames: string[],
  limit: number = SAVED_PEOPLE_SUGGESTION_LIMIT,
): T[] {
  return savedPeople
    .filter((person) => !isDuplicateParticipantName(person.name, existingNames))
    .sort((a, b) => {
      if (a.lastUsedAt !== b.lastUsedAt) return a.lastUsedAt < b.lastUsedAt ? 1 : -1;
      return a.name.localeCompare(b.name);
    })
    .slice(0, Math.max(0, limit));
}

// The group members a one-tap group add should create: each name must pass
// validateParticipantName against the bill's names plus the names already
// picked, so members already present, in-group case duplicates and names
// that are blank or too long are skipped.
export function selectGroupMembersToAdd(memberNames: string[], existingNames: string[]): string[] {
  const picked: string[] = [];
  for (const memberName of memberNames) {
    const result = validateParticipantName(memberName, [...existingNames, ...picked]);
    if (result.valid) picked.push(result.name);
  }
  return picked;
}

// Membership changes a group edit needs: ids to add and ids to remove.
export function diffGroupMembers(
  currentIds: string[],
  nextIds: string[],
): { added: string[]; removed: string[] } {
  const current = new Set(currentIds);
  const next = new Set(nextIds);
  return {
    added: [...next].filter((id) => !current.has(id)),
    removed: [...current].filter((id) => !next.has(id)),
  };
}
