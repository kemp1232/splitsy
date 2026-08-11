import type { ReceiptOcrService } from './ReceiptOcrService';
import type { OcrDocument } from './ocr.types';

// VLM inference time scales with how much text is actually in the image, not
// just its pixel size — the original ~51s measurement was a single synthetic
// receipt with a handful of lines; a real, dense, full-size receipt photo can
// take meaningfully longer even with GPU acceleration. This has to reflect
// that, not a snappy UI-style few seconds, or real receipts fall back to the
// less-accurate on-device path needlessly.
const DEFAULT_TIMEOUT_MS = 360_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms);
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

  async recognize(imageUri: string): Promise<OcrDocument> {
    try {
      return await withTimeout(this.primary.recognize(imageUri), this.timeoutMs);
    } catch (error) {
      // Development-only diagnostic (spec §18: dev logging must be gated and
      // easy to disable) — surfaces the real cause (cleartext block, timeout,
      // unreachable host) in `adb logcat` under ReactNativeJS instead of
      // silently vanishing into the fallback, without logging in production.
      if (__DEV__) {
        console.warn('[FallbackReceiptOcrService] primary OCR failed, falling back:', error);
      }
      return this.fallback.recognize(imageUri);
    }
  }
}
