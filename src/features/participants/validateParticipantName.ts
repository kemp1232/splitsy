// Pure, framework-free rules for participant names (spec F-012, section
// 13.12, section 20.1). Kept independent of the repository and UI layers
// (ParticipantEditorSheet, participants.tsx, assignments.tsx all import from
// here) so the validation itself is directly unit-testable, mirroring how
// MlKitReceiptOcrService's toRect/toLine/toBlock and
// BackendReceiptOcrService's groqExtractionToParsedReceipt pull pure
// mapping/validation logic out of their surrounding class.

export const MAX_PARTICIPANT_NAME_LENGTH = 30;

// Fallback name for the "Add me" quick-add action (spec F-013's "Assign all
// unassigned to me") when there is no signed-in user name. Also the legacy
// name that older bills may contain, so bulk-assign still matches it.
export const QUICK_ADD_ME_NAME = 'Me';

// Name used by "Add me": the signed-in user's name, trimmed and cut to the
// participant name limit, or the 'Me' fallback when it's empty/missing.
export function resolveQuickAddMeName(sessionName: string | null | undefined): string {
  const name = (sessionName ?? '').trim().slice(0, MAX_PARTICIPANT_NAME_LENGTH).trim();
  return name || QUICK_ADD_ME_NAME;
}

// Case-insensitive normalization used for duplicate detection (spec F-012 /
// section 13.12's "That name is already in this bill." error).
export function normalizeParticipantName(name: string): string {
  return name.trim().toLowerCase();
}

// True when `name` case-insensitively matches (after trimming) any name in
// `existingNames`.
export function isDuplicateParticipantName(name: string, existingNames: string[]): boolean {
  const normalized = normalizeParticipantName(name);
  return existingNames.some(
    (existingName) => normalizeParticipantName(existingName) === normalized,
  );
}

export type ParticipantNameValidationResult =
  { valid: true; name: string } | { valid: false; reason: 'required' | 'tooLong' | 'duplicate' };

// Full validation pipeline for a candidate participant name (spec section
// 13.12): required -> length -> duplicate, in that order. Returns a reason
// code rather than copy text so the UI stays responsible for wording (the
// centralized copy module owns the actual strings).
export function validateParticipantName(
  rawName: string,
  existingNames: string[],
): ParticipantNameValidationResult {
  const trimmed = rawName.trim();
  if (!trimmed) {
    return { valid: false, reason: 'required' };
  }
  if (trimmed.length > MAX_PARTICIPANT_NAME_LENGTH) {
    return { valid: false, reason: 'tooLong' };
  }
  if (isDuplicateParticipantName(trimmed, existingNames)) {
    return { valid: false, reason: 'duplicate' };
  }
  return { valid: true, name: trimmed };
}

// The participant who is "me" (the signed-in user): matched by `meName`
// (resolveQuickAddMeName's output — what "Add me" creates), falling back to
// the legacy 'Me' name older bills may contain. Used by assignments.tsx's
// bulk-assign-to-me and the Payments screen's pre-fill.
export function findMeParticipant<T extends { name: string }>(
  participants: T[],
  meName: string,
): T | undefined {
  const findByName = (name: string) =>
    participants.find(
      (participant) =>
        normalizeParticipantName(participant.name) === normalizeParticipantName(name),
    );
  return findByName(meName) ?? findByName(QUICK_ADD_ME_NAME);
}

// Name to show for a participant: a stored legacy/fallback 'Me' reads as the
// signed-in user's name (`meName`, resolveQuickAddMeName's output) on the
// Summary and saved-bill screens and in their shared text. Display-only — the
// stored name is unchanged.
export function displayParticipantName(name: string, meName: string): string {
  return normalizeParticipantName(name) === normalizeParticipantName(QUICK_ADD_ME_NAME)
    ? meName
    : name;
}
