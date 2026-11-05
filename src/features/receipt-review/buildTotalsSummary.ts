import { copy } from '@/constants/copy';

export type TotalsMatchStatus = 'match' | 'mismatch' | 'no-receipt-total';

export type TotalsMatch = {
  status: TotalsMatchStatus;
  // computed − detected; 0 when there is no detected receipt total.
  differenceCentavos: number;
};

// Compares receipt review's current total (items + adjustments) with the
// total detected on the receipt itself, if any. Integer centavos throughout.
export function getTotalsMatch(
  computedTotalCentavos: number,
  detectedTotalCentavos: number | null,
): TotalsMatch {
  if (detectedTotalCentavos == null) {
    return { status: 'no-receipt-total', differenceCentavos: 0 };
  }
  const differenceCentavos = computedTotalCentavos - detectedTotalCentavos;
  return { status: differenceCentavos === 0 ? 'match' : 'mismatch', differenceCentavos };
}

// One-line totals headline: "Total ₱X ✓ matches receipt" only when it really
// matches; otherwise just "Total ₱X" (no receipt total, or a mismatch — whose
// warning is rendered separately). `speech` swaps the ✓ glyph for words for
// the screen-reader label; pass formatCentavosForSpeech as formatMoney then.
export function buildTotalHeadline(
  computedTotalCentavos: number,
  status: TotalsMatchStatus,
  formatMoney: (centavos: number) => string,
  speech = false,
): string {
  const r = copy.receiptReview;
  const template =
    status === 'match'
      ? speech
        ? r.totalHeadlineMatchesSpeech
        : r.totalHeadlineMatches
      : r.totalHeadline;
  return template.replace('{amount}', () => formatMoney(computedTotalCentavos));
}

// Mismatch warning text — one builder for both the visible label
// (formatCentavos) and its screen-reader label (formatCentavosForSpeech).
export function buildMismatchMessage(
  differenceCentavos: number,
  formatMoney: (centavos: number) => string,
): string {
  const r = copy.receiptReview;
  return r.mismatchWarning
    .replace('{difference}', () => formatMoney(Math.abs(differenceCentavos)))
    .replace('{higherOrLower}', () => (differenceCentavos > 0 ? r.higherWord : r.lowerWord));
}
