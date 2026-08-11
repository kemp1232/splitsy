import { buildOcrDocument, textToOcrDocument } from '@/test/fixtures/receipts/buildOcrDocument';
import { columnSplitReceiptLines } from '@/test/fixtures/receipts/columnSplitReceipt';
import { dateResemblingAmountLines } from '@/test/fixtures/receipts/dateResemblingAmount';
import { grabFoodReceiptText } from '@/test/fixtures/receipts/grabFoodReceipt';
import { lianLomiHouseReceiptText } from '@/test/fixtures/receipts/lianLomiHouseReceipt';
import { lianLomiHouseReceiptSaleAmountTypoText } from '@/test/fixtures/receipts/lianLomiHouseReceiptSaleAmountTypo';
import { lowConfidenceLines } from '@/test/fixtures/receipts/lowConfidenceLines';
import { multipleTotalsLines } from '@/test/fixtures/receipts/multipleTotals';
import { noisyColumnMergeLines } from '@/test/fixtures/receipts/noisyColumnMerge';
import { noItemsFoundLines } from '@/test/fixtures/receipts/noItemsFound';
import { noTotalFoundLines } from '@/test/fixtures/receipts/noTotalFound';
import { northParkNoodlesReceiptText } from '@/test/fixtures/receipts/northParkNoodlesReceipt';
import { ramenHouseReceiptText } from '@/test/fixtures/receipts/ramenHouseReceipt';
import { reconciliationJunkLineLines } from '@/test/fixtures/receipts/reconciliationJunkLine';
import { simpleReceiptLines } from '@/test/fixtures/receipts/simpleReceipt';
import { wrappedItemNameLines } from '@/test/fixtures/receipts/wrappedItemName';

import { parseReceipt } from './parseReceipt';

// Spec section 20.1's required fixture list, one describe block per case.

describe('case 1/2/3/4/5/8: simple receipt with items, quantities, VAT, service charge, discount, comma amounts, and CASH/CHANGE after the total', () => {
  const result = parseReceipt(buildOcrDocument(simpleReceiptLines));

  it('extracts every item with the right quantity and line total', () => {
    expect(result.items).toEqual([
      {
        name: 'BURGER MEAL',
        quantity: 2,
        lineTotalCentavos: 24000,
        source: 'OCR',
        confidence: null,
        rawText: expect.any(String),
      },
      {
        name: 'ICED TEA',
        quantity: 1,
        lineTotalCentavos: 6000,
        source: 'OCR',
        confidence: null,
        rawText: expect.any(String),
      },
      {
        name: 'SHARED NACHOS',
        quantity: 1,
        lineTotalCentavos: 125000,
        source: 'OCR',
        confidence: null,
        rawText: expect.any(String),
      },
    ]);
  });

  it('extracts VAT, service charge, and discount with the right sign and default allocation', () => {
    expect(result.adjustments).toEqual([
      {
        type: 'TAX',
        label: 'VAT (12%)',
        amountCentavos: 5400,
        allocationMethod: 'PROPORTIONAL',
        source: 'OCR',
        rawText: expect.any(String),
      },
      {
        type: 'SERVICE_CHARGE',
        label: 'SERVICE CHARGE',
        amountCentavos: 2250,
        allocationMethod: 'PROPORTIONAL',
        source: 'OCR',
        rawText: expect.any(String),
      },
      {
        type: 'DISCOUNT',
        label: 'DISCOUNT',
        amountCentavos: -2000,
        allocationMethod: 'PROPORTIONAL',
        source: 'OCR',
        rawText: expect.any(String),
      },
    ]);
  });

  it('reads the comma-separated subtotal and total correctly', () => {
    expect(result.detectedSubtotalCentavos).toBe(155000);
    expect(result.detectedTotalCentavos).toBe(160650);
  });

  it('infers merchant name and date', () => {
    expect(result.merchantName).toBe('SAMPLE DINER');
    expect(result.receiptDate).toBe('2026-01-15');
  });

  it('warns that CASH/CHANGE payment lines were excluded, and nothing else', () => {
    expect(result.warnings).toEqual([
      { code: 'PAYMENT_LINE_EXCLUDED', message: 'Possible payment line was excluded.' },
    ]);
  });
});

describe('case 6: multiple total-like lines', () => {
  const result = parseReceipt(buildOcrDocument(multipleTotalsLines));

  it('warns about multiple totals and prefers the last one', () => {
    expect(result.detectedTotalCentavos).toBe(8000);
    expect(result.warnings).toContainEqual({
      code: 'MULTIPLE_TOTALS_FOUND',
      message: 'Multiple possible totals found.',
    });
  });
});

describe('"last plausible total": a trailing footer line that merely contains the word "Total" must not poison total detection', () => {
  // "Total No. of ITEMS : 5" matches the generic "TOTAL" strong-total keyword
  // (it contains the word "Total") but carries no money amount at all. If it
  // happens to be the literal last TOTAL-classified line, blindly using "the
  // last TOTAL line" would null out an otherwise perfectly good, already
  // detected total.
  const result = parseReceipt(
    buildOcrDocument([
      'CORNER STORE',
      'WATER BOTTLE          25.00',
      'TOTAL                  25.00',
      'Total No. of ITEMS : 1',
    ]),
  );

  it('skips the amount-less "Total No. of ITEMS" line and uses the real total instead', () => {
    expect(result.detectedTotalCentavos).toBe(2500);
  });
});

describe('case 7: wrapped item name', () => {
  const result = parseReceipt(buildOcrDocument(wrappedItemNameLines));

  it('joins the wrapped name line with the price line into one item', () => {
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.name).toBe('Grilled Chicken Caesar Salad');
    expect(result.items[0]?.lineTotalCentavos).toBe(28000);
  });

  it('produces no warnings when everything reconciles', () => {
    expect(result.warnings).toEqual([]);
  });
});

describe('case 9: no total found', () => {
  const result = parseReceipt(buildOcrDocument(noTotalFoundLines));

  it('still returns the items it found', () => {
    expect(result.items.map((item) => item.name)).toEqual(['WATER BOTTLE', 'CHIPS']);
  });

  it('warns that no total was detected instead of failing', () => {
    expect(result.detectedTotalCentavos).toBeNull();
    expect(result.warnings).toContainEqual({
      code: 'NO_TOTAL_DETECTED',
      message: 'No receipt total detected.',
    });
  });
});

describe('case 10: no items found', () => {
  const result = parseReceipt(buildOcrDocument(noItemsFoundLines));

  it('warns that no items were detected', () => {
    expect(result.items).toEqual([]);
    expect(result.warnings).toContainEqual({
      code: 'NO_ITEMS_DETECTED',
      message: 'No line items detected.',
    });
  });

  it('still finds the total and the date', () => {
    expect(result.detectedTotalCentavos).toBe(0);
    expect(result.receiptDate).toBe('2026-01-15');
  });
});

describe('case 11: a date/transaction number that resembles an amount', () => {
  const result = parseReceipt(buildOcrDocument(dateResemblingAmountLines));

  it('never turns the transaction-number line into a fake item or amount', () => {
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.name).toBe('WATER BOTTLE');
  });

  it('reconciles cleanly with no warnings', () => {
    expect(result.detectedTotalCentavos).toBe(2500);
    expect(result.warnings).toEqual([]);
  });
});

describe('case 12: low-confidence OCR lines', () => {
  const result = parseReceipt(buildOcrDocument(lowConfidenceLines));

  it('still extracts the low-confidence item and carries its confidence value through', () => {
    expect(result.items[0]?.name).toBe('MYSTERY ITEM');
    expect(result.items[0]?.confidence).toBe(0.3);
  });

  it('warns that low-confidence lines were used', () => {
    expect(result.warnings).toEqual([
      { code: 'LOW_CONFIDENCE_LINES_USED', message: 'Low-confidence OCR lines were used.' },
    ]);
  });
});

describe('real-device regression: item names and prices reported as separate columns', () => {
  // Found testing on a physical Android device: a printed thermal receipt
  // returned every item name in one OCR block and every price in another,
  // instead of one block per printed row. Before mergeIntoRows, this
  // extracted zero items from a receipt that had no handwriting or unusual
  // formatting at all — a real bug, not an OCR-accuracy limitation.
  const result = parseReceipt(buildOcrDocument(columnSplitReceiptLines));

  it('reunites each item name with its price despite them arriving as separate OCR blocks', () => {
    expect(result.items).toEqual([
      {
        name: 'CHICKEN CHAMI',
        quantity: 1,
        lineTotalCentavos: 14500,
        source: 'OCR',
        confidence: null,
        rawText: expect.any(String),
      },
      {
        name: 'BEEF LOMI',
        quantity: 1,
        lineTotalCentavos: 14500,
        source: 'OCR',
        confidence: null,
        rawText: expect.any(String),
      },
      {
        name: 'LECHON CHAMI',
        quantity: 1,
        lineTotalCentavos: 14500,
        source: 'OCR',
        confidence: null,
        rawText: expect.any(String),
      },
    ]);
  });

  it('reconciles subtotal and total against the reunited items with no warnings', () => {
    expect(result.detectedSubtotalCentavos).toBe(43500);
    expect(result.detectedTotalCentavos).toBe(43500);
    expect(result.warnings).toEqual([]);
  });
});

describe('real-device regression: a stray merged fragment leaves an embedded amount in the item name', () => {
  // Same receipt as the column-split regression above, but with the extra
  // "ORD 1.00"-style garbled fragment that also merged into the item row.
  // The line total (rightmost amount) is unaffected — only the *name* is
  // cleaned up, by stripping every embedded amount, not just the last one.
  const result = parseReceipt(buildOcrDocument(noisyColumnMergeLines));

  it('keeps the correct line total and removes the embedded amount from the name', () => {
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.lineTotalCentavos).toBe(14500);
    expect(result.items[0]?.name).not.toMatch(/\d+\.\d{2}/);
    expect(result.items[0]?.name).toBe('CHICKEN CHAMI ORD V');
  });
});

describe('real-device/VLM regression: Lian\'s Lomi House receipt with a "Valable"-for-"Vatable" typo', () => {
  // Qwen3-VL transcribed "(V)Vatable Sale 388.39" as "(V)Valable Sale
  // 388.39" (t misread as l). Before the keyword fix, this fell through as an
  // unrecognized item candidate, adding a bogus 4th line item and triggering
  // TOTAL_MISMATCH even though the receipt's own AMOUNT DUE matched the 3
  // real items exactly.
  const result = parseReceipt(textToOcrDocument(lianLomiHouseReceiptText));

  it('extracts exactly the 3 real items totaling 435.00, not a 4th bogus VAT-breakdown item', () => {
    expect(result.items).toHaveLength(3);
    expect(result.items.reduce((sum, item) => sum + item.lineTotalCentavos, 0)).toBe(43500);
    expect(result.items.map((item) => item.lineTotalCentavos)).toEqual([14500, 14500, 14500]);
  });

  it('never turns the VAT-breakdown lines into items or adjustments', () => {
    const names = result.items.map((item) => item.name.toUpperCase());
    expect(names.some((name) => name.includes('VALABLE') || name.includes('VATABLE'))).toBe(false);
    const labels = result.adjustments.map((adj) => adj.label.toUpperCase());
    expect(labels.some((label) => label.includes('VAT'))).toBe(false);
  });

  it('detects AMOUNT DUE as the total and reconciles with no TOTAL_MISMATCH warning', () => {
    expect(result.detectedTotalCentavos).toBe(43500);
    expect(result.warnings).not.toContainEqual(expect.objectContaining({ code: 'TOTAL_MISMATCH' }));
    expect(result.warnings).not.toContainEqual(
      expect.objectContaining({ code: 'ITEM_EXCLUDED_ON_RECONCILIATION' }),
    );
  });
});

describe('real-device/VLM regression: Lian\'s Lomi House receipt with a "5ale"/"Anburnt" typo compounding', () => {
  // Same merchant as the "Valable" regression above, a different scan, with
  // two compounding misreads in the same VAT-breakdown block: "Sale" itself
  // misread as "5ale" (S -> 5, a shape-similar confusion, not just the
  // descriptive word before it), and "Vat Amount" misread as "Vat Anburnt"
  // (the whole second word changed shape). This fixture models the
  // *row-merged* form of that scan (see the fixture file's own comment for
  // why: the real transcription's columns came back scrambled, which is a
  // separate, geometry-dependent problem this task doesn't cover).
  const result = parseReceipt(textToOcrDocument(lianLomiHouseReceiptSaleAmountTypoText));

  it('extracts exactly the 3 real items totaling 435.00, not a 4th bogus VAT-breakdown item', () => {
    expect(result.items).toHaveLength(3);
    expect(result.items.reduce((sum, item) => sum + item.lineTotalCentavos, 0)).toBe(43500);
    expect(result.items.map((item) => item.lineTotalCentavos)).toEqual([14500, 14500, 14500]);
  });

  it('never turns the VAT-breakdown lines into items or adjustments', () => {
    const names = result.items.map((item) => item.name.toUpperCase());
    expect(names.some((name) => name.includes('VATABLE') || name.includes('5ALE'))).toBe(false);
    const labels = result.adjustments.map((adj) => adj.label.toUpperCase());
    expect(labels.some((label) => label.includes('VAT'))).toBe(false);
  });

  it('excludes the VAT-breakdown lines via the keyword fix directly, not the reconciliation backstop', () => {
    expect(result.diagnostics.excludedReconciliationLines).toEqual([]);
    expect(result.warnings).not.toContainEqual(
      expect.objectContaining({ code: 'ITEM_EXCLUDED_ON_RECONCILIATION' }),
    );
  });

  it('detects AMOUNT DUE as the total and reconciles with no TOTAL_MISMATCH warning', () => {
    expect(result.detectedTotalCentavos).toBe(43500);
    expect(result.warnings).not.toContainEqual(expect.objectContaining({ code: 'TOTAL_MISMATCH' }));
  });
});

describe('real-device/VLM regression: ramen house receipt with item fields split across separate physical lines', () => {
  // Real transcription shape: each item's name, bare quantity marker, marked
  // unit price, and line total each print on their own physical line rather
  // than one row per item —
  //   AJI TAMAGO
  //   2@
  //   85.00v
  //   170.00
  // — and the receipt's label-only total/adjustment lines do the same
  // ("Total Due" / "1,655.71"). Before mergeFramelessLabelContinuations, the
  // marked unit price line ("85.00v") was the only one of the four fragments
  // with both an amount and non-amount text, so it became a bogus item named
  // "v" worth the *unit price*; the real item (correct name, correct line
  // total) was never built at all. This receipt also has a second Service
  // Charge occurrence in a trailing BIR compliance-recap block, printed after
  // the transaction has already been paid (MASTERCARD/Change) — it must not
  // be double-counted.
  const result = parseReceipt(textToOcrDocument(ramenHouseReceiptText));

  it('extracts exactly the 4 real items with their correct names and line totals, not the unit prices', () => {
    expect(result.items).toHaveLength(4);
    expect(result.items[0]?.name).toContain('AJI TAMAGO');
    expect(result.items[0]?.lineTotalCentavos).toBe(17000);
    expect(result.items[1]?.name).toContain('GYOZA');
    expect(result.items[1]?.lineTotalCentavos).toBe(27000);
    expect(result.items[2]?.name).toContain('MISO CHASHU RAMEN');
    expect(result.items[2]?.lineTotalCentavos).toBe(53000);
    expect(result.items[3]?.name).toContain('TONKOTSU RAMEN');
    expect(result.items[3]?.lineTotalCentavos).toBe(55000);

    const names = result.items.map((item) => item.name.toUpperCase());
    expect(names.some((name) => name === 'V')).toBe(false);
    expect(result.items.every((item) => item.lineTotalCentavos !== 8500)).toBe(true);
  });

  it('detects the reunited "Total Due"/"Total Amt Due" label+amount lines as the total', () => {
    expect(result.detectedTotalCentavos).toBe(165571);
  });

  it('counts Service Charge exactly once, not twice, despite the trailing BIR recap block repeating it', () => {
    const serviceCharges = result.adjustments.filter((adj) => adj.type === 'SERVICE_CHARGE');
    expect(serviceCharges).toHaveLength(1);
    expect(serviceCharges[0]?.amountCentavos).toBe(13571);
  });

  it('reconciles items + the single Service Charge against the detected total with no TOTAL_MISMATCH warning', () => {
    const itemSubtotal = result.items.reduce((sum, item) => sum + item.lineTotalCentavos, 0);
    const adjustmentTotal = result.adjustments.reduce((sum, adj) => sum + adj.amountCentavos, 0);
    expect(itemSubtotal).toBe(152000);
    expect(itemSubtotal + adjustmentTotal).toBe(165571);
    expect(result.warnings).not.toContainEqual(expect.objectContaining({ code: 'TOTAL_MISMATCH' }));
  });
});

describe('reconciliation backstop: an unrecognized junk line whose removal fixes the total', () => {
  // Synthetic fixture, independent of the VATABLE SALE keyword fix above —
  // covers the general reconcileItemsAgainstTotal safety net directly, for
  // whatever the next unanticipated OCR/VLM misread turns out to be.
  const result = parseReceipt(buildOcrDocument(reconciliationJunkLineLines));

  it('excludes the junk line from items once removing it exactly reconciles the total', () => {
    expect(result.items.map((item) => item.name)).toEqual(['COFFEE', 'PASTRY']);
    expect(result.items.reduce((sum, item) => sum + item.lineTotalCentavos, 0)).toBe(14000);
  });

  it('tracks the excluded line in diagnostics and warns about it instead of TOTAL_MISMATCH', () => {
    expect(result.diagnostics.excludedReconciliationLines).toEqual([
      expect.stringContaining('XYZ GARBLED LINE'),
    ]);
    expect(result.warnings).toContainEqual({
      code: 'ITEM_EXCLUDED_ON_RECONCILIATION',
      message: 'An unrecognized line was excluded to match the receipt total.',
    });
    expect(result.warnings).not.toContainEqual(expect.objectContaining({ code: 'TOTAL_MISMATCH' }));
  });

  it('still raw-text-preserves the excluded line for user review', () => {
    expect(result.rawText).toContain('XYZ GARBLED LINE');
  });
});

describe('reconciliation backstop: does not fire without a detected total', () => {
  it('leaves every item-candidate line alone when there is nothing to reconcile against', () => {
    const result = parseReceipt(buildOcrDocument(noTotalFoundLines));
    expect(result.items).toHaveLength(2);
    expect(result.diagnostics.excludedReconciliationLines).toEqual([]);
  });
});

describe('real-receipt regression: stray marker suffixes stripped from item names (GrabFood finding)', () => {
  // "606.00V" (a VAT-inclusive marker letter glued directly onto the amount)
  // and "@202" (a bare unit-price marker with no decimal point, which
  // detectAmounts never touches at all) both used to survive into the final
  // item name.
  it('strips a glued trailing marker letter', () => {
    const result = parseReceipt(
      buildOcrDocument(['SAMPLE STORE', '1 1PC CKNJOY 100.00V', 'TOTAL 100.00']),
    );
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.name).toBe('1PC CKNJOY');
    expect(result.items[0]?.quantity).toBe(1);
    expect(result.items[0]?.lineTotalCentavos).toBe(10000);
  });

  it('strips a bare "@digits" unit-price marker with no decimal point', () => {
    const result = parseReceipt(
      buildOcrDocument(['SAMPLE STORE', '2PC BGRSTKSPR @202 606.00', 'TOTAL 606.00']),
    );
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.name).toBe('2PC BGRSTKSPR');
    expect(result.items[0]?.lineTotalCentavos).toBe(60600);
  });

  it('strips both marker types together on one line, alongside the leading-quantity/item-code fix', () => {
    const result = parseReceipt(
      buildOcrDocument(['SAMPLE STORE', '3 2PC BGRSTKSPR @202 606.00V', 'TOTAL 606.00']),
    );
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.name).toBe('2PC BGRSTKSPR');
    expect(result.items[0]?.quantity).toBe(3);
    expect(result.items[0]?.lineTotalCentavos).toBe(60600);
  });

  it('still leaves a marker letter alone when it is a separate token, not glued to the amount', () => {
    // Regression guard: the real-device column-merge fixture's "145.00 V"
    // (space-separated) must keep behaving the way it already did —
    // preserved, not stripped — since that's a distinct token, not a marker
    // glued directly onto the amount.
    const result = parseReceipt(buildOcrDocument(noisyColumnMergeLines));
    expect(result.items[0]?.name).toBe('CHICKEN CHAMI ORD V');
  });
});

describe('real-receipt regression: explicit printed negative sign respected over keyword-inferred sign (North Park Noodles finding)', () => {
  it('still forces a discount negative when the source has no explicit sign at all (does not regress the original fix)', () => {
    const result = parseReceipt(
      buildOcrDocument(['SAMPLE STORE', 'BURGER 100.00', 'DISCOUNT 20.00', 'TOTAL 80.00']),
    );
    const discount = result.adjustments.find((adj) => adj.type === 'DISCOUNT');
    expect(discount?.amountCentavos).toBe(-2000);
  });

  it('respects an explicit "-" sign on a POSITIVE_ADJUSTMENT-keyword line instead of forcing it positive', () => {
    // "Sales SC: (G2/S2) -57.00" matches the "SC" positive-adjustment
    // keyword (normally Service Charge), but the amount is explicitly
    // printed negative — a senior-citizen-discount-style deduction, not a
    // charge. The explicit sign must win.
    const result = parseReceipt(
      buildOcrDocument([
        'SAMPLE STORE',
        'BURGER 100.00',
        'Sales SC: (G2/S2) -57.00',
        'TOTAL 43.00',
      ]),
    );
    const salesSc = result.adjustments.find((adj) => adj.rawText.includes('Sales SC'));
    expect(salesSc?.amountCentavos).toBe(-5700);
  });
});

describe('real-device/VLM regression: reconstructed GrabFood delivery receipt', () => {
  // Reconstructed/representative fixture — see grabFoodReceipt.ts for the
  // full provenance note. Covers: a leading quantity glued onto a
  // digit-leading item code, a glued VAT-inclusive marker letter, a bare
  // "@digits" unit-price marker, and plural no-code "Sales" VAT-breakdown
  // lines that must never become adjustments.
  const result = parseReceipt(textToOcrDocument(grabFoodReceiptText));

  it('extracts both items with the correct quantity, clean name, and line total', () => {
    expect(result.items).toEqual([
      {
        name: '2PC BGRSTKSPR',
        quantity: 3,
        lineTotalCentavos: 60600,
        source: 'OCR',
        confidence: null,
        rawText: expect.any(String),
      },
      {
        name: '1PC CKNJOY',
        quantity: 1,
        lineTotalCentavos: 10000,
        source: 'OCR',
        confidence: null,
        rawText: expect.any(String),
      },
    ]);
  });

  it('never turns any VAT-breakdown line into an adjustment', () => {
    expect(result.adjustments).toEqual([]);
  });

  it('reconciles the subtotal and total against the two real items with no TOTAL_MISMATCH/SUBTOTAL_MISMATCH', () => {
    expect(result.detectedSubtotalCentavos).toBe(70600);
    expect(result.detectedTotalCentavos).toBe(70600);
    expect(result.warnings).not.toContainEqual(expect.objectContaining({ code: 'TOTAL_MISMATCH' }));
    expect(result.warnings).not.toContainEqual(
      expect.objectContaining({ code: 'SUBTOTAL_MISMATCH' }),
    );
  });
});

describe('real-device/VLM regression: reconstructed North Park Noodles dine-in receipt', () => {
  // Reconstructed/representative fixture — see northParkNoodlesReceipt.ts
  // for the full provenance note. Covers: a parenthesized mid-line quantity
  // marker, an explicit negative sign on a positive-adjustment-keyword line,
  // and "VAT Tax"/"Total Tax" VAT-breakdown lines that must never become a
  // phantom total or a tax adjustment.
  const result = parseReceipt(textToOcrDocument(northParkNoodlesReceiptText));

  it('extracts the parenthesized-quantity item with quantity 2 and a clean name', () => {
    const lemonade = result.items.find((item) => item.name.includes('LEMONADE'));
    expect(lemonade?.quantity).toBe(2);
    expect(lemonade?.name).toBe('DR10 HONEY LEMONADE');
    expect(lemonade?.lineTotalCentavos).toBe(17600);
  });

  it('extracts exactly 3 items totaling the printed subtotal', () => {
    expect(result.items).toHaveLength(3);
    expect(result.items.reduce((sum, item) => sum + item.lineTotalCentavos, 0)).toBe(64100);
    expect(result.detectedSubtotalCentavos).toBe(64100);
  });

  it('resolves the Service Charge positive and the Sales SC deduction negative, respecting the explicit sign', () => {
    expect(result.adjustments).toHaveLength(2);
    const serviceCharge = result.adjustments.find((adj) => adj.rawText.includes('Service Charge'));
    const salesSc = result.adjustments.find((adj) => adj.rawText.includes('Sales SC'));
    expect(serviceCharge?.amountCentavos).toBe(6410);
    expect(salesSc?.amountCentavos).toBe(-5700);
  });

  it('never turns any VAT-breakdown line (including "VAT Tax"/"Total Tax") into an adjustment or a second total', () => {
    const labels = result.adjustments.map((adj) => adj.label.toUpperCase());
    expect(labels.some((label) => label.includes('VAT') || label.includes('TAX'))).toBe(false);
    expect(result.warnings).not.toContainEqual(
      expect.objectContaining({ code: 'MULTIPLE_TOTALS_FOUND' }),
    );
  });

  it('detects the single real TOTAL and reconciles with no TOTAL_MISMATCH warning', () => {
    expect(result.detectedTotalCentavos).toBe(64810);
    expect(result.warnings).not.toContainEqual(expect.objectContaining({ code: 'TOTAL_MISMATCH' }));
  });
});

describe('reconciliation backstop: does not guess between multiple equally-fitting candidates', () => {
  it('leaves items and TOTAL_MISMATCH as-is when more than one single-item removal would reconcile', () => {
    // Two different junk lines each happen to equal the same overshoot
    // amount — removing either one alone would reconcile the total, so which
    // one is the real outlier is ambiguous. Per spec, never guess between
    // combinations; leave everything as-is instead.
    const result = parseReceipt(
      buildOcrDocument([
        'SAMPLE CAFE',
        'COFFEE                80.00',
        'JUNK LINE ONE          15.00',
        'JUNK LINE TWO          15.00',
        'TOTAL                  95.00',
      ]),
    );
    expect(result.items).toHaveLength(3);
    expect(result.diagnostics.excludedReconciliationLines).toEqual([]);
    expect(result.warnings).toContainEqual(expect.objectContaining({ code: 'TOTAL_MISMATCH' }));
  });
});
