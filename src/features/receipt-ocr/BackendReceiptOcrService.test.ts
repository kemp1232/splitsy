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

import {
  BackendReceiptOcrService,
  groqExtractionToParsedReceipt,
} from './BackendReceiptOcrService';
import { OcrRateLimitedError } from './ReceiptOcrService';

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

    it('throws OcrRateLimitedError specifically on a 429, distinct from any other failure', async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValue({ ok: false, status: 429, text: async () => 'rate limited' });
      const service = new BackendReceiptOcrService();

      await expect(service.recognize('file:///receipt.jpg')).rejects.toThrow(OcrRateLimitedError);
    });

    it('throws a plain Error (not OcrRateLimitedError) for a non-429 failure', async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValue({ ok: false, status: 500, text: async () => 'server error' });
      const service = new BackendReceiptOcrService();

      const rejection = service.recognize('file:///receipt.jpg');
      await expect(rejection).rejects.toThrow(/OCR backend request failed \(500\)/);
      await expect(rejection).rejects.not.toBeInstanceOf(OcrRateLimitedError);
    });
  });
});
