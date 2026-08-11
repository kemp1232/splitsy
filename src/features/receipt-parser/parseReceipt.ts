import type { OcrDocument } from '@/features/receipt-ocr/ocr.types';

import { classifyReceiptLines } from './classifyReceiptLines';
import { detectAmounts, rightmostAmount } from './detectAmounts';
import { detectQuantity } from './detectQuantity';
import { mergeFramelessLabelContinuations, mergeIntoRows, normalizeOcr } from './normalizeOcr';
import { lineMatchesAnyKeyword, NEGATIVE_ADJUSTMENT_KEYWORDS } from './receiptKeywords';
import type {
  AdjustmentType,
  AllocationMethod,
  ClassifiedLine,
  ParsedAdjustment,
  ParsedLineItem,
  ParsedReceipt,
  ParserWarning,
} from './receiptParser.types';

// Bumped whenever the parsing heuristics change meaningfully — stored on the
// bill row so a future re-parse can tell which rules produced the existing draft.
export const PARSER_VERSION = 1;

const LOW_CONFIDENCE_THRESHOLD = 0.5;
const MERCHANT_SCAN_WINDOW = 6;
const DATE_PATTERN = /\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b/;
const DATE_OR_TIME_HINT = /\bDATE\b|\bTIME\b|\b\d{1,2}:\d{2}\b/i;
// Wrapped-name joins require real geometry (spec section 11.8: "when the
// vertical gap and left alignment are plausible"). Without it, a naive
// content-only guess would happily glue an unrelated header line (e.g. a date
// line with no amount) onto the next item's name — so when either line lacks
// a frame, no join happens at all; the item just keeps its own text.
const WRAP_MAX_VERTICAL_GAP_PX = 12;
const WRAP_MAX_LEFT_OFFSET_PX = 20;

function stripRightmostAmount(text: string): string {
  const amount = rightmostAmount(text);
  if (!amount) return text.trim();
  return (text.slice(0, amount.index) + text.slice(amount.index + amount.raw.length)).trim();
}

// Amount + a single letter glued directly onto it with no separating space —
// e.g. a GrabFood VAT-inclusive marker ("606.00V") or a unit-price marker
// ("85.00v"). This is the same "amount plus at most one stray letter" shape
// normalizeOcr.ts's isAmountPlusAtMostOneStrayLetter already recognizes, just
// applied here for a different purpose (name cleanup instead of deciding
// whether a frameless fragment should be merged as a continuation line): once
// an amount is identified for removal from an item's name text, a letter that
// is genuinely glued to it (no whitespace between them — i.e. adjacent, not a
// separate word) is removed together with it. A letter separated by
// whitespace (e.g. the real-device "145.00 V" merged-column fixture) is left
// alone, since that's a distinct token, not a glued marker.
const GLUED_TRAILING_MARKER_LETTER = /^[A-Za-z]\b/;

// A bare unit-price marker with no decimal point at all, e.g. GrabFood's
// "@202" in "2PC BGRSTKSPR @202 606.00V". detectAmounts/stripAllAmounts never
// touches this — spec 11.5's amount pattern deliberately requires exactly 2
// decimal digits (that's what correctly excludes OR numbers/TINs/table
// numbers elsewhere) — so it survives amount-stripping and stays glued into
// the item name unless removed separately here.
const BARE_UNIT_PRICE_MARKER = /@\d{1,4}\b/g;

// Used for item names specifically: after row-merging, a name can end up with
// an extra embedded amount from a neighboring column (e.g. a per-item quantity
// figure like "1.00") that isn't the line's rightmost amount and so survives
// stripRightmostAmount. A real item name never legitimately contains a money
// amount, so removing every detected amount (not just the last one) is safe.
// Also strips a glued marker letter adjacent to a removed amount and any bare
// "@digits" unit-price marker (see the two patterns above).
function stripAllAmounts(text: string): string {
  const amounts = detectAmounts(text);
  let result = text;
  for (const amount of [...amounts].reverse()) {
    const afterAmount = amount.index + amount.raw.length;
    const gluedLetter = GLUED_TRAILING_MARKER_LETTER.exec(result.slice(afterAmount));
    const removalEnd = gluedLetter ? afterAmount + gluedLetter[0].length : afterAmount;
    result = result.slice(0, amount.index) + result.slice(removalEnd);
  }
  return result.replace(BARE_UNIT_PRICE_MARKER, ' ').replace(/\s+/g, ' ').trim();
}

function isMostlyNumeric(text: string): boolean {
  const letters = (text.match(/[A-Za-z]/g) ?? []).length;
  const digits = (text.match(/[0-9]/g) ?? []).length;
  return letters === 0 || digits > letters;
}

function inferMerchantName(classified: ClassifiedLine[]): string | null {
  for (const line of classified.slice(0, MERCHANT_SCAN_WINDOW)) {
    if (line.kind !== 'OTHER') continue;
    const text = line.text.trim();
    if (!text || !/[A-Za-z]/.test(text) || isMostlyNumeric(text) || DATE_OR_TIME_HINT.test(text)) {
      continue;
    }
    return text;
  }
  return null;
}

function inferReceiptDate(classified: ClassifiedLine[]): string | null {
  for (const line of classified) {
    const match = DATE_PATTERN.exec(line.text);
    if (!match) continue;
    const [, month, day, year] = match;
    const fullYear = year!.length === 2 ? `20${year}` : year!;
    return `${fullYear}-${month!.padStart(2, '0')}-${day!.padStart(2, '0')}`;
  }
  return null;
}

function canJoinAsWrappedName(prev: ClassifiedLine, current: ClassifiedLine): boolean {
  if (prev.kind !== 'OTHER' || detectAmounts(prev.text).length > 0 || !/[A-Za-z]/.test(prev.text)) {
    return false;
  }
  if (!prev.frame || !current.frame) return false;
  const verticalGap = current.frame.y - (prev.frame.y + prev.frame.height);
  const leftOffset = Math.abs(current.frame.x - prev.frame.x);
  return verticalGap <= WRAP_MAX_VERTICAL_GAP_PX && leftOffset <= WRAP_MAX_LEFT_OFFSET_PX;
}

function buildItems(classified: ClassifiedLine[]): ParsedLineItem[] {
  const items: ParsedLineItem[] = [];

  for (let index = 0; index < classified.length; index++) {
    const line = classified[index]!;
    if (line.kind !== 'ITEM_CANDIDATE') continue;

    const lineTotal = rightmostAmount(line.text);
    if (!lineTotal) continue;

    const prev = index > 0 ? classified[index - 1] : undefined;
    const wrapPrefix = prev && canJoinAsWrappedName(prev, line) ? `${prev.text.trim()} ` : '';

    const { quantity, remainder } = detectQuantity(line.text);
    const name = `${wrapPrefix}${stripAllAmounts(remainder)}`.trim() || line.text.trim();

    items.push({
      name,
      quantity,
      lineTotalCentavos: lineTotal.centavos,
      source: 'OCR',
      confidence: line.confidence ?? null,
      rawText: `${wrapPrefix}${line.text}`.trim(),
    });
  }

  return items;
}

function adjustmentType(text: string): AdjustmentType {
  if (lineMatchesAnyKeyword(text, ['VAT', 'TAX'])) return 'TAX';
  if (lineMatchesAnyKeyword(text, ['SERVICE CHARGE', 'SERVICE FEE', 'SC'])) return 'SERVICE_CHARGE';
  if (lineMatchesAnyKeyword(text, ['TIP', 'GRATUITY'])) return 'TIP';
  if (lineMatchesAnyKeyword(text, NEGATIVE_ADJUSTMENT_KEYWORDS)) return 'DISCOUNT';
  return 'OTHER';
}

// Defaults from spec section 12 (F-014) — tip is the one type that defaults to
// equal rather than proportional.
const DEFAULT_ALLOCATION: Record<AdjustmentType, AllocationMethod> = {
  TAX: 'PROPORTIONAL',
  SERVICE_CHARGE: 'PROPORTIONAL',
  TIP: 'EQUAL',
  DISCOUNT: 'PROPORTIONAL',
  OTHER: 'PROPORTIONAL',
};

function buildAdjustments(classified: ClassifiedLine[]): ParsedAdjustment[] {
  const adjustments: ParsedAdjustment[] = [];

  for (const line of classified) {
    if (line.kind !== 'POSITIVE_ADJUSTMENT' && line.kind !== 'NEGATIVE_ADJUSTMENT') continue;
    const amount = rightmostAmount(line.text);
    if (!amount) continue;

    const type = adjustmentType(line.text);
    // Sign resolution order: an explicit "-" or wrapping-parens sign that
    // detectAmounts already folded into amount.centavos (it only ever
    // produces a negative value when the source text actually carried one —
    // see detectAmounts.ts) always wins over the keyword-inferred sign below.
    // Real-device finding: "Sales SC: (G2/S2) -757.00" matches the "SC"
    // positive-adjustment keyword, but its amount is explicitly printed
    // negative — that explicit "-" must not be discarded just because the
    // line matched a positive-sounding keyword.
    //
    // Falling back to the keyword-inferred sign only applies when the source
    // has *no* explicit sign at all (spec section 10.2) — this is the case
    // the original discount fix needed: many receipts print a discount as a
    // bare positive figure ("DISCOUNT 20.00") with no minus sign anywhere,
    // and that must still resolve to negative. That behavior is unchanged
    // here; only a POSITIVE_ADJUSTMENT-keyword line with an explicit negative
    // sign is new.
    const hasExplicitSign = amount.centavos < 0;
    const amountCentavos = hasExplicitSign
      ? amount.centavos
      : line.kind === 'NEGATIVE_ADJUSTMENT'
        ? -Math.abs(amount.centavos)
        : Math.abs(amount.centavos);

    adjustments.push({
      type,
      label: stripRightmostAmount(line.text) || type,
      amountCentavos,
      allocationMethod: DEFAULT_ALLOCATION[type],
      source: 'OCR',
      rawText: line.text,
    });
  }

  return adjustments;
}

// "Last plausible total" (spec 11.10) — literally the last keyword-matched
// line is not good enough on its own: a footer line like "Total No. of ITEMS
// : 5" matches the generic "TOTAL" keyword (it contains the word "Total") but
// carries no money amount at all. Once a frameless multi-line receipt's
// earlier label+amount lines are correctly reunited
// (mergeFramelessLabelContinuations), such a footer line can end up being the
// literal last TOTAL-classified line in the whole document — if picked
// blindly, its missing amount would null out an otherwise perfectly good,
// already-detected total. "Plausible" is taken literally here: walk
// TOTAL-classified lines from the end and use the last one that actually
// resolves to an amount, skipping any that don't.
function lastPlausibleAmount(lines: ClassifiedLine[]): number | null {
  for (let index = lines.length - 1; index >= 0; index--) {
    const amount = rightmostAmount(lines[index]!.text);
    if (amount) return amount.centavos;
  }
  return null;
}

function inferSubtotal(classified: ClassifiedLine[]): number | null {
  return lastPlausibleAmount(classified.filter((line) => line.kind === 'SUBTOTAL'));
}

function inferTotal(classified: ClassifiedLine[]): number | null {
  // The final TOTAL-classified line is preferred over filtering by
  // payment-line position, since PAYMENT_KEYWORDS includes header fields
  // (TIN, TABLE) that can appear before every item and would otherwise
  // wrongly exclude the real total.
  return lastPlausibleAmount(classified.filter((line) => line.kind === 'TOTAL'));
}

// Reconciliation backstop for whatever the *next* unanticipated OCR/VLM
// misread turns out to be (the keyword fix above only covers the specific PH
// BIR VAT-breakdown pattern we've actually seen). This is a post-pass over
// already-built items — it never weakens or replaces classifyReceiptLines'
// keyword rules, it only reconsiders lines that fell through them as plain
// item candidates.
//
// Only ever removes exactly one item, and only when there IS a detected total
// to check against and removing that one item makes the computed total match
// it exactly. Tolerance is 0 centavos (exact match only), not "a cent or two,"
// for two reasons: (1) the concrete bug this backstops (the VATABLE SALE
// typo) already reconciles exactly once the keyword fix above classifies it
// correctly, so no slack is actually needed there, and (2) allowing a
// nonzero-but-close residual would leave a confusing state where an item was
// silently removed *and* TOTAL_MISMATCH (which checks for exact equality)
// still fires — exact-match-only keeps "we fixed it" and "we couldn't fix it"
// unambiguous. If more than one item's removal would each independently
// reconcile the total, that's ambiguous which one is the real outlier, so
// nothing is removed and the existing TOTAL_MISMATCH warning stands as before.
function reconcileItemsAgainstTotal(input: {
  items: ParsedLineItem[];
  adjustmentTotalCentavos: number;
  detectedTotalCentavos: number | null;
}): { items: ParsedLineItem[]; excludedItem: ParsedLineItem | null } {
  const { items, adjustmentTotalCentavos, detectedTotalCentavos } = input;
  if (detectedTotalCentavos === null) return { items, excludedItem: null };

  const itemSubtotalCentavos = items.reduce((sum, item) => sum + item.lineTotalCentavos, 0);
  const computedTotalCentavos = itemSubtotalCentavos + adjustmentTotalCentavos;
  if (computedTotalCentavos === detectedTotalCentavos) {
    return { items, excludedItem: null };
  }

  const candidates = items.filter(
    (item) => computedTotalCentavos - item.lineTotalCentavos === detectedTotalCentavos,
  );
  if (candidates.length !== 1) {
    return { items, excludedItem: null };
  }

  const excludedItem = candidates[0]!;
  return { items: items.filter((item) => item !== excludedItem), excludedItem };
}

function buildWarnings(input: {
  items: ParsedLineItem[];
  adjustments: ParsedAdjustment[];
  classified: ClassifiedLine[];
  detectedSubtotalCentavos: number | null;
  detectedTotalCentavos: number | null;
  lowConfidenceLineCount: number;
  excludedReconciliationItem: ParsedLineItem | null;
}): ParserWarning[] {
  const {
    items,
    adjustments,
    classified,
    detectedSubtotalCentavos,
    detectedTotalCentavos,
    lowConfidenceLineCount,
    excludedReconciliationItem,
  } = input;
  const warnings: ParserWarning[] = [];

  const itemSubtotalCentavos = items.reduce((sum, item) => sum + item.lineTotalCentavos, 0);
  const adjustmentTotalCentavos = adjustments.reduce((sum, adj) => sum + adj.amountCentavos, 0);

  if (items.length === 0) {
    warnings.push({ code: 'NO_ITEMS_DETECTED', message: 'No line items detected.' });
  }
  if (detectedTotalCentavos === null) {
    warnings.push({ code: 'NO_TOTAL_DETECTED', message: 'No receipt total detected.' });
  }
  if (classified.filter((line) => line.kind === 'TOTAL').length > 1) {
    warnings.push({ code: 'MULTIPLE_TOTALS_FOUND', message: 'Multiple possible totals found.' });
  }
  if (detectedSubtotalCentavos !== null && detectedSubtotalCentavos !== itemSubtotalCentavos) {
    warnings.push({
      code: 'SUBTOTAL_MISMATCH',
      message: 'Detected subtotal does not match item subtotal.',
    });
  }
  if (
    detectedTotalCentavos !== null &&
    detectedTotalCentavos !== itemSubtotalCentavos + adjustmentTotalCentavos
  ) {
    warnings.push({
      code: 'TOTAL_MISMATCH',
      message: 'Detected total does not match parsed items and adjustments.',
    });
  }
  if (lowConfidenceLineCount > 0) {
    warnings.push({
      code: 'LOW_CONFIDENCE_LINES_USED',
      message: 'Low-confidence OCR lines were used.',
    });
  }
  if (classified.some((line) => line.kind === 'PAYMENT')) {
    warnings.push({
      code: 'PAYMENT_LINE_EXCLUDED',
      message: 'Possible payment line was excluded.',
    });
  }
  if (excludedReconciliationItem !== null) {
    warnings.push({
      code: 'ITEM_EXCLUDED_ON_RECONCILIATION',
      message: 'An unrecognized line was excluded to match the receipt total.',
    });
  }

  return warnings;
}

export function parseReceipt(document: OcrDocument): ParsedReceipt {
  const normalized = normalizeOcr(document);
  const rows = mergeIntoRows(normalized);
  // Frameless-only counterpart to mergeIntoRows above (spec section 11.4/11.8;
  // see normalizeOcr.ts's own comment for the full rationale) — reunites a
  // VLM-backend label line with its amount(s) when a receipt prints them on
  // separate physical lines instead of one row per item/total. Guarded to
  // never touch any line that already has geometry, so this is purely
  // additive for the on-device path.
  const reconstructed = mergeFramelessLabelContinuations(rows);
  const classified = classifyReceiptLines(reconstructed);

  const rawItems = buildItems(classified);
  const adjustments = buildAdjustments(classified);
  const detectedSubtotalCentavos = inferSubtotal(classified);
  const detectedTotalCentavos = inferTotal(classified);
  const adjustmentTotalCentavos = adjustments.reduce((sum, adj) => sum + adj.amountCentavos, 0);
  const lowConfidenceLineCount = classified.filter(
    (line) => typeof line.confidence === 'number' && line.confidence < LOW_CONFIDENCE_THRESHOLD,
  ).length;

  const { items, excludedItem: excludedReconciliationItem } = reconcileItemsAgainstTotal({
    items: rawItems,
    adjustmentTotalCentavos,
    detectedTotalCentavos,
  });

  return {
    merchantName: inferMerchantName(classified),
    receiptDate: inferReceiptDate(classified),
    items,
    adjustments,
    detectedSubtotalCentavos,
    detectedTotalCentavos,
    rawText: document.text,
    warnings: buildWarnings({
      items,
      adjustments,
      classified,
      detectedSubtotalCentavos,
      detectedTotalCentavos,
      lowConfidenceLineCount,
      excludedReconciliationItem,
    }),
    diagnostics: {
      normalizedLineCount: normalized.length,
      totalCandidates: classified
        .filter((line) => line.kind === 'TOTAL')
        .map((line) => rightmostAmount(line.text))
        .filter((amount) => amount !== null),
      excludedPaymentLines: classified
        .filter((line) => line.kind === 'PAYMENT')
        .map((line) => line.text),
      excludedReconciliationLines:
        excludedReconciliationItem !== null ? [excludedReconciliationItem.rawText] : [],
      lowConfidenceLineCount,
    },
  };
}
