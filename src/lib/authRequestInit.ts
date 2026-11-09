import { authClient } from '@/lib/authClient';

// Native: attaches the Better Auth session to a plain `fetch` to this app's
// own backend (currently only BackendReceiptOcrService's /api/ocr call, which
// is signed-in-only). The expoClient plugin keeps the session cookie in
// expo-secure-store rather than a cookie jar, so it's read back via its
// `getCookie()` action and sent as an explicit `cookie` header —
// `credentials: 'omit'` per Better Auth's Expo docs, so the native fetch's own
// cookie handling can't interfere. Never logged.
export async function getAuthRequestInit(): Promise<Pick<RequestInit, 'headers' | 'credentials'>> {
  const cookie = await authClient.getCookie();
  return { credentials: 'omit', headers: cookie ? { cookie } : {} };
}
