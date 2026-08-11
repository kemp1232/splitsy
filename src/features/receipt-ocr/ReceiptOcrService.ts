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

// Which implementation actually produced this result — lets the UI show
// whether a scan used the Groq backend or fell back to on-device OCR (see
// FallbackReceiptOcrService). A UI hint only, never treated as bill data
// (spec section 7). `fallbackReason` is set only for the one reason the UI
// currently distinguishes (rate limiting) — every other fallback reason
// stays silent, same as before this existed.
export type OcrRecognitionResult = {
  receipt: ParsedReceipt;
  source: 'backend' | 'on-device';
  fallbackReason?: 'rate_limited';
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
export interface ReceiptOcrService {
  recognize(imageUri: string): Promise<OcrRecognitionResult>;
}
