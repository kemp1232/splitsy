// Pure, framework-free rules for participant names (spec F-012, section
// 13.12, section 20.1). Kept independent of the repository and UI layers
// (ParticipantEditorSheet, participants.tsx, assignments.tsx all import from
// here) so the validation itself is directly unit-testable, mirroring how
// MlKitReceiptOcrService's toRect/toLine/toBlock and
// BackendReceiptOcrService's groqExtractionToParsedReceipt pull pure
// mapping/validation logic out of their surrounding class.

export const MAX_PARTICIPANT_NAME_LENGTH = 30;

// The exact name created by the "Add me" quick-add action (spec F-013's
// "Assign all unassigned to me"). The assignments screen's bulk-assign
// shortcut depends on matching this exact string, so it's centralized here
// once instead of being redeclared per screen.
export const QUICK_ADD_ME_NAME = 'Me';

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
