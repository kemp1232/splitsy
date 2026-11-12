import {
  BackendReceiptOcrService,
  groqExtractionToParsedReceipt,
} from './BackendReceiptOcrService';
import {
  OcrDailyLimitError,
  OcrQueuedError,
  OcrRateLimitedError,
  OcrServiceBusyError,
  OcrTruncatedError,
  OcrUnauthenticatedError,
  OcrUnreadableError,
} from './ReceiptOcrService';

jest.mock('expo-file-system', () => ({
  // A minimal stand-in for the real (native) expo-file-system File class —
  // recognize() only ever calls `new File(imageUri)` and hands it to
  // FormData; it never reads the file's contents itself.
  File: class {
    constructor(uri: string) {
      (this as { uri?: string }).uri = uri;
    }
  },
}));
// Mutable per-test (see the "configured backend" describe block below) —
// mocked at all, rather than relying on EXPO_PUBLIC_OCR_BACKEND_URL being
// unset in the ambient test environment, so "configured" vs "not configured"
// is each test's own explicit setup, not incidental to how the suite is run.
jest.mock('@/constants/config', () => ({ OCR_BACKEND_URL: '' }));
// Stands in for the platform-specific session attachment (native cookie from
// expoClient / web credentials: 'include') — /api/ocr is signed-in-only.
const mockAuthRequestInit = { credentials: 'omit', headers: { cookie: 'session=abc' } };
jest.mock('@/lib/authRequestInit', () => ({
  getAuthRequestInit: jest.fn(async () => mockAuthRequestInit),
}));

// `import * as config from '@/constants/config'` would go through Babel's
// namespace-import interop, which copies properties onto a new object rather
// than handing back the exact module instance BackendReceiptOcrService.ts's
// own `require('@/constants/config')` resolves to — mutating that copy
// wouldn't be visible to the service under test. `jest.requireMock` returns
// the one real mock module instance every importer shares.
const config = jest.requireMock('@/constants/config') as { OCR_BACKEND_URL: string };

const BASE_EXTRACTION = {
  merchantName: 'SAMPLE DINER',
  receiptDate: '2026-01-15',
  items: [{ name: 'BURGER MEAL', quantity: 2, lineTotalCentavos: 24000 }],
  adjustments: [{ type: 'TAX' as const, label: 'VAT (12%)', amountCentavos: 5400 }],
  detectedSubtotalCentavos: 24000,
  detectedTotalCentavos: 29400,
  rawText: 'BURGER MEAL 240.00\nVAT (12%) 54.00\nTOTAL 294.00',
};

describe('groqExtractionToParsedReceipt', () => {
  it('maps items and adjustments onto the shared ParsedReceipt shape, tagged as OCR-sourced', () => {
    const receipt = groqExtractionToParsedReceipt(BASE_EXTRACTION);

    expect(receipt.items).toEqual([
      {
        name: 'BURGER MEAL',
        quantity: 2,
        lineTotalCentavos: 24000,
        source: 'OCR',
        confidence: null,
        rawText: 'BURGER MEAL',
      },
    ]);
    expect(receipt.adjustments).toEqual([
      {
        type: 'TAX',
        label: 'VAT (12%)',
        amountCentavos: 5400,
        allocationMethod: 'PROPORTIONAL', // spec F-014 default for TAX
        source: 'OCR',
        rawText: 'VAT (12%)',
      },
    ]);
  });

  it('applies the spec F-014 default allocation method per adjustment type (TIP defaults to EQUAL)', () => {
    const receipt = groqExtractionToParsedReceipt({
      ...BASE_EXTRACTION,
      adjustments: [{ type: 'TIP', label: 'Tip', amountCentavos: 1000 }],
    });
    expect(receipt.adjustments[0]?.allocationMethod).toBe('EQUAL');
  });

  it('carries merchantName/receiptDate/subtotal/total/rawText straight through', () => {
    const receipt = groqExtractionToParsedReceipt(BASE_EXTRACTION);
    expect(receipt.merchantName).toBe('SAMPLE DINER');
    expect(receipt.receiptDate).toBe('2026-01-15');
    expect(receipt.detectedSubtotalCentavos).toBe(24000);
    expect(receipt.detectedTotalCentavos).toBe(29400);
    expect(receipt.rawText).toBe(BASE_EXTRACTION.rawText);
  });

  it('flags NO_ITEMS_DETECTED when items is empty', () => {
    const receipt = groqExtractionToParsedReceipt({ ...BASE_EXTRACTION, items: [] });
    expect(receipt.warnings.map((w) => w.code)).toContain('NO_ITEMS_DETECTED');
  });

  it('flags NO_TOTAL_DETECTED when detectedTotalCentavos is null', () => {
    const receipt = groqExtractionToParsedReceipt({
      ...BASE_EXTRACTION,
      detectedTotalCentavos: null,
    });
    expect(receipt.warnings.map((w) => w.code)).toContain('NO_TOTAL_DETECTED');
  });

  it('flags TOTAL_MISMATCH when items + adjustments do not add up to the detected total', () => {
    const receipt = groqExtractionToParsedReceipt({
      ...BASE_EXTRACTION,
      detectedTotalCentavos: 99999,
    });
    expect(receipt.warnings.map((w) => w.code)).toContain('TOTAL_MISMATCH');
  });

  it('flags SUBTOTAL_MISMATCH when the detected subtotal does not match the item subtotal', () => {
    const receipt = groqExtractionToParsedReceipt({
      ...BASE_EXTRACTION,
      detectedSubtotalCentavos: 1,
    });
    expect(receipt.warnings.map((w) => w.code)).toContain('SUBTOTAL_MISMATCH');
  });

  it('raises no warnings when everything reconciles', () => {
    const receipt = groqExtractionToParsedReceipt(BASE_EXTRACTION);
    expect(receipt.warnings).toEqual([]);
  });

  it('never invents totalCandidates/excludedPaymentLines/etc. — no LLM-path equivalent exists', () => {
    const receipt = groqExtractionToParsedReceipt(BASE_EXTRACTION);
    expect(receipt.diagnostics.totalCandidates).toEqual([]);
    expect(receipt.diagnostics.excludedPaymentLines).toEqual([]);
    expect(receipt.diagnostics.excludedReconciliationLines).toEqual([]);
    expect(receipt.diagnostics.lowConfidenceLineCount).toBe(0);
  });
});

describe('BackendReceiptOcrService', () => {
  afterEach(() => {
    config.OCR_BACKEND_URL = '';
    delete (global as { fetch?: unknown }).fetch;
  });

  it('refuses to call an unconfigured backend rather than silently failing later', async () => {
    const service = new BackendReceiptOcrService();
    await expect(service.recognize('file:///receipt.jpg')).rejects.toThrow(/not configured/);
  });

  describe('with a configured backend', () => {
    beforeEach(() => {
      config.OCR_BACKEND_URL = 'http://fake-backend';
    });

    it('attaches the signed-in session to the OCR request', async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValue({ ok: true, status: 200, json: async () => BASE_EXTRACTION });
      const service = new BackendReceiptOcrService();

      await service.recognize('file:///receipt.jpg');

      expect(global.fetch).toHaveBeenCalledWith(
        'http://fake-backend/api/ocr',
        expect.objectContaining({ method: 'POST', ...mockAuthRequestInit }),
      );
    });

    it('forwards the abort signal to the backend fetch so a timed-out request is cancelled', async () => {
      global.fetch = jest.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
          }),
      ) as unknown as typeof fetch;
      const controller = new AbortController();
      const service = new BackendReceiptOcrService();

      const pending = service.recognize('file:///receipt.jpg', { signal: controller.signal });
      // Let recognize() reach its fetch call before aborting.
      await new Promise((resolve) => setTimeout(resolve, 0));
      controller.abort();

      await expect(pending).rejects.toThrow('aborted');
      expect(global.fetch).toHaveBeenCalledWith(
        'http://fake-backend/api/ocr',
        expect.objectContaining({ signal: controller.signal }),
      );
    });

    it('throws OcrUnauthenticatedError on a 401', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => JSON.stringify({ error: 'Sign in', reason: 'unauthenticated' }),
      });
      const service = new BackendReceiptOcrService();

      await expect(service.recognize('file:///receipt.jpg')).rejects.toBeInstanceOf(
        OcrUnauthenticatedError,
      );
    });

    it('throws OcrDailyLimitError (not queued or rate-limited) for the daily_limit 429 shape', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 429,
        text: async () => JSON.stringify({ error: 'limit', reason: 'daily_limit', limit: 10 }),
      });
      const service = new BackendReceiptOcrService();

      const rejection = service.recognize('file:///receipt.jpg');
      await expect(rejection).rejects.toBeInstanceOf(OcrDailyLimitError);
      await expect(rejection).rejects.not.toBeInstanceOf(OcrQueuedError);
      await expect(rejection).rejects.not.toBeInstanceOf(OcrRateLimitedError);
    });

    it('throws OcrRateLimitedError specifically on a 429, distinct from any other failure', async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValue({ ok: false, status: 429, text: async () => 'rate limited' });
      const service = new BackendReceiptOcrService();

      await expect(service.recognize('file:///receipt.jpg')).rejects.toThrow(OcrRateLimitedError);
    });

    it('throws OcrQueuedError (not OcrRateLimitedError) for the backend scan-queue\'s own 429 shape', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 429,
        text: async () => JSON.stringify({ error: 'queued', reason: 'queued', retryAfterSeconds: 42 }),
      });
      const service = new BackendReceiptOcrService();

      const rejection = service.recognize('file:///receipt.jpg');
      await expect(rejection).rejects.toBeInstanceOf(OcrQueuedError);
      await expect(rejection).rejects.not.toBeInstanceOf(OcrRateLimitedError);
      await expect(rejection).rejects.toMatchObject({ retryAfterSeconds: 42 });
    });

    it('falls back to OcrRateLimitedError when a 429 body does not match the queued shape', async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValue({ ok: false, status: 429, text: async () => 'rate limited' });
      const service = new BackendReceiptOcrService();

      const rejection = service.recognize('file:///receipt.jpg');
      await expect(rejection).rejects.toBeInstanceOf(OcrRateLimitedError);
      await expect(rejection).rejects.not.toBeInstanceOf(OcrQueuedError);
    });

    it.each([
      [true, true],
      [false, undefined],
      [undefined, undefined],
    ])(
      'surfaces truncated=%p from a successful backend response as %p',
      async (truncated, expected) => {
        global.fetch = jest.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: async () =>
            truncated === undefined ? BASE_EXTRACTION : { ...BASE_EXTRACTION, truncated },
        });
        const service = new BackendReceiptOcrService();

        const result = await service.recognize('file:///receipt.jpg');

        expect(result.source).toBe('backend');
        expect(result.truncated).toBe(expected);
      },
    );

    it.each([502, 500, 429])(
      'throws OcrTruncatedError for a non-ok body with truncated: true (status %p)',
      async (status) => {
        global.fetch = jest.fn().mockResolvedValue({
          ok: false,
          status,
          text: async () => JSON.stringify({ error: 'schema mismatch', truncated: true }),
        });
        const service = new BackendReceiptOcrService();

        const rejection = service.recognize('file:///receipt.jpg');
        await expect(rejection).rejects.toBeInstanceOf(OcrTruncatedError);
        await expect(rejection).rejects.not.toBeInstanceOf(OcrRateLimitedError);
        await expect(rejection).rejects.not.toBeInstanceOf(OcrQueuedError);
      },
    );

    it('throws a plain Error (not OcrTruncatedError) for a non-ok body with truncated: false', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 502,
        text: async () => JSON.stringify({ error: 'model unavailable', truncated: false }),
      });
      const service = new BackendReceiptOcrService();

      const rejection = service.recognize('file:///receipt.jpg');
      await expect(rejection).rejects.toThrow(/OCR backend request failed \(502\)/);
      await expect(rejection).rejects.not.toBeInstanceOf(OcrTruncatedError);
    });

    it('throws a plain Error (not OcrRateLimitedError) for a non-429 failure', async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValue({ ok: false, status: 500, text: async () => 'server error' });
      const service = new BackendReceiptOcrService();

      const rejection = service.recognize('file:///receipt.jpg');
      await expect(rejection).rejects.toThrow(/OCR backend request failed \(500\)/);
      await expect(rejection).rejects.not.toBeInstanceOf(OcrRateLimitedError);
      await expect(rejection).rejects.not.toBeInstanceOf(OcrServiceBusyError);
    });

    it.each([502, 503, 504])(
      'throws OcrServiceBusyError when the reading service is busy (%i)',
      async (status) => {
        global.fetch = jest.fn().mockResolvedValue({
          ok: false,
          status,
          text: async () =>
            JSON.stringify({ error: 'Groq request failed (503): over capacity', truncated: false }),
        });
        const service = new BackendReceiptOcrService();

        const rejection = service.recognize('file:///receipt.jpg');
        await expect(rejection).rejects.toBeInstanceOf(OcrServiceBusyError);
        await expect(rejection).rejects.toMatchObject({ status });
      },
    );

    it('keeps OcrTruncatedError ahead of the busy mapping for a truncated 502', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 502,
        text: async () => JSON.stringify({ error: 'cut off', truncated: true }),
      });
      const service = new BackendReceiptOcrService();

      const rejection = service.recognize('file:///receipt.jpg');
      await expect(rejection).rejects.toBeInstanceOf(OcrTruncatedError);
      await expect(rejection).rejects.not.toBeInstanceOf(OcrServiceBusyError);
    });

    it("throws OcrUnreadableError (not OcrServiceBusyError) for a 502 with reason 'unreadable'", async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 502,
        text: async () =>
          JSON.stringify({
            error: 'Groq response did not match the expected schema',
            truncated: false,
            reason: 'unreadable',
          }),
      });
      const service = new BackendReceiptOcrService();

      const rejection = service.recognize('file:///receipt.jpg');
      await expect(rejection).rejects.toBeInstanceOf(OcrUnreadableError);
      await expect(rejection).rejects.not.toBeInstanceOf(OcrServiceBusyError);
    });

    it('keeps OcrTruncatedError ahead of the unreadable mapping for a truncated unreadable 502', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 502,
        text: async () =>
          JSON.stringify({ error: 'cut off', truncated: true, reason: 'unreadable' }),
      });
      const service = new BackendReceiptOcrService();

      const rejection = service.recognize('file:///receipt.jpg');
      await expect(rejection).rejects.toBeInstanceOf(OcrTruncatedError);
      await expect(rejection).rejects.not.toBeInstanceOf(OcrUnreadableError);
    });
  });
});
