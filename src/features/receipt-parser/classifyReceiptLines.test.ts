import { classifyReceiptLines } from './classifyReceiptLines';
import type { NormalizedLine } from './receiptParser.types';

function lines(texts: string[]): NormalizedLine[] {
  return texts.map((text) => ({ text }));
}

describe('classifyReceiptLines', () => {
  it('classifies a realistic receipt end to end', () => {
    const result = classifyReceiptLines(
      lines([
        'SAMPLE DINER',
        '123 Fixture Street, Quezon City',
        'TIN: 000-000-000-000',
        'OR NO: 0000123456',
        'DATE: 01/15/2026  TIME: 19:32',
        '2x BURGER MEAL       240.00',
        '1  ICED TEA           60.00',
        '1  SHARED NACHOS     150.00',
        'SUBTOTAL             450.00',
        'VAT (12%)             54.00',
        'SERVICE CHARGE         22.50',
        'DISCOUNT              -20.00',
        'TOTAL                506.50',
        'CASH                 600.00',
        'CHANGE                93.50',
      ]),
    );

    expect(result.map((l) => l.kind)).toEqual([
      'OTHER', // merchant name — no amount, no keyword
      'OTHER', // address
      'PAYMENT', // TIN — header field, but still a PAYMENT keyword
      'PAYMENT', // OR NO
      'OTHER', // date/time — no amount detected at all
      'ITEM_CANDIDATE',
      'ITEM_CANDIDATE',
      'ITEM_CANDIDATE',
      'SUBTOTAL',
      'POSITIVE_ADJUSTMENT', // VAT
      'POSITIVE_ADJUSTMENT', // SERVICE CHARGE
      'NEGATIVE_ADJUSTMENT', // DISCOUNT
      'TOTAL',
      'PAYMENT', // CASH
      'PAYMENT', // CHANGE
    ]);
  });

  it('classifies "SUBTOTAL" as SUBTOTAL, not TOTAL, despite containing the substring "TOTAL"', () => {
    const [line] = classifyReceiptLines(lines(['SUBTOTAL 450.00']));
    expect(line!.kind).toBe('SUBTOTAL');
  });

  it('does not treat a header PAYMENT-keyword line (TIN/table/server) as ending the item region', () => {
    // TIN appears before the items — it must not suppress every later item
    // from being recognized as an item candidate.
    const result = classifyReceiptLines(
      lines(['TIN: 000-000-000-000', 'BURGER 240.00', 'SUBTOTAL 240.00']),
    );
    expect(result[1]!.kind).toBe('ITEM_CANDIDATE');
  });

  it('does not classify a bare total figure with no name as an item candidate', () => {
    const result = classifyReceiptLines(lines(['240.00']));
    expect(result[0]!.kind).toBe('OTHER');
  });

  it('never marks anything after the subtotal as an item candidate, even if it has an amount', () => {
    const result = classifyReceiptLines(
      lines(['BURGER 240.00', 'SUBTOTAL 240.00', 'RANDOM NOTE 5.00']),
    );
    expect(result[2]!.kind).toBe('OTHER');
  });

  it('classifies a Philippine BIR VAT breakdown line as INFO, never as an item', () => {
    // Real-device finding: "(U)Vatable Sale" is the base amount subject to
    // VAT, not a charge on top of it — misclassifying it as an item inflates
    // the total by double-counting money already implied by the receipt total.
    const result = classifyReceiptLines(
      lines(['BURGER 240.00', '(U)Vatable Sale 240.00', 'E)VAT-Exempt Sale 0.00']),
    );
    expect(result[1]!.kind).toBe('INFO');
    expect(result[2]!.kind).toBe('INFO');
  });

  it('classifies a VLM-typo\'d VAT breakdown line ("Valable" for "Vatable") as INFO, not an item', () => {
    // Real-device/VLM finding on an actual Lian's Lomi House receipt: Qwen3-VL
    // transcribed "(V)Vatable Sale 388.39" as "(V)Valable Sale 388.39" (t
    // misread as l). An exact "VATABLE SALE" keyword match misses this; the
    // structural pattern (parenthesized code + word + "Sale" + amount) still
    // catches it.
    const result = classifyReceiptLines(
      lines(['CHICKEN CHAMI 145.00', '(V)Valable Sale 388.39', 'Vat Amount 46.61']),
    );
    expect(result[1]!.kind).toBe('INFO');
    expect(result[2]!.kind).toBe('INFO');
  });

  it('treats a Service Charge repeated after the payment line as INFO (a BIR recap), not a second real adjustment', () => {
    // Real-device/VLM finding: some BIR-format receipts restate Service
    // Charge a second time in a trailing compliance-recap block, after the
    // transaction has already been paid. The first (real) occurrence must
    // stay a POSITIVE_ADJUSTMENT; only the second, post-payment occurrence
    // must be downgraded to INFO so buildAdjustments never double-counts it.
    const result = classifyReceiptLines(
      lines([
        'BURGER 240.00',
        'Total Due 240.00',
        'CASH 240.00',
        'Service Charge 20.00',
        'Change 0.00',
      ]),
    );
    expect(result[1]!.kind).toBe('TOTAL');
    expect(result[2]!.kind).toBe('PAYMENT');
    expect(result[3]!.kind).toBe('INFO');
  });

  it('never suppresses a real adjustment that happens to sit before the first post-total payment line, even if a header PAYMENT keyword (TIN/CASHIER) appears earlier', () => {
    // A header TIN line must never be mistaken for "the transaction has been
    // paid" — the same reasoning that already keeps it from suppressing item
    // candidacy applies symmetrically here.
    const result = classifyReceiptLines(
      lines([
        'TIN: 000-000-000-000',
        'BURGER 240.00',
        'SUBTOTAL 240.00',
        'SERVICE CHARGE 20.00',
        'TOTAL 260.00',
        'CASH 300.00',
        'CHANGE 40.00',
      ]),
    );
    expect(result[3]!.kind).toBe('POSITIVE_ADJUSTMENT');
  });

  it("classifies a second, more severely VLM-typo'd VAT-breakdown block as INFO, not items/adjustments", () => {
    // Real-device/VLM finding, one level more severe than the "Valable" typo
    // above, on another scan of the same receipt: "Sale" itself misread as
    // "5ale" (S -> 5), and "Vat Amount" misread as "Vat Anburnt" (the whole
    // second word changed shape). Both must still classify as INFO, not fall
    // through to ITEM_CANDIDATE or POSITIVE_ADJUSTMENT.
    const result = classifyReceiptLines(
      lines(['CHICKEN CHAMI 145.00', '(U)Vatable 5ale 388.39', 'Vat Anburnt 46.61']),
    );
    expect(result[1]!.kind).toBe('INFO');
    expect(result[2]!.kind).toBe('INFO');
  });

  it('classifies plural, no-code VAT-breakdown "Sales" lines as INFO (real GrabFood/North Park Noodles-receipt finding)', () => {
    const result = classifyReceiptLines(
      lines([
        'BURGER 240.00',
        'VATable Sales 630.36',
        'VAT-Exempt Sales 0.00',
        'Zero-Rated Sales 0.00',
      ]),
    );
    expect(result[1]!.kind).toBe('INFO');
    expect(result[2]!.kind).toBe('INFO');
    expect(result[3]!.kind).toBe('INFO');
  });

  it('classifies "GROSS AMOUNT:" and colon-punctuated "VAT AMOUNT:" as INFO, not an item or adjustment (real Balinsasayaw-receipt finding)', () => {
    // Real receipt: item lines sum to the printed GROSS AMOUNT/TOTAL AMOUNT DUE
    // (1,295.00). Before this fix, "GROSS AMOUNT: 1,295.00" fell through to
    // OTHER and, sitting before "TOTAL AMOUNT DUE", was promoted to a second
    // phantom ITEM_CANDIDATE; separately, "VAT AMOUNT: 138.75"'s trailing
    // colon defeated isVatAmountLine's end-anchored pattern, so it fell through
    // to the generic "VAT" POSITIVE_ADJUSTMENT keyword and double-counted VAT
    // already included in the (VAT-inclusive) item prices.
    const result = classifyReceiptLines(
      lines([
        '1 Half Bulalo 530.00',
        'GROSS AMOUNT: 1,295.00',
        'TOTAL AMOUNT DUE: 1,295.00',
        'VATABLE SALES: 1,156.25',
        'VAT AMOUNT: 138.75',
      ]),
    );
    expect(result[0]!.kind).toBe('ITEM_CANDIDATE');
    expect(result[1]!.kind).toBe('INFO');
    expect(result[2]!.kind).toBe('TOTAL');
    expect(result[3]!.kind).toBe('INFO');
    expect(result[4]!.kind).toBe('INFO');
  });

  it('classifies "VAT Tax"/"Total Tax" as INFO, never as TOTAL or POSITIVE_ADJUSTMENT (real North Park Noodles-receipt finding)', () => {
    // "Total Tax" contains the bare word "Total" — without the INFO check
    // running first, it would be swept into the generic STRONG_TOTAL_KEYWORDS
    // "TOTAL" match and produce a phantom second total candidate.
    const result = classifyReceiptLines(
      lines(['BURGER 240.00', 'TOTAL 240.00', 'VAT Tax 20.00', 'Total Tax 20.00']),
    );
    expect(result[1]!.kind).toBe('TOTAL');
    expect(result[2]!.kind).toBe('INFO');
    expect(result[3]!.kind).toBe('INFO');
  });
});
