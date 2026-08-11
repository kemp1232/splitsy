import { detectAmounts } from './detectAmounts';

export type QuantityMatch = {
  quantity: number;
  // Input text with the recognized quantity token removed. Name/amount
  // extraction from this remainder is parseReceipt's job, not this module's.
  remainder: string;
};

// Quantity patterns from spec section 11.6. Quantity is descriptive only in
// the MVP — when nothing matches, fall back to quantity 1 and leave the text
// untouched (never divide a line total by a guessed quantity).
const LEADING_QTY_TIMES_AMOUNT = /^(\d{1,2})\s*[x@]\s*(?=\d)/i;
const LEADING_QTY_TIMES_NAME = /^(\d{1,2})\s*x\s+([A-Za-z].*)$/i;
// The remainder after a leading quantity digit normally starts with a letter
// ("2 BURGER 240.00"). GrabFood real-receipt finding: some receipts instead
// glue the leading quantity right onto an item CODE that itself starts with a
// digit — "3 2PC BGRSTKSPR @202 606.00V" (qty 3, code "2PC..."), "1 1PC
// CKNJOY 100.00V" (qty 1, code "1PC..."). The original letter-only
// alternative below missed both entirely, leaving the leading quantity digit
// glued into the item name. The second alternative accepts that shape
// specifically: 1-3 digits immediately followed by 1-3 letters and a word
// boundary (an item-code-like token, e.g. "2PC"/"1PC") before the rest of the
// line. This can't match a bare amount sitting in that position ("2 3.00" —
// right after the leading "3" comes "." not a letter), so it never creates a
// new ambiguity between two adjacent bare numbers.
const LEADING_QTY_PLAIN = /^(\d{1,2})\s+([A-Za-z].*|\d{1,3}[A-Za-z]{1,3}\b.*)$/;
const TRAILING_QTY = /^(.*[A-Za-z].*?)\s+(\d{1,2})$/;
// A frameless multi-line receipt (name, then a bare "N@"/"Nx"/"xN" quantity
// marker on its own line, then the unit price/total) reunites into one row
// as "NAME 2@ 85.00v 170.00" (normalizeOcr.ts's mergeFramelessLabelContinuations)
// — the marker sits *between* the name and the amounts, not leading the whole
// line the way every pattern above assumes. Requires whitespace on both sides
// of the marker (so it's never mistaken for part of a name/amount) and a
// digit immediately after (the unit price that always follows it on these
// receipts) — deliberately checked last, after every leading/trailing shape
// above has already had a chance to match, so it only ever fires for this
// specific mid-line marker shape.
const MID_LINE_QTY_MARKER = /\s(?:(\d{1,2})\s*[@x]|x\s*(\d{1,2}))\s(?=\d)/i;

// North Park Noodles real-receipt finding: a different mid-line marker shape,
// "DR10 HONEY LEMONADE (2 @ 176.00" — a parenthesized quantity ("(2 @") sits
// between the item name and the amount, mirroring MID_LINE_QTY_MARKER above
// but with an opening parenthesis in front of the digit instead of the digit
// leading the marker directly. Requires whitespace before the "(" (so it's
// never mistaken for part of a name) and a digit immediately after the "@"
// (the amount that always follows it), same spirit as MID_LINE_QTY_MARKER —
// checked last, after every other pattern has already had a chance to match.
const MID_LINE_PAREN_QTY_MARKER = /\s\((\d{1,2})\s*@\s*(?=\d)/;

export function detectQuantity(text: string): QuantityMatch {
  const trimmed = text.trim();

  const timesAmount = LEADING_QTY_TIMES_AMOUNT.exec(trimmed);
  if (timesAmount) {
    return {
      quantity: Number(timesAmount[1]),
      remainder: trimmed.slice(timesAmount[0].length).trim(),
    };
  }

  const timesName = LEADING_QTY_TIMES_NAME.exec(trimmed);
  if (timesName) {
    return { quantity: Number(timesName[1]), remainder: timesName[2]!.trim() };
  }

  const plain = LEADING_QTY_PLAIN.exec(trimmed);
  if (plain) {
    return { quantity: Number(plain[1]), remainder: plain[2]!.trim() };
  }

  const lastAmount = detectAmounts(trimmed).at(-1);
  const withoutTrailingAmount = lastAmount ? trimmed.slice(0, lastAmount.index).trim() : trimmed;
  const trailing = TRAILING_QTY.exec(withoutTrailingAmount);
  if (trailing) {
    return { quantity: Number(trailing[2]), remainder: trailing[1]!.trim() };
  }

  const midLine = MID_LINE_QTY_MARKER.exec(trimmed);
  if (midLine) {
    const remainder = (
      trimmed.slice(0, midLine.index) +
      ' ' +
      trimmed.slice(midLine.index + midLine[0].length)
    )
      .replace(/\s+/g, ' ')
      .trim();
    return { quantity: Number(midLine[1] ?? midLine[2]), remainder };
  }

  const midLineParen = MID_LINE_PAREN_QTY_MARKER.exec(trimmed);
  if (midLineParen) {
    const remainder = (
      trimmed.slice(0, midLineParen.index) +
      ' ' +
      trimmed.slice(midLineParen.index + midLineParen[0].length)
    )
      .replace(/\s+/g, ' ')
      .trim();
    return { quantity: Number(midLineParen[1]), remainder };
  }

  return { quantity: 1, remainder: trimmed };
}
