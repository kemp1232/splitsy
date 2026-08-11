import type { DetectedAmount } from './receiptParser.types';

// Requires exactly 2 decimal digits — this is what naturally excludes dates
// (01/15/2026), times (19:32), OR numbers, TINs, phone numbers, and table
// numbers (spec section 11.5), since none of those are formatted as X.NN.
// Currency prefix (₱ / P / PHP) is optional and case-insensitive; commas as
// thousands separators are optional; a leading "-" or wrapping parens marks a
// negative amount.
// The (?!\d) after the decimal digits rejects a malformed run like "99.005"
// outright rather than truncating it to a guessed "99.00". The trailing
// (?!\.\d) rejects a chained dot-separated run like a "01.15.26.0042"
// transaction number — real money is never followed by another ".digit" group.
const AMOUNT_PATTERN =
  /(\(?)(-?)(?:₱|P\s?H?P?\s?)?\s*(\d{1,3}(?:,\d{3})*|\d+)\.(\d{2})(?!\d)(\)?)(?!\.\d)/gi;

// Parses "1,234.56" (or with a leading "-"/wrapping parens) into exact
// centavos via string manipulation — never through parseFloat, to avoid any
// floating-point rounding on the way to a money value (spec section 10.1).
function toCentavos(integerPart: string, decimalPart: string, negative: boolean): number {
  const digitsOnly = integerPart.replace(/,/g, '');
  const magnitude = Number(digitsOnly) * 100 + Number(decimalPart);
  return negative ? -magnitude : magnitude;
}

export function detectAmounts(text: string): DetectedAmount[] {
  const results: DetectedAmount[] = [];
  for (const match of text.matchAll(AMOUNT_PATTERN)) {
    const [raw, openParen, minusSign, integerPart, decimalPart, closeParen] = match;
    const negative = Boolean(minusSign) || (Boolean(openParen) && Boolean(closeParen));
    results.push({
      raw: raw!,
      centavos: toCentavos(integerPart!, decimalPart!, negative),
      index: match.index!,
    });
  }
  return results;
}

// The rightmost plausible amount on a line is the first heuristic for "the"
// amount on that line (spec section 11.5) — callers needing alternatives
// should use detectAmounts directly and keep the full list for diagnostics.
export function rightmostAmount(text: string): DetectedAmount | null {
  const amounts = detectAmounts(text);
  return amounts.length > 0 ? amounts[amounts.length - 1]! : null;
}
