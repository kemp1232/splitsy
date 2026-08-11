import { detectAmounts } from './detectAmounts';

// Keyword groups from spec section 11.7, kept in one configurable module.
export const STRONG_TOTAL_KEYWORDS = [
  'GRAND TOTAL',
  'TOTAL DUE',
  'AMOUNT DUE',
  'NET TOTAL',
  'TOTAL',
];

export const SUBTOTAL_KEYWORDS = ['SUBTOTAL', 'SUB TOTAL', 'FOOD TOTAL'];

export const POSITIVE_ADJUSTMENT_KEYWORDS = [
  'VAT',
  'TAX',
  'SERVICE CHARGE',
  'SERVICE FEE',
  'SC',
  'TIP',
  'GRATUITY',
];

export const NEGATIVE_ADJUSTMENT_KEYWORDS = [
  'DISCOUNT',
  'PROMO',
  'COUPON',
  'LESS',
  'PWD DISCOUNT',
  'SENIOR DISCOUNT',
];

// Not in spec section 11.7's original list — found testing against a real
// Philippine BIR-compliant thermal receipt, which always prints this VAT
// breakdown block. "VATable Sale" is the *base amount* subject to VAT, not a
// charge on top of it — it must never become an item or an adjustment, or
// totals double-count it (spec section 11.7 frames these keyword lists as "one
// configurable module," i.e. meant to be extended for real-world formats).
// "VAT AMOUNT" belongs to the same breakdown block: it's the portion of the
// (already VAT-inclusive) item prices that is tax, not an additional charge on
// top of them — classifying it as a TAX adjustment would double-count VAT
// against AMOUNT DUE exactly the way a misclassified "...Sale" line would.
export const NON_ITEM_INFO_KEYWORDS = [
  'VATABLE SALE',
  'VAT-EXEMPT SALE',
  'VAT EXEMPT SALE',
  'ZERO-RATED SALE',
  'ZERO RATED SALE',
  'VAT AMOUNT',
];

export const PAYMENT_KEYWORDS = [
  'CASH',
  'TENDERED',
  'CHANGE',
  'CARD',
  'CREDIT',
  'DEBIT',
  'GCASH',
  'MAYA',
  'AMOUNT PAID',
  'PAYMENT',
  'BALANCE',
  'CUSTOMER COPY',
  'MERCHANT COPY',
  'OR NO',
  'TIN',
  'VAT REG',
  'TABLE',
  'SERVER',
  'CASHIER',
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Case-insensitive, whole-word/phrase matching so short keywords like "SC" or
// "TAX" don't match as substrings of unrelated words (e.g. "SC" inside
// "DISCOUNT" — a plain substring search would false-positive there). Spaces in
// a multi-word keyword become a flexible separator (whitespace, hyphen, dot,
// or comma, zero or more) so OCR punctuation noise like "SUB-TOTAL" still matches.
export function lineMatchesKeyword(line: string, keyword: string): boolean {
  const pattern = escapeRegExp(keyword).replace(/ /g, '[\\s\\-.,]*');
  return new RegExp(`\\b${pattern}\\b`, 'i').test(line);
}

export function lineMatchesAnyKeyword(line: string, keywords: string[]): boolean {
  return keywords.some((keyword) => lineMatchesKeyword(line, keyword));
}

// Real-device/VLM finding: an exact "VATABLE SALE" string match missed a
// one-character OCR/VLM misread ("(V)Valable Sale 388.39" instead of
// "(V)Vatable Sale 388.39" — t misread as l). Rather than special-casing that
// one typo, recognize the *structure* PH BIR receipts always use for this VAT
// breakdown block instead of the exact spelling of the descriptive word: a
// short category code — V(atable), E(xempt), A, B, SC, PWD, Z/ZR(ero-rated) —
// with at least one paren still attached (OCR sometimes drops just one side,
// as in the existing "E)VAT-Exempt Sale" case below), then a word, then the
// literal word "Sale", then a plausible amount. This structural shape is
// distinctive enough on real receipts that requiring the parens (rather than
// making the whole code optional) keeps it from ever matching an ordinary
// item line that happens to end in the word "Sale".
//
// A second real-device/VLM finding, one level more severe than the typo
// above: the word "Sale" itself can come back corrupted, not just the
// descriptive word before it. "(U)Vatable 5ale 388.39" — the VLM read the "S"
// in "Sale" as the digit "5" (a classic shape-similar OCR/VLM character
// confusion). `[s5]ale` tolerates exactly that single substitution while
// still requiring the rest of "ale" verbatim (the pattern already has the
// case-insensitive flag, so this also still matches plain "Sale"/"SALE") —
// it stays as narrow as the original "Sale"-only match, not a general
// invitation for arbitrary codes ending in "ale".
//
// That same real-device line also transcribed its category code as "(U)"
// rather than the "(V)" seen on the earlier scan of this identical receipt
// line — almost certainly the same underlying printed "V" misread as "U"
// this time (another shape-similar confusion, same category of bug as S/5).
// Added as one more literal, parenthesis-gated code alongside the existing
// ones rather than loosening the code check into a wildcard — it's still
// exactly as strict a match as every other entry in this list, just one
// more specific letter added to it.
const VAT_BREAKDOWN_CODE_PATTERN = '(?:V|E|A|B|SC|PWD|Z|ZR|EX|U)';

// GrabFood/North Park Noodles real-receipt finding: some receipts print this
// exact same VAT-breakdown block with no parenthesized code at all — just the
// bare descriptive label ("VATable Sales", "VAT-Exempt Sales", "Zero-Rated
// Sales") — and pluralize "Sale" as "Sales". The code-anchored branch above
// can't recognize either variant: it hard-requires the paren, and its
// trailing `\bale\b`-style boundary never matched "Sales" (a boundary can't
// sit between "e" and a following "s" — both are word characters). Rather
// than special-case the exact "Sales" spelling into the existing branch
// (which would then also start accepting any *arbitrary* word + "Sales" with
// no code at all, e.g. "BURGER SALES 100.00"), this adds a second, narrower
// branch: the descriptive word must literally be one of the known VAT
// category words (no code needed, since the word itself is now the anchor),
// and "Sale" may optionally be plural. The code-anchored branch is untouched.
const VAT_BREAKDOWN_CATEGORY_WORD_PATTERN = '(?:Vatable|VAT[\\s.-]*Exempt|Zero[\\s.-]*Rated)';
const VAT_BREAKDOWN_SALE_LINE_PATTERN = new RegExp(
  '^(?:' +
    `(?:\\(${VAT_BREAKDOWN_CODE_PATTERN}\\)?|${VAT_BREAKDOWN_CODE_PATTERN}\\))\\s*[A-Za-z][A-Za-z-]{1,20}` +
    `|${VAT_BREAKDOWN_CATEGORY_WORD_PATTERN}` +
    ')\\s+[s5]ales?\\b',
  'i',
);

export function isVatBreakdownSaleLine(text: string): boolean {
  const trimmed = text.trim();
  return VAT_BREAKDOWN_SALE_LINE_PATTERN.test(trimmed) && detectAmounts(trimmed).length > 0;
}

// Same VAT-breakdown block, same category of bug, one level more severe:
// "Vat Amount 46.61" (the tax portion of already VAT-inclusive item prices —
// informational only, see the module comment above `NON_ITEM_INFO_KEYWORDS`)
// came back from the VLM as "Vat Anburnt 46.61". Unlike the "Sale" typo
// above, this isn't a single-character swap — the entire second word changed
// shape — so no small character-class tweak covers it, and the exact-string
// 'VAT AMOUNT' entry in `NON_ITEM_INFO_KEYWORDS` never will either, for the
// same reason: it only ever covers the exact spelling of this one already-
// seen typo, not whatever the next one turns out to be.
//
// Instead, recognize the *shape* the same way `isVatBreakdownSaleLine` does:
// a line that is exactly the standalone word "Vat", one other word (any
// spelling), and a plausible amount — nothing else. This is a whole-line
// match (not just a prefix, since there's no parenthesized code here to
// anchor on), which is what keeps it from swallowing lines that merely
// mention "vat":
//   - "VAT/TIN:276-812-252-000" — no whitespace after "Vat" (a slash
//     instead), and no X.NN-shaped amount on the line at all — both fail the
//     match immediately.
//   - "(E)VAT-Exempt Sale 0.00" — "VAT" is glued to "-Exempt" by a hyphen,
//     not followed by whitespace, so this never reaches the word check; it's
//     `isVatBreakdownSaleLine`'s line to classify, not this one's.
//   - "VAT REG TIN 000-000-000" — caught earlier by `PAYMENT_KEYWORDS`'
//     'VAT REG' entry before classification ever reaches this function.
//   - A real menu item that happens to contain "vat" (e.g. "Vatican Pizza
//     100.00") — "Vatican" fails the `\bVat\b` word-boundary requirement
//     entirely (no boundary between "Vat" and "ican").
const VAT_AMOUNT_LINE_PATTERN = /^Vat\s+[A-Za-z][A-Za-z-]{1,20}$/i;

export function isVatAmountLine(text: string): boolean {
  const trimmed = text.trim();
  const amount = detectAmounts(trimmed).at(-1);
  if (!amount) return false;
  const withoutAmount = (
    trimmed.slice(0, amount.index) + trimmed.slice(amount.index + amount.raw.length)
  ).trim();
  return VAT_AMOUNT_LINE_PATTERN.test(withoutAmount);
}

// North Park Noodles real-receipt finding: the same BIR VAT-breakdown block
// also prints "VAT Tax 53.14" and, immediately after it, "Total Tax 53.14" —
// two more spellings of "the tax portion already included in the total,"
// restated the way `isVatAmountLine`'s "Vat Amount" already is. Neither is
// caught upstream: "VAT Tax" isn't "Vat"-plus-any-word the way "Vat Amount"
// is checked (it *is*, actually — see below), but "Total Tax" is the
// dangerous one, because classifyByKeyword falls through to
// STRONG_TOTAL_KEYWORDS *after* this INFO check, and the generic "TOTAL"
// keyword there matches "Total Tax" as a bare whole-word substring —
// producing a phantom second TOTAL candidate (MULTIPLE_TOTALS_FOUND) instead
// of recognizing this as non-additive information. Anchoring on the literal
// word "Tax" preceded by one of the two literal words this specific BIR block
// uses ("Vat"/"Total") — not a wildcard second word — is what keeps this from
// also matching a genuine, additive line like "Local Tax 20.00": the
// established convention in this file is to anchor structural matches on
// literal category words (see `VAT_BREAKDOWN_CATEGORY_WORD_PATTERN` above),
// never on an arbitrary word plus a generic suffix.
const VAT_TAX_BREAKDOWN_LINE_PATTERN = /^(?:Vat|Total)\s+Tax$/i;

export function isVatTaxBreakdownLine(text: string): boolean {
  const trimmed = text.trim();
  const amount = detectAmounts(trimmed).at(-1);
  if (!amount) return false;
  const withoutAmount = (
    trimmed.slice(0, amount.index) + trimmed.slice(amount.index + amount.raw.length)
  ).trim();
  return VAT_TAX_BREAKDOWN_LINE_PATTERN.test(withoutAmount);
}
