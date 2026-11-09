import { auth } from './auth.js';

// Resolves the signed-in Better Auth user for a non-auth route (currently
// /api/ocr) from the request's own cookie header — native sends the cookie
// stored by expoClient, web sends its browser cookie (credentials: 'include').
// Kept in its own module so route tests can mock it without constructing the
// whole Better Auth instance (auth.ts exits the process on missing env vars).
export async function getSessionUserId(headers: Headers): Promise<string | null> {
  const session = await auth.api.getSession({ headers });
  return session?.user.id ?? null;
}
