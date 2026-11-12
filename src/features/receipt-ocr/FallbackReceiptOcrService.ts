import {
  OcrDailyLimitError,
  OcrNetworkError,
  OcrQueuedError,
  OcrRateLimitedError,
  OcrTruncatedError,
  OcrUnauthenticatedError,
  type OcrRecognitionResult,
  type ReceiptOcrService,
} from './ReceiptOcrService';

// VLM inference time scales with how much text is actually in the image, not
// just its pixel size — the original ~51s measurement was a single synthetic
// receipt with a handful of lines; a real, dense, full-size receipt photo can
// take meaningfully longer even with GPU acceleration. This has to reflect
// that, not a snappy UI-style few seconds, or real receipts fall back to the
// less-accurate on-device path needlessly.
const DEFAULT_TIMEOUT_MS = 360_000;

// `onTimeout` lets the caller cancel the underlying work (here: abort the
// backend fetch) rather than just stop waiting for it.
function withTimeout<T>(promise: Promise<T>, ms: number, onTimeout?: () => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      onTimeout?.();
      reject(new Error(`Timed out after ${ms}ms`));
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

// Tries the backend (VLM) OCR service first; falls back to on-device ML Kit
// on any error or timeout — network down, server unreachable, backend not
// configured, or the call simply taking too long. Preserves the one offline
// guarantee that's cheap to keep without requiring connectivity for scanning.
export class FallbackReceiptOcrService implements ReceiptOcrService {
  constructor(
    private readonly primary: ReceiptOcrService,
    private readonly fallback: ReceiptOcrService,
    private readonly timeoutMs: number = DEFAULT_TIMEOUT_MS,
  ) {}

  async recognize(imageUri: string): Promise<OcrRecognitionResult> {
    try {
      // Aborted on timeout so the backend request's connection really
      // closes — the server sees the disconnect and refunds the daily scan.
      const controller = new AbortController();
      return await withTimeout(
        this.primary.recognize(imageUri, { signal: controller.signal }),
        this.timeoutMs,
        () => controller.abort(),
      );
    } catch (error) {
      // A queued caller (see scanQueue.ts / OcrQueuedError) should wait and
      // retry the same, better-accuracy backend path — not get silently
      // downgraded to on-device OCR the way every other failure here does,
      // which would defeat the point of a queue (nobody would ever actually
      // wait their turn if scanning again always just worked anyway via the
      // fallback). Left for the caller (processing.tsx) to show the wait
      // and retry once the cooldown elapses.
      if (error instanceof OcrQueuedError) throw error;

      // Development-only diagnostic (spec §18: dev logging must be gated and
      // easy to disable) — surfaces the real cause (cleartext block, timeout,
      // unreachable host) in `adb logcat` under ReactNativeJS instead of
      // silently vanishing into the fallback, without logging in production.
      if (__DEV__) {
        console.warn('[FallbackReceiptOcrService] primary OCR failed, falling back:', error);
      }
      // Offline is exactly when on-device reading helps, so a network
      // failure still falls back — but if that also fails, the user needs to
      // hear about the connection (OcrNetworkError), not the on-device error.
      let result: OcrRecognitionResult;
      try {
        result = await this.fallback.recognize(imageUri);
      } catch (fallbackError) {
        if (error instanceof OcrNetworkError) throw error;
        throw fallbackError;
      }
      // Rate limiting and token-cap truncation are the fallback reasons the
      // UI currently explains to the user (see receipt-review.tsx) — every
      // other reason (network down, misconfigured, timeout, bad response)
      // stays silent, same as before this existed.
      if (error instanceof OcrRateLimitedError) {
        return { ...result, fallbackReason: 'rate_limited' };
      }
      if (error instanceof OcrTruncatedError) {
        return { ...result, fallbackReason: 'token_limit_truncated' };
      }
      // Not silent: the review screen explains each of these (buildOcrStatus).
      if (error instanceof OcrDailyLimitError) {
        return { ...result, fallbackReason: 'daily_limit' };
      }
      if (error instanceof OcrUnauthenticatedError) {
        return { ...result, fallbackReason: 'unauthenticated' };
      }
      return result;
    }
  }
}
