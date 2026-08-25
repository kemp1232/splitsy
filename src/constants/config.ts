// EXPO_PUBLIC_-prefixed env vars are inlined into the client bundle at build
// time by Expo — the standard way to make a value like this configurable
// between dev/prod without hardcoding it. Empty string (not a hardcoded
// default) when unset, so BackendReceiptOcrService can tell "not configured"
// apart from "configured but unreachable" and skip straight to the on-device
// fallback instead of wasting the fallback timeout on a request nobody set up.
export const OCR_BACKEND_URL = process.env.EXPO_PUBLIC_OCR_BACKEND_URL ?? '';

// Base URL of the Splitsy auth backend (server/src/auth.ts, mounted at
// `/api/auth/*`) — see src/lib/authClient.ts, which appends that `/api/auth`
// path itself (Better Auth's client default), so this should be a bare
// origin like OCR_BACKEND_URL above, not the full `/api/auth` URL.
//
// Unlike OCR_BACKEND_URL, there is no offline/on-device fallback for auth
// (2026-08-25 spec Amendment — signing in requires a network connection by
// design). An empty string here is therefore treated as a hard, visible
// startup error (see src/app/_layout.tsx's AUTH_BACKEND_URL check) rather
// than a silent skip.
export const AUTH_BACKEND_URL = process.env.EXPO_PUBLIC_AUTH_BACKEND_URL ?? '';
