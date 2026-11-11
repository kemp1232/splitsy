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

// Totals badge text: "Matches receipt" only when it really matches; with no
// detected receipt total nothing is claimed ("Not verified").
export function getTotalsBadgeLabel(status: TotalsMatchStatus): string {
  const r = copy.receiptReview;
  if (status === 'match') return r.totalsMatchBadge;
  if (status === 'mismatch') return r.totalsMismatchBadge;
  return r.totalsUnverifiedBadge;
}

// Screen-reader label for the totals header ("Total <amount>, <badge>");
// pass formatCentavosForSpeech as formatMoney.
export function buildTotalHeadlineSpeech(
  computedTotalCentavos: number,
  status: TotalsMatchStatus,
  formatMoney: (centavos: number) => string,
): string {
  return copy.receiptReview.totalHeadlineSpeech
    .replace('{amount}', () => formatMoney(computedTotalCentavos))
    .replace('{status}', () => getTotalsBadgeLabel(status).toLowerCase());
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

// Warning for a bill whose items + adjustments (fees, tax, discounts) add up
// to less than zero — almost always a misread discount or item price. Only a
// warning: the user can still continue. null when the total is zero or more.
export function getNegativeTotalWarning(computedTotalCentavos: number): string | null {
  return computedTotalCentavos < 0 ? copy.receiptReview.negativeTotalWarning : null;
}
