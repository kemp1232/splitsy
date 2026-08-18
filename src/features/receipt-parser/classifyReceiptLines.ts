import { detectAmounts } from './detectAmounts';
import {
  isGrossRecapLine,
  isVatAmountLine,
  isVatBreakdownSaleLine,
  isVatTaxBreakdownLine,
  lineMatchesAnyKeyword,
  NEGATIVE_ADJUSTMENT_KEYWORDS,
  NON_ITEM_INFO_KEYWORDS,
  PAYMENT_KEYWORDS,
  POSITIVE_ADJUSTMENT_KEYWORDS,
  STRONG_TOTAL_KEYWORDS,
  SUBTOTAL_KEYWORDS,
} from './receiptKeywords';
import type { ClassifiedLine, LineKind, NormalizedLine } from './receiptParser.types';

// Keyword-only classification for one line (spec section 11.7). Order matters:
// - the VAT/tax-breakdown-info check runs before subtotal/total/adjustment
//   keyword matching so a breakdown line like "Total Tax 53.14" (contains the
//   bare word "Total") or "VAT Tax 53.14" (contains "VAT"/"TAX") is recognized
//   as non-additive information *before* a later, more generic keyword check
//   can sweep it into TOTAL or POSITIVE_ADJUSTMENT instead.
// - subtotal keywords are checked before strong-total keywords so a "SUBTOTAL"
//   line is never also caught by the substring-adjacent "TOTAL" keyword.
function classifyByKeyword(text: string): LineKind {
  if (lineMatchesAnyKeyword(text, PAYMENT_KEYWORDS)) return 'PAYMENT';
  if (
    lineMatchesAnyKeyword(text, NON_ITEM_INFO_KEYWORDS) ||
    isVatBreakdownSaleLine(text) ||
    isVatAmountLine(text) ||
    isVatTaxBreakdownLine(text) ||
    isGrossRecapLine(text)
  ) {
    return 'INFO';
  }
  if (lineMatchesAnyKeyword(text, SUBTOTAL_KEYWORDS)) return 'SUBTOTAL';
  if (lineMatchesAnyKeyword(text, STRONG_TOTAL_KEYWORDS)) return 'TOTAL';
  if (lineMatchesAnyKeyword(text, POSITIVE_ADJUSTMENT_KEYWORDS)) return 'POSITIVE_ADJUSTMENT';
  if (lineMatchesAnyKeyword(text, NEGATIVE_ADJUSTMENT_KEYWORDS)) return 'NEGATIVE_ADJUSTMENT';
  return 'OTHER';
}

// A keyword-unclassified line is an item candidate only if it has a plausible
// amount AND some non-amount text (so a lone total figure with no name never
// becomes a fake item) AND appears before the final total region (spec
// section 11.8). Without reliable per-line geometry, "before the final total
// region" is approximated as "before the first subtotal/total line in reading
// order". Deliberately excludes PAYMENT from this cutoff: PAYMENT_KEYWORDS
// mixes bottom-of-receipt tokens (CASH, CHANGE) with header tokens that
// legitimately appear *before* the items (TIN, OR NO, TABLE, SERVER) — using
// the first PAYMENT line as a cutoff would exclude every real item on a
// receipt whose header happens to print a TIN or table number.
function hasNonAmountText(text: string): boolean {
  const amounts = detectAmounts(text);
  const withoutAmounts = amounts.reduce(
    (remaining, amount) => remaining.replace(amount.raw, ' '),
    text,
  );
  return /[A-Za-z]/.test(withoutAmounts);
}

// Real BIR-receipt finding: once a frameless multi-line receipt's label+amount
// lines are correctly reunited (normalizeOcr.ts's
// mergeFramelessLabelContinuations), some receipts print a second,
// end-of-receipt "compliance recap" block that restates figures already
// settled earlier — VATABLE/VAT EXEMPT/ZERO RATED/VAT Amount (already handled
// as non-additive INFO elsewhere in this file) *and*, on this particular
// layout, a second "Service Charge" line, which is normally a real, legitimate
// additive adjustment and has no keyword-level reason to be excluded on its
// own. Without deduplication, buildAdjustments (parseReceipt.ts) would count
// the same Service Charge twice.
//
// Mirrors totalRegionStart below, but pointed the other direction: instead of
// "before the first subtotal/total line" for item eligibility, this is
// "after the transaction has actually been paid" for adjustment eligibility.
// Anchored on the first PAYMENT-classified line *at or after* totalRegionStart
// specifically — never the first PAYMENT-classified line anywhere in the
// document, since PAYMENT_KEYWORDS mixes true bottom-of-receipt payment
// tokens (CASH, CHANGE, CARD) with header fields that legitimately appear
// before every item and every real adjustment (TIN, CASHIER, TABLE, SERVER —
// see this file's other totalRegionStart comment for the same reasoning).
// Anchoring on "at/after the total region" is what keeps a header CASHIER/TIN
// line from ever wrongly marking every later adjustment as post-payment
// recap, while still correctly finding the real payment line once the main
// bill has actually concluded.
function findPostPaymentRegionStart(byKeyword: LineKind[], totalRegionStart: number): number {
  const paymentIndex = byKeyword.findIndex(
    (kind, index) => kind === 'PAYMENT' && index >= totalRegionStart,
  );
  return paymentIndex === -1 ? byKeyword.length : paymentIndex;
}

export function classifyReceiptLines(lines: NormalizedLine[]): ClassifiedLine[] {
  const byKeyword = lines.map((line) => classifyByKeyword(line.text));

  const cutoffIndex = byKeyword.findIndex((kind) => kind === 'SUBTOTAL' || kind === 'TOTAL');
  const totalRegionStart = cutoffIndex === -1 ? lines.length : cutoffIndex;
  const postPaymentRegionStart = findPostPaymentRegionStart(byKeyword, totalRegionStart);

  return lines.map((line, index) => {
    const keywordKind = byKeyword[index]!;
    if (
      (keywordKind === 'POSITIVE_ADJUSTMENT' || keywordKind === 'NEGATIVE_ADJUSTMENT') &&
      index > postPaymentRegionStart
    ) {
      return { ...line, kind: 'INFO' };
    }
    if (
      keywordKind === 'OTHER' &&
      index < totalRegionStart &&
      detectAmounts(line.text).length > 0 &&
      hasNonAmountText(line.text)
    ) {
      return { ...line, kind: 'ITEM_CANDIDATE' };
    }
    return { ...line, kind: keywordKind };
  });
}
