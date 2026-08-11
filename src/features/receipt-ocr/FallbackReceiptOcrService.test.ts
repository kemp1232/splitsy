import { FallbackReceiptOcrService } from './FallbackReceiptOcrService';
import {
  OcrRateLimitedError,
  type OcrRecognitionResult,
  type ReceiptOcrService,
} from './ReceiptOcrService';

function resultTaggedWith(source: OcrRecognitionResult['source']): OcrRecognitionResult {
  return {
    receipt: {
      merchantName: null,
      receiptDate: null,
      items: [],
      adjustments: [],
      detectedSubtotalCentavos: null,
      detectedTotalCentavos: null,
      rawText: source,
      warnings: [],
      diagnostics: {
        normalizedLineCount: 0,
        totalCandidates: [],
        excludedPaymentLines: [],
        excludedReconciliationLines: [],
        lowConfidenceLineCount: 0,
      },
    },
    source,
  };
}

function serviceThatResolves(source: OcrRecognitionResult['source']): ReceiptOcrService {
  return { recognize: async () => resultTaggedWith(source) };
}

function serviceThatRejects(message: string): ReceiptOcrService {
  return {
    recognize: async () => {
      throw new Error(message);
    },
  };
}

function serviceThatRejectsWithRateLimit(): ReceiptOcrService {
  return {
    recognize: async () => {
      throw new OcrRateLimitedError('rate limited');
    },
  };
}

function serviceThatNeverResolves(): ReceiptOcrService {
  return { recognize: () => new Promise(() => {}) };
}

describe('FallbackReceiptOcrService', () => {
  it('returns the primary result when it succeeds, without touching the fallback', async () => {
    const fallback = jest.fn();
    const service = new FallbackReceiptOcrService(serviceThatResolves('backend'), {
      recognize: fallback,
    });

    const result = await service.recognize('file:///receipt.jpg');

    expect(result.source).toBe('backend');
    expect(fallback).not.toHaveBeenCalled();
  });

  it('falls back to the on-device service when the primary throws', async () => {
    const service = new FallbackReceiptOcrService(
      serviceThatRejects('network error'),
      serviceThatResolves('on-device'),
    );

    const result = await service.recognize('file:///receipt.jpg');

    expect(result.source).toBe('on-device');
  });

  it('falls back when the primary takes longer than the configured timeout', async () => {
    const service = new FallbackReceiptOcrService(
      serviceThatNeverResolves(),
      serviceThatResolves('on-device'),
      20, // a short timeout so the test doesn't need to wait for the real default
    );

    const result = await service.recognize('file:///receipt.jpg');

    expect(result.source).toBe('on-device');
  });

  it('tags the result with fallbackReason "rate_limited" when the primary was rate-limited', async () => {
    const service = new FallbackReceiptOcrService(
      serviceThatRejectsWithRateLimit(),
      serviceThatResolves('on-device'),
    );

    const result = await service.recognize('file:///receipt.jpg');

    expect(result.fallbackReason).toBe('rate_limited');
  });

  it('leaves fallbackReason unset for every other kind of primary failure', async () => {
    const service = new FallbackReceiptOcrService(
      serviceThatRejects('network error'),
      serviceThatResolves('on-device'),
    );

    const result = await service.recognize('file:///receipt.jpg');

    expect(result.fallbackReason).toBeUndefined();
  });
});
