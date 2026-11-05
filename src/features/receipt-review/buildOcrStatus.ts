import { copy } from '@/constants/copy';

export type OcrSource = 'backend' | 'on-device';
export type OcrFallbackReason = 'rate_limited' | 'token_limit_truncated';
export type OcrStatusTone = 'success' | 'warning' | 'neutral';

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
 * single short success line with no extra notes; the rate-limit note shows
 * only for an on-device rate-limit fallback, and the truncated note for
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
    tone:
      fallbackReason === 'rate_limited' || fallbackReason === 'token_limit_truncated'
        ? 'warning'
        : 'neutral',
    title: copy.receiptReview.ocrSourceOnDevice,
    body: null,
    notes,
  };
}
