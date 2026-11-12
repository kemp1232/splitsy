import { reconcileBillTotals } from '@/features/splitting/reconciliation';

import { hasUnresolvedDiscrepancy } from './hasUnresolvedDiscrepancy';

// Not from the spec — the forward-flow shortcut out of the assignments
// screen: once every item is assigned, the separate "Fees, tax, and
// discounts" screen is only worth stopping at when the bill doesn't already
// reconcile with the receipt. Uses the exact same "unresolved discrepancy"
// definition as resolveNextRoute's caller (index.tsx) and payments.tsx's own
// draft-progression guard — a detected-total mismatch the bill hasn't
// acknowledged — so the payments screen never bounces a skipped bill straight
// back to adjustments. Pulled out as a small pure function (no repository or
// router dependency) so that rule is directly unit-testable.
export type PostAssignmentsRoute = 'adjustments' | 'payments';

export type PostAssignmentsRouteInput = {
  items: { lineTotalCentavos: number }[];
  adjustments: { amountCentavos: number }[];
  detectedReceiptTotalCentavos: number | null;
  discrepancyAcknowledged: boolean;
  // The difference that acknowledgment covered — see hasUnresolvedDiscrepancy.
  acknowledgedDiscrepancyCentavos: number | null;
};

export function resolvePostAssignmentsRoute(
  input: PostAssignmentsRouteInput,
): PostAssignmentsRoute {
  // Plain sums (same as index.tsx's own resolveNextRoute input), not
  // calculateSplit — that one also needs every item assigned and would throw
  // otherwise, while the totals themselves don't depend on assignments.
  const itemSubtotalCentavos = input.items.reduce((sum, item) => sum + item.lineTotalCentavos, 0);
  const adjustmentTotalCentavos = input.adjustments.reduce(
    (sum, adjustment) => sum + adjustment.amountCentavos,
    0,
  );
  const reconciliation = reconcileBillTotals({
    itemSubtotalCentavos,
    adjustmentTotalCentavos,
    detectedReceiptTotalCentavos: input.detectedReceiptTotalCentavos,
  });

  return hasUnresolvedDiscrepancy(reconciliation, input) ? 'adjustments' : 'payments';
}
