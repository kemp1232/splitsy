import { expoClient } from '@better-auth/expo/client';
import { createAuthClient } from 'better-auth/react';
import * as SecureStore from 'expo-secure-store';

import appInfo from '@/constants/appInfo.json';
import { AUTH_BACKEND_URL } from '@/constants/config';

// Client-side counterpart to server/src/auth.ts's Better Auth instance
// (2026-08-25 spec Amendment — see PLAN.md's "Post-MVP feature: Account
// system (Better Auth)" entry). `baseURL` is a bare origin
// (AUTH_BACKEND_URL, e.g. http://192.168.1.10:8787) — Better Auth's client
// appends its default `/api/auth` base path itself, matching how the server
// mounts the handler at `/api/auth/*` in server/src/index.ts.
//
// `scheme` reuses appInfo.json's own `scheme` field (also read by
// app.config.ts) rather than hardcoding a second `'splitsy'` literal here —
// this must exactly match the scheme server/src/auth.ts trusts as an origin,
// and the scheme the OS hands the reset-password deep link back to.
export const authClient = createAuthClient({
  baseURL: AUTH_BACKEND_URL,
  plugins: [
    expoClient({
      scheme: appInfo.scheme,
      storagePrefix: appInfo.scheme,
      storage: SecureStore,
    }),
  ],
});
