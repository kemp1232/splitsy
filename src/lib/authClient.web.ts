import { createAuthClient } from 'better-auth/react';

import { AUTH_BACKEND_URL } from '@/constants/config';

// Web counterpart to authClient.ts. Better Auth's `expoClient` plugin
// (native-only: bridges the session cookie into `expo-secure-store`, and
// handles the custom-URL-scheme deep-link callback for email verification/
// password reset) has no web equivalent and isn't needed on web anyway — a
// browser already has its own cookie jar, so the plain client below relies
// on that directly instead of any storage plugin.
//
// `fetchOptions.credentials: 'include'` is the one thing web genuinely needs
// that the default fetch config doesn't do on its own: the backend
// (server/src/index.ts) is a different origin from the web app in every
// local setup (`http://192.168.x.x:8787` vs `http://localhost:8081`/`:3000`),
// and a cross-origin fetch doesn't send or accept cookies unless the request
// explicitly opts in — paired with that server's own CORS config
// (`credentials: true`, an explicit origin allowlist rather than `'*'`,
// which browsers require whenever credentials are involved).
export const authClient = createAuthClient({
  baseURL: AUTH_BACKEND_URL,
  fetchOptions: {
    credentials: 'include',
  },
});
