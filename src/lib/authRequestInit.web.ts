// Web counterpart to authRequestInit.ts: the browser already holds the
// Better Auth session cookie, so a cross-origin fetch to the backend only
// needs to opt in to sending it — same as authClient.web.ts's own
// `fetchOptions.credentials` (the backend's /api/* CORS allows credentials
// for the WEB_APP_ORIGINS allowlist, see server/src/app.ts).
export async function getAuthRequestInit(): Promise<Pick<RequestInit, 'headers' | 'credentials'>> {
  return { credentials: 'include' };
}
