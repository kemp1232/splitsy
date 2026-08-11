// Spec 20.1's "Bill validation" category ("Invalid adjustment") + spec 10.1
// ("Reject NaN, infinity, and values outside configured safe limits"):
// AdjustmentEditorSheet.tsx's amount field always holds a non-negative
// magnitude (the sheet applies DISCOUNT's negative sign separately, after
// this check — see its own comments), and that magnitude must be a positive,
// finite, integer number of centavos that's also safely inside the app's
// configured maximum bill amount.
//
// Pulled out of AdjustmentEditorSheet.tsx's handleSave so this rule is
// directly unit-testable on its own, mirroring the same-milestone precedent
// set by hasMinimumParticipants.ts and partitionLineItemsByAssignment.ts.
// isSafeCentavos already rejects NaN/Infinity/non-integers (Number.isInteger
// is false for all three) and anything past MAX_SAFE_CENTAVOS, but it accepts
// zero and negative values (it only checks magnitude) — the explicit `> 0`
// check below is what actually enforces "positive, non-zero" on top of it.
import { isSafeCentavos } from '@/lib/money';

export function isValidAdjustmentAmount(amountMagnitudeCentavos: number): boolean {
  return amountMagnitudeCentavos > 0 && isSafeCentavos(amountMagnitudeCentavos);
}
