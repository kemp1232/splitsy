import {
  isVatAmountLine,
  isVatBreakdownSaleLine,
  isVatTaxBreakdownLine,
  lineMatchesAnyKeyword,
  lineMatchesKeyword,
  NEGATIVE_ADJUSTMENT_KEYWORDS,
  POSITIVE_ADJUSTMENT_KEYWORDS,
} from './receiptKeywords';

describe('lineMatchesKeyword', () => {
  it('matches case-insensitively', () => {
    expect(lineMatchesKeyword('subtotal', 'SUBTOTAL')).toBe(true);
  });

  it('does not treat "SC" as a substring match inside "DISCOUNT"', () => {
    expect(lineMatchesKeyword('DISCOUNT 20.00', 'SC')).toBe(false);
  });

  it('matches "SC" as a standalone token', () => {
    expect(lineMatchesKeyword('SC 22.50', 'SC')).toBe(true);
  });

  it('tolerates punctuation between words in a multi-word keyword', () => {
    expect(lineMatchesKeyword('SUB-TOTAL 450.00', 'SUB TOTAL')).toBe(true);
    expect(lineMatchesKeyword('SUB.TOTAL 450.00', 'SUB TOTAL')).toBe(true);
    expect(lineMatchesKeyword('SUB   TOTAL 450.00', 'SUB TOTAL')).toBe(true);
  });

  it('tolerates a trailing colon from OCR punctuation', () => {
    expect(lineMatchesKeyword('TOTAL: 506.50', 'TOTAL')).toBe(true);
  });
});

describe('lineMatchesAnyKeyword', () => {
  it('finds discount lines without matching positive-adjustment keywords', () => {
    expect(lineMatchesAnyKeyword('DISCOUNT -20.00', NEGATIVE_ADJUSTMENT_KEYWORDS)).toBe(true);
    expect(lineMatchesAnyKeyword('DISCOUNT -20.00', POSITIVE_ADJUSTMENT_KEYWORDS)).toBe(false);
  });
});

describe('isVatBreakdownSaleLine', () => {
  it('recognizes the exact "(V)Vatable Sale" line', () => {
    expect(isVatBreakdownSaleLine('(V)Vatable Sale 388.39')).toBe(true);
  });

  it('tolerates a one-character VLM/OCR typo in the descriptive word (real-device finding)', () => {
    // "(V)Valable Sale 388.39" — "Vatable" misread as "Valable" (t -> l).
    expect(isVatBreakdownSaleLine('(V)Valable Sale 388.39')).toBe(true);
  });

  it('tolerates a missing opening paren, as long as the closing paren survives', () => {
    expect(isVatBreakdownSaleLine('E)VAT-Exempt Sale 0.00')).toBe(true);
  });

  it('recognizes the zero-rated and exempt variants', () => {
    expect(isVatBreakdownSaleLine('(Z)Zero-Rated Sale 0.00')).toBe(true);
    expect(isVatBreakdownSaleLine('(SC)PWD Sale 100.00')).toBe(true);
  });

  it('requires an amount on the line, not just the text pattern', () => {
    expect(isVatBreakdownSaleLine('(V)Vatable Sale')).toBe(false);
  });

  it('does not match an ordinary item line that happens to contain no parens', () => {
    expect(isVatBreakdownSaleLine('BURGER SALE 100.00')).toBe(false);
  });

  it('does not match an ordinary item line at all', () => {
    expect(isVatBreakdownSaleLine('CHICKEN CHAMI 145.00')).toBe(false);
  });

  it('tolerates an S-to-5 VLM/OCR misread in the literal word "Sale" (real-device finding)', () => {
    // "(U)Vatable 5ale 388.39" — the "S" in "Sale" was read as the digit "5".
    // This is a *different, more severe* misread than the "Valable" typo
    // above: there, the descriptive word was corrupted; here, "Sale" itself is.
    expect(isVatBreakdownSaleLine('(U)Vatable 5ale 388.39')).toBe(true);
  });

  it('still requires the rest of "ale" verbatim — does not turn into a loose 3-letter-code match', () => {
    expect(isVatBreakdownSaleLine('(U)Vatable 5ole 388.39')).toBe(false);
  });

  it('recognizes plural "Sales" with no parenthesized code at all (real GrabFood/North Park Noodles-receipt finding)', () => {
    // "VAT-Exempt Sales 0.00" — no "(E)"-style code prefix, and the boundary
    // in the original code-anchored pattern never matched plural "Sales"
    // (a word boundary can't sit between "e" and a following "s").
    expect(isVatBreakdownSaleLine('VATable Sales 630.36')).toBe(true);
    expect(isVatBreakdownSaleLine('VAT-Exempt Sales 0.00')).toBe(true);
    expect(isVatBreakdownSaleLine('VAT-EXEMPT SALES 675.89')).toBe(true);
    expect(isVatBreakdownSaleLine('Zero-Rated Sales 0.00')).toBe(true);
  });

  it('does not let the no-code branch match an ordinary item line that happens to end in plural "Sales"', () => {
    // The no-code branch is anchored on a literal known VAT category word
    // (Vatable/VAT-Exempt/Zero-Rated), not an arbitrary word — this keeps it
    // from also accepting "BURGER SALES 100.00" the way a wildcard-word
    // no-code branch would have.
    expect(isVatBreakdownSaleLine('BURGER SALES 100.00')).toBe(false);
  });
});

describe('isVatTaxBreakdownLine', () => {
  it('recognizes "VAT Tax" and "Total Tax" (real North Park Noodles-receipt finding)', () => {
    // Same BIR VAT-breakdown block as isVatAmountLine's "Vat Amount", two
    // more label variants. "Total Tax" is the dangerous one: classifyByKeyword
    // falls through to the generic "TOTAL" strong-total keyword afterward,
    // which would otherwise match "Total Tax" as a bare whole-word substring.
    expect(isVatTaxBreakdownLine('VAT Tax 53.14')).toBe(true);
    expect(isVatTaxBreakdownLine('Total Tax 53.14')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isVatTaxBreakdownLine('vat tax 53.14')).toBe(true);
    expect(isVatTaxBreakdownLine('TOTAL TAX 53.14')).toBe(true);
  });

  it('requires an amount on the line, not just the text pattern', () => {
    expect(isVatTaxBreakdownLine('Total Tax')).toBe(false);
  });

  it('does not match a bare "TOTAL" line — "Tax" must also be present', () => {
    expect(isVatTaxBreakdownLine('TOTAL 506.50')).toBe(false);
  });

  it('does not match a genuine, additive tax line with an unrelated second word', () => {
    // Anchored on the literal words "Vat"/"Total", not a wildcard first word
    // — a real additive charge like "Local Tax 20.00" must not be swallowed.
    expect(isVatTaxBreakdownLine('Local Tax 20.00')).toBe(false);
  });

  it('does not match an ordinary item line at all', () => {
    expect(isVatTaxBreakdownLine('CHICKEN CHAMI 145.00')).toBe(false);
  });
});

describe('isVatAmountLine', () => {
  it('recognizes the exact "Vat Amount" line', () => {
    expect(isVatAmountLine('Vat Amount 46.61')).toBe(true);
  });

  it('tolerates a severely garbled second word (real-device/VLM finding)', () => {
    // "Vat Amount 46.61" transcribed as "Vat Anburnt 46.61" — the whole
    // second word changed shape, not a single-character swap.
    expect(isVatAmountLine('Vat Anburnt 46.61')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isVatAmountLine('VAT AMOUNT 46.61')).toBe(true);
  });

  it('requires an amount on the line, not just the text pattern', () => {
    expect(isVatAmountLine('Vat Amount')).toBe(false);
  });

  it('does not match "VAT/TIN:..." — no whitespace after "Vat" and no X.NN amount', () => {
    expect(isVatAmountLine('VAT/TIN:276-812-252-000')).toBe(false);
  });

  it('does not match a "VAT-Exempt Sale" breakdown line — "Vat" is hyphen-glued, not standalone', () => {
    expect(isVatAmountLine('(E)VAT-Exempt Sale 0.00')).toBe(false);
  });

  it('does not match an ordinary item line that merely contains "vat" as part of a longer word', () => {
    expect(isVatAmountLine('Vatican Pizza 100.00')).toBe(false);
  });

  it('does not match an ordinary item line at all', () => {
    expect(isVatAmountLine('CHICKEN CHAMI 145.00')).toBe(false);
  });
});
