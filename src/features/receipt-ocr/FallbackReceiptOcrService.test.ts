import { FallbackReceiptOcrService } from './FallbackReceiptOcrService';
import type { ReceiptOcrService } from './ReceiptOcrService';
import type { OcrDocument } from './ocr.types';

function documentWithText(text: string): OcrDocument {
  return { text, blocks: [] };
}

function serviceThatResolves(text: string): ReceiptOcrService {
  return { recognize: async () => documentWithText(text) };
}

function serviceThatRejects(message: string): ReceiptOcrService {
  return {
    recognize: async () => {
      throw new Error(message);
    },
  };
}

function serviceThatNeverResolves(): ReceiptOcrService {
  return { recognize: () => new Promise(() => {}) };
}

describe('FallbackReceiptOcrService', () => {
  it('returns the primary result when it succeeds, without touching the fallback', async () => {
    const fallback = jest.fn();
    const service = new FallbackReceiptOcrService(serviceThatResolves('primary'), {
      recognize: fallback,
    });

    const result = await service.recognize('file:///receipt.jpg');

    expect(result.text).toBe('primary');
    expect(fallback).not.toHaveBeenCalled();
  });

  it('falls back to the on-device service when the primary throws', async () => {
    const service = new FallbackReceiptOcrService(
      serviceThatRejects('network error'),
      serviceThatResolves('fallback'),
    );

    const result = await service.recognize('file:///receipt.jpg');

    expect(result.text).toBe('fallback');
  });

  it('falls back when the primary takes longer than the configured timeout', async () => {
    const service = new FallbackReceiptOcrService(
      serviceThatNeverResolves(),
      serviceThatResolves('fallback'),
      20, // a short timeout so the test doesn't need to wait for the real default
    );

    const result = await service.recognize('file:///receipt.jpg');

    expect(result.text).toBe('fallback');
  });
});
