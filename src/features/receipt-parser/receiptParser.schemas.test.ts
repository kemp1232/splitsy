import { buildOcrDocument } from '@/test/fixtures/receipts/buildOcrDocument';
import { simpleReceiptLines } from '@/test/fixtures/receipts/simpleReceipt';

import { parseReceipt } from './parseReceipt';
import { validateParsedReceipt } from './receiptParser.schemas';

describe('validateParsedReceipt', () => {
  it('accepts real parser output without modification', () => {
    const result = parseReceipt(buildOcrDocument(simpleReceiptLines));
    expect(validateParsedReceipt(result)).toEqual(result);
  });

  it('rejects a quantity outside 1-99', () => {
    const result = parseReceipt(buildOcrDocument(simpleReceiptLines));
    const tampered = { ...result, items: [{ ...result.items[0]!, quantity: 100 }] };
    expect(() => validateParsedReceipt(tampered)).toThrow();
  });

  it('rejects a malformed receipt date', () => {
    const result = parseReceipt(buildOcrDocument(simpleReceiptLines));
    expect(() => validateParsedReceipt({ ...result, receiptDate: '01/15/2026' })).toThrow();
  });
});
