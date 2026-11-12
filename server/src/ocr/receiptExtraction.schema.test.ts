import { describe, expect, it } from 'vitest';

import { UnreadableReceiptError, validateReceiptExtraction } from './receiptExtraction.schema.js';

const VALID = {
  merchantName: 'SAMPLE DINER',
  receiptDate: '2026-01-15',
  items: [{ name: 'BURGER MEAL', quantity: 2, lineTotalCentavos: 24000 }],
  adjustments: [{ type: 'TAX', label: 'VAT (12%)', amountCentavos: 5400 }],
  detectedSubtotalCentavos: 24000,
  detectedTotalCentavos: 29400,
  rawText: 'BURGER MEAL 240.00\nVAT (12%) 54.00\nTOTAL 294.00',
};

describe('validateReceiptExtraction', () => {
  it('accepts a well-formed extraction', () => {
    expect(validateReceiptExtraction(VALID)).toEqual(VALID);
  });

  it('accepts null merchantName/receiptDate/subtotal/total and empty items/adjustments', () => {
    const minimal = {
      merchantName: null,
      receiptDate: null,
      items: [],
      adjustments: [],
      detectedSubtotalCentavos: null,
      detectedTotalCentavos: null,
      rawText: '',
    };
    expect(validateReceiptExtraction(minimal)).toEqual(minimal);
  });

  it('rejects a non-integer amount (e.g. a stray decimal peso value instead of centavos)', () => {
    expect(() => validateReceiptExtraction({ ...VALID, detectedTotalCentavos: 294.5 })).toThrow();
  });

  it('rejects a receiptDate not shaped like YYYY-MM-DD', () => {
    expect(() => validateReceiptExtraction({ ...VALID, receiptDate: '01/15/2026' })).toThrow();
  });

  it('defaults an item with quantity 0 to quantity 1 instead of rejecting the response', () => {
    expect(
      validateReceiptExtraction({
        ...VALID,
        items: [{ name: 'X', quantity: 0, lineTotalCentavos: 100 }],
      }).items,
    ).toEqual([{ name: 'X', quantity: 1, lineTotalCentavos: 100 }]);
  });

  it('defaults a missing item quantity to 1', () => {
    expect(
      validateReceiptExtraction({
        ...VALID,
        items: [{ name: 'RICE', lineTotalCentavos: 5000 }],
      }).items,
    ).toEqual([{ name: 'RICE', quantity: 1, lineTotalCentavos: 5000 }]);
  });

  it('drops an item with a missing or invalid lineTotalCentavos and keeps the valid ones', () => {
    expect(
      validateReceiptExtraction({
        ...VALID,
        items: [
          { name: 'BURGER MEAL', quantity: 2, lineTotalCentavos: 24000 },
          { name: 'MYSTERY', quantity: 1 },
          { name: 'DECIMAL', quantity: 1, lineTotalCentavos: 99.5 },
          { name: 'FRIES', quantity: 1, lineTotalCentavos: 8000 },
        ],
      }).items,
    ).toEqual([
      { name: 'BURGER MEAL', quantity: 2, lineTotalCentavos: 24000 },
      { name: 'FRIES', quantity: 1, lineTotalCentavos: 8000 },
    ]);
  });

  it('drops an item with an empty name', () => {
    expect(
      validateReceiptExtraction({
        ...VALID,
        items: [
          { name: '', quantity: 1, lineTotalCentavos: 100 },
          { name: 'TEA', quantity: 1, lineTotalCentavos: 300 },
        ],
      }).items,
    ).toEqual([{ name: 'TEA', quantity: 1, lineTotalCentavos: 300 }]);
  });

  it('throws UnreadableReceiptError when items were returned but none is usable', () => {
    expect(() =>
      validateReceiptExtraction({
        ...VALID,
        items: [{ name: 'BURGER' }, { quantity: 1, lineTotalCentavos: 100 }],
      }),
    ).toThrow(UnreadableReceiptError);
  });

  it('rejects an adjustment with an unrecognized type', () => {
    expect(() =>
      validateReceiptExtraction({
        ...VALID,
        adjustments: [{ type: 'SURCHARGE', label: 'X', amountCentavos: 100 }],
      }),
    ).toThrow();
  });

  it('defaults a missing rawText to an empty string rather than rejecting it', () => {
    // Deliberately accepted, not rejected — Groq's max_tokens cap can cut
    // the response off before this trailing field is ever emitted at all
    // (see this schema's own comment), which should degrade the same way an
    // explicit null total already does, not hard-fail the whole extraction.
    const { rawText: _rawText, ...withoutRawText } = VALID;
    expect(validateReceiptExtraction(withoutRawText)).toEqual({ ...VALID, rawText: '' });
  });

  it('defaults missing detectedSubtotalCentavos/detectedTotalCentavos to null rather than rejecting them', () => {
    const { detectedSubtotalCentavos: _s, detectedTotalCentavos: _t, ...withoutTotals } = VALID;
    expect(validateReceiptExtraction(withoutTotals)).toEqual({
      ...VALID,
      detectedSubtotalCentavos: null,
      detectedTotalCentavos: null,
    });
  });

  it('still rejects a missing items/adjustments field (unlike the trailing fields above, these are never optional)', () => {
    const { items: _items, ...withoutItems } = VALID;
    expect(() => validateReceiptExtraction(withoutItems)).toThrow();
  });
});
