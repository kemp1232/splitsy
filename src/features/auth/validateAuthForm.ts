// Pure, framework-free validation rules for the (auth) screens' forms (sign
// in, register, forgot password, reset password). Mirrors
// src/features/participants/validateParticipantName.ts's shape: reason codes
// rather than copy text, so the centralized copy module
// (src/constants/copy.ts) stays the single place that owns actual wording.
//
// Not from the spec (section 13 predates the 2026-08-25 account-system
// Amendment) — there is no exact-copy contract to match here, only this
// codebase's own conventions.

// Better Auth's own emailAndPassword defaults when server/src/auth.ts
// doesn't override them (see server/node_modules/better-auth's
// create-context.mjs: `minPasswordLength: ... || 8` / `maxPasswordLength: ...
// || 128`). Validating to the same bounds client-side catches a too-short/
// too-long password before a round trip to the server, rather than
// duplicating a different, made-up limit.
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;

export const MAX_DISPLAY_NAME_LENGTH = 80;

// Deliberately permissive — this only needs to catch obviously-empty or
// obviously-malformed input before hitting the server, which is the real
// source of truth for whether an address is deliverable. Not a full RFC 5322
// validator.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type EmailValidationResult =
  { valid: true; email: string } | { valid: false; reason: 'required' | 'invalid' };

export function validateEmail(rawEmail: string): EmailValidationResult {
  const trimmed = rawEmail.trim();
  if (!trimmed) {
    return { valid: false, reason: 'required' };
  }
  if (!EMAIL_PATTERN.test(trimmed)) {
    return { valid: false, reason: 'invalid' };
  }
  return { valid: true, email: trimmed };
}

export type PasswordValidationResult =
  { valid: true; password: string } | { valid: false; reason: 'required' | 'tooShort' | 'tooLong' };

// For sign-in, where the only thing worth checking client-side is that the
// field isn't empty — the server (not a client-side length guess) is the
// source of truth for whether an existing account's password is correct.
export function validateSignInPassword(rawPassword: string): PasswordValidationResult {
  if (!rawPassword) {
    return { valid: false, reason: 'required' };
  }
  return { valid: true, password: rawPassword };
}

// For register/reset-password, where the password is new and Better Auth
// itself will enforce these same bounds server-side (see MIN/MAX_PASSWORD
// _LENGTH's comment above) — checking here just surfaces the same error
// without a round trip.
export function validateNewPassword(rawPassword: string): PasswordValidationResult {
  if (!rawPassword) {
    return { valid: false, reason: 'required' };
  }
  if (rawPassword.length < MIN_PASSWORD_LENGTH) {
    return { valid: false, reason: 'tooShort' };
  }
  if (rawPassword.length > MAX_PASSWORD_LENGTH) {
    return { valid: false, reason: 'tooLong' };
  }
  return { valid: true, password: rawPassword };
}

export type DisplayNameValidationResult =
  { valid: true; name: string } | { valid: false; reason: 'required' | 'tooLong' };

export function validateDisplayName(rawName: string): DisplayNameValidationResult {
  const trimmed = rawName.trim();
  if (!trimmed) {
    return { valid: false, reason: 'required' };
  }
  if (trimmed.length > MAX_DISPLAY_NAME_LENGTH) {
    return { valid: false, reason: 'tooLong' };
  }
  return { valid: true, name: trimmed };
}

// True when `confirmPassword` matches `newPassword` exactly — used by
// reset-password.tsx's "Confirm new password" field.
export function passwordsMatch(newPassword: string, confirmPassword: string): boolean {
  return newPassword === confirmPassword;
}
