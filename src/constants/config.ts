import { Platform } from 'react-native';

// EXPO_PUBLIC_-prefixed env vars are inlined into the client bundle at build
// time by Expo — the standard way to make a value like this configurable
// between dev/prod without hardcoding it. Empty string (not a hardcoded
// default) when unset, so BackendReceiptOcrService can tell "not configured"
// apart from "configured but unreachable" and skip straight to the on-device
// fallback instead of wasting the fallback timeout on a request nobody set up.
//
// On web specifically, these fall back to `http://localhost:8787` rather
// than the native vars' own LAN-IP value (documented on those vars in
// .env.example — needed so a *phone* can reach a dev machine that doesn't
// resolve "localhost" for it). That LAN-IP value actively breaks auth on
// web: Better Auth's session cookie is `SameSite=Lax` by default, and
// `http://localhost:8081` (the web app) and `http://192.168.1.10:8787` (the
// backend) are different *sites*, not just different origins — a Lax
// cookie set by one is never sent back on a fetch from the other, so
// sign-in appears to succeed (the POST itself works) but every subsequent
// `get-session` comes back with no session. `localhost:8081` and
// `localhost:8787` (different ports, same host) *are* the same site, so the
// cookie flows correctly — hence forcing web specifically onto `localhost`
// unless a real deployed backend URL is configured via the EXPO_PUBLIC_WEB_*
// vars below.
export const OCR_BACKEND_URL =
  Platform.OS === 'web'
    ? (process.env.EXPO_PUBLIC_WEB_OCR_BACKEND_URL ?? 'http://localhost:8787')
    : (process.env.EXPO_PUBLIC_OCR_BACKEND_URL ?? '');

// Base URL of the Splitsy auth backend (server/src/auth.ts, mounted at
// `/api/auth/*`) — see src/lib/authClient.ts, which appends that `/api/auth`
// path itself (Better Auth's client default), so this should be a bare
// origin like OCR_BACKEND_URL above, not the full `/api/auth` URL.
//
// Unlike OCR_BACKEND_URL, there is no offline/on-device fallback for auth
// (2026-08-25 spec Amendment — signing in requires a network connection by
// design). An empty string here is therefore treated as a hard, visible
// startup error (see src/app/_layout.tsx's AUTH_BACKEND_URL check) rather
// than a silent skip — that only ever applies to the native branch, though,
// since the web branch above always has a same-site default.
export const AUTH_BACKEND_URL =
  Platform.OS === 'web'
    ? (process.env.EXPO_PUBLIC_WEB_AUTH_BACKEND_URL ?? 'http://localhost:8787')
    : (process.env.EXPO_PUBLIC_AUTH_BACKEND_URL ?? '');
