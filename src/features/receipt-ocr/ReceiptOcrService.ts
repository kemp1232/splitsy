import type { ParsedReceipt } from '@/features/receipt-parser/receiptParser.types';

// Thrown by a ReceiptOcrService implementation specifically for a rate limit
// (Groq's free-tier request-per-minute cap) — a distinct, expected, "try
// again shortly" situation the UI should be able to explain to the user,
// unlike a generic failure (network down, misconfigured, bad response),
// which FallbackReceiptOcrService already handles the same way it always
// has (silently fall back to on-device OCR with no user-facing reason).
export class OcrRateLimitedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OcrRateLimitedError';
  }
}

// Thrown when the backend's request failed because Groq's response was cut
// off by its token cap (`truncated: true` on the error body — see
// server/src/routes/ocr.ts) badly enough to be unusable. Unlike a usable but
// incomplete result (OcrRecognitionResult.truncated), nothing from the
// backend can be shown here, so FallbackReceiptOcrService falls back to
// on-device OCR and tags the result `fallbackReason: 'token_limit_truncated'`.
export class OcrTruncatedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OcrTruncatedError';
  }
}

// Thrown specifically when the backend's own global scan queue (see
// server/src/ocr/scanQueue.ts) turned this request away before it ever
// reached Groq — Groq's free-tier output-tokens-per-minute budget is shared
// across every user of the backend, not per-caller, so at most one scan can
// run per cooldown window regardless of who's asking. Deliberately a
// separate class from OcrRateLimitedError even though both are HTTP 429s:
// FallbackReceiptOcrService treats them differently (see its own comment) —
// a *queued* caller should wait and retry the same, better-accuracy backend
// path, not get silently downgraded to on-device OCR, which is the right
// call for a genuine, unexpected rate limit but would defeat the point of a
// queue (nobody would ever actually wait their turn).
export class OcrQueuedError extends Error {
  constructor(
    message: string,
    readonly retryAfterSeconds: number,
  ) {
    super(message);
    this.name = 'OcrQueuedError';
  }
}

// Thrown when the backend refused the scan because the request carried no
// valid session (HTTP 401, `reason: 'unauthenticated'` — see
// server/src/routes/ocr.ts). /api/ocr is signed-in-only; this usually means
// the stored session expired. FallbackReceiptOcrService falls back to
// on-device OCR and tags `fallbackReason: 'unauthenticated'` so the review
// screen can say why (web has no fallback and shows it on the failure screen).
export class OcrUnauthenticatedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OcrUnauthenticatedError';
  }
}

// Thrown when this account has used up its daily backend scans (HTTP 429,
// `reason: 'daily_limit'` — see server/src/ocr/dailyUsage.ts). Distinct from
// both OcrQueuedError (wait seconds and retry) and OcrRateLimitedError (Groq's
// own limit): retrying today won't help, so FallbackReceiptOcrService falls
// back on-device with `fallbackReason: 'daily_limit'`.
export class OcrDailyLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OcrDailyLimitError';
  }
}

// Thrown when the backend answered 502/503/504 — the reading service (Groq)
// is over capacity, timed out, or otherwise having trouble right now (the
// server wraps every upstream failure as a 502, and its own fail-closed
// paths as a 503). A "try again in a moment" situation, not a bad photo:
// processing.tsx says so instead of "Try a clearer photo" on web.
// FallbackReceiptOcrService deliberately treats it like any other failure
// (silently reads on-device instead), so native is unchanged.
export class OcrServiceBusyError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'OcrServiceBusyError';
  }
}

// Thrown when the backend answered 502 with `reason: 'unreadable'`: the
// reading service worked, but nothing usable could be extracted from this
// photo (server/src/ocr/receiptExtraction.schema.ts). Deliberately NOT an
// OcrServiceBusyError, so processing.tsx shows the "couldn't read this
// receipt / try a clearer photo" copy instead of "scanning is busy".
// FallbackReceiptOcrService treats it like any other failure (reads
// on-device instead).
export class OcrUnreadableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OcrUnreadableError';
  }
}

// The OCR request never reached the backend at all — fetch itself rejected
// (offline, DNS failure, refused connection), as opposed to the backend
// answering with an error. A connection problem, not a bad photo:
// processing.tsx says "check your connection" instead of "Try a clearer
// photo". FallbackReceiptOcrService still reads on-device in this case, and
// only rethrows this (instead of the on-device error) when that also fails.
// Not raised for an aborted request (the fallback's own timeout).
export class OcrNetworkError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = 'OcrNetworkError';
    if (options && 'cause' in options) (this as { cause?: unknown }).cause = options.cause;
  }
}

// Which implementation actually produced this result — lets the UI show
// whether a scan used the Groq backend or fell back to on-device OCR (see
// FallbackReceiptOcrService). A UI hint only, never treated as bill data
// (spec section 7). `fallbackReason` is set only for the reasons the UI
// currently distinguishes (rate limiting, a token-cap-truncated backend
// response, the per-account daily cap, an expired session) — every other fallback reason stays silent, same as before.
export type OcrFallbackReason =
  'rate_limited' | 'token_limit_truncated' | 'daily_limit' | 'unauthenticated';

export type OcrRecognitionResult = {
  receipt: ParsedReceipt;
  source: 'backend' | 'on-device';
  fallbackReason?: OcrFallbackReason;
  // Set only when source === 'backend' and the Groq call was cut off by its
  // token cap (finish_reason "length") — some fields (total, subtotal, full
  // text) may be missing. Deliberately not a `fallbackReason`: nothing fell
  // back to on-device here, the backend result is still the one used.
  truncated?: boolean;
};

// The only interface the rest of the app is allowed to depend on. Swapping
// the OCR bridge means writing a new implementation of this file — nothing
// else changes. Each implementation owns turning whatever it produces into
// the app's one shared `ParsedReceipt` shape: MlKitReceiptOcrService still
// runs the deterministic parser (`receipt-parser/parseReceipt.ts`) on raw OCR
// text, since ML Kit has no reasoning of its own; BackendReceiptOcrService's
// Groq backend now classifies items/totals/adjustments itself and returns
// them already structured, so the parser is bypassed entirely for that path
// (see PLAN.md's "Groq performs full receipt extraction" entry).
// `signal` is optional and only honored by network-backed implementations
// (BackendReceiptOcrService) — FallbackReceiptOcrService aborts it when its
// timeout fires so the abandoned request's connection actually closes.
export type RecognizeOptions = { signal?: AbortSignal };

export interface ReceiptOcrService {
  recognize(imageUri: string, options?: RecognizeOptions): Promise<OcrRecognitionResult>;
}
