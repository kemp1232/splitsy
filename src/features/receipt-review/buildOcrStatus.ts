import { copy } from '@/constants/copy';
import type { OcrFallbackReason } from '@/features/receipt-ocr/ReceiptOcrService';

export type { OcrFallbackReason };

export type OcrSource = 'backend' | 'on-device';
export type OcrStatusTone = 'success' | 'warning' | 'neutral';

// Every reason that has a note below — anything else (e.g. an unexpected
// route param value) keeps the neutral tone rather than a note-less warning.
const KNOWN_FALLBACK_REASONS: readonly OcrFallbackReason[] = [
  'rate_limited',
  'token_limit_truncated',
  'daily_limit',
  'unauthenticated',
];

export type OcrStatusNote = {
  text: string;
  tone: 'textSecondary' | 'warning';
};

export type OcrStatus = {
  tone: OcrStatusTone;
  title: string;
  body: string | null;
  notes: OcrStatusNote[];
};

/**
 * Derives receipt-review's non-interactive AI/OCR status card purely from the
 * one-time route params processing.tsx passes along. A full backend read is a
 * single short success line with no extra notes; the rate-limit, daily-limit
 * and signed-out notes show only for the matching on-device fallback, and the truncated note for
 * either a truncated backend result or an on-device token-limit fallback. Returns null when there's no source
 * (e.g. a reopened draft), so nothing is shown.
 */
export function buildOcrStatus(
  ocrSource: OcrSource | undefined,
  fallbackReason: OcrFallbackReason | undefined,
  isTruncated: boolean,
): OcrStatus | null {
  if (!ocrSource) return null;

  const notes: OcrStatusNote[] = [];
  if (fallbackReason === 'rate_limited') {
    notes.push({ text: copy.receiptReview.rateLimitedNote, tone: 'warning' });
  }
  if (fallbackReason === 'daily_limit') {
    notes.push({ text: copy.receiptReview.dailyLimitNote, tone: 'warning' });
  }
  if (fallbackReason === 'unauthenticated') {
    notes.push({ text: copy.receiptReview.signedOutNote, tone: 'warning' });
  }
  if (isTruncated || fallbackReason === 'token_limit_truncated') {
    notes.push({ text: copy.receiptReview.truncatedNote, tone: 'warning' });
  }

  if (ocrSource === 'backend') {
    return isTruncated
      ? { tone: 'warning', title: copy.receiptReview.ocrSourceBackend, body: null, notes }
      : {
          tone: 'success',
          title: copy.receiptReview.aiCheckedTitle,
          body: null,
          notes,
        };
  }

  return {
    tone: fallbackReason && KNOWN_FALLBACK_REASONS.includes(fallbackReason) ? 'warning' : 'neutral',
    title: copy.receiptReview.ocrSourceOnDevice,
    body: null,
    notes,
  };
}
