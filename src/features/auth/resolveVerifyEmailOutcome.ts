// Query params added to the email-verification callbackURL (register.tsx,
// sign-in.tsx's resend). Better Auth's GET /verify-email redirects to the
// callbackURL unchanged on success and appends `&error=<CODE>` on failure, so
// verify-email.tsx can tell a real success apart from someone just opening
// /verify-email with no params.
export const VERIFY_EMAIL_SUCCESS_PARAMS = { verified: '1' } as const;

export type VerifyEmailOutcome = 'success' | 'error' | 'neutral';

// An error always wins (a failed redirect still carries the success marker);
// only the marker claims success; with neither, nothing is claimed.
export function resolveVerifyEmailOutcome(params: {
  verified?: string | string[];
  error?: string | string[];
}): VerifyEmailOutcome {
  if (params.error) return 'error';
  if (params.verified === VERIFY_EMAIL_SUCCESS_PARAMS.verified) return 'success';
  return 'neutral';
}
