// EXPO_PUBLIC_-prefixed env vars are inlined into the client bundle at build
// time by Expo — the standard way to make a value like this configurable
// between dev/prod without hardcoding it. Empty string (not a hardcoded
// default) when unset, so BackendReceiptOcrService can tell "not configured"
// apart from "configured but unreachable" and skip straight to the on-device
// fallback instead of wasting the fallback timeout on a request nobody set up.
export const OCR_BACKEND_URL = process.env.EXPO_PUBLIC_OCR_BACKEND_URL ?? '';
