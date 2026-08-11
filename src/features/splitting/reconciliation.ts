import type { ReconciliationInput, ReconciliationResult } from './split.types';

/**
 * Computes the spec 10.2 bill totals and the spec 10.8 receipt-discrepancy
 * numbers, from plain data only. Pure — the caller (a screen or hook) owns
 * turning `matches`/`differenceCentavos` into copy, a warning, an
 * "Add difference as an adjustment" action, or a "Continue with difference"
 * confirmation.
 *
 * ```text
 * computed total = item subtotal + adjustment total
 * receipt difference = detected receipt total - computed total
 * ```
 */
export function reconcileBillTotals(input: ReconciliationInput): ReconciliationResult {
  const { itemSubtotalCentavos, adjustmentTotalCentavos, detectedReceiptTotalCentavos } = input;
  const computedTotalCentavos = itemSubtotalCentavos + adjustmentTotalCentavos;

  // Null when there's nothing to compare against (e.g. a fully manual bill
  // with no receipt total entered) rather than defaulting to zero, so the
  // caller can't mistake "no detected total" for "an exact match".
  const differenceCentavos =
    detectedReceiptTotalCentavos === null
      ? null
      : detectedReceiptTotalCentavos - computedTotalCentavos;

  return {
    itemSubtotalCentavos,
    adjustmentTotalCentavos,
    computedTotalCentavos,
    detectedReceiptTotalCentavos,
    differenceCentavos,
    // No detected total means nothing is known to conflict with the
    // computed total, so there's no discrepancy to surface — `matches` is
    // true. Callers that need to distinguish "no detected total" from "an
    // exact match" still can, via `detectedReceiptTotalCentavos === null`.
    matches: differenceCentavos === null || differenceCentavos === 0,
  };
}
