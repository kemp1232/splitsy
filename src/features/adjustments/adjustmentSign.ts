import type { AdjustmentType } from './defaultAllocationMethod';

// The sign AdjustmentEditorSheet.tsx applies to its (always non-negative)
// amount field on save. DISCOUNT is always negative (spec 10.2). Any other
// type is negative only when it was opened from an existing negative
// adjustment of that same type — e.g. the "Receipt total difference" OTHER row
// created from a negative reconciliation difference (adjustments.tsx's
// handleAddDifference), or a receipt line parsed with an explicit minus
// (parseReceipt.ts) — so re-saving it, with or without a new magnitude, keeps
// it negative. A new adjustment, or one switched to a different type, is
// positive. Pulled out of the sheet so the rule
// is unit-testable, like validateAdjustmentAmount.ts.
export function adjustmentAmountSign(
  type: AdjustmentType,
  initial: { type: AdjustmentType; amountCentavos: number } | null,
): -1 | 1 {
  if (type === 'DISCOUNT') return -1;
  if (initial?.type === type && initial.amountCentavos < 0) return -1;
  return 1;
}
