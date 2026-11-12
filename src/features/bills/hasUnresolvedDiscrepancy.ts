// The one "unresolved receipt discrepancy" rule every draft-progression check
// shares (assignments' shortcut, the payments/summary guards, the home and
// trip-hub resume routing). A "Continue with difference" acknowledgment only
// covers the exact difference the user saw: the bill stores that signed
// amount (acknowledgedDiscrepancyCentavos), and once items, people or fees
// change the difference, it no longer matches and the user is sent back to
// the adjustments screen to reconcile again.
//
// Bills acknowledged before the amount was stored (discrepancyAcknowledged
// true, amount null) count as unresolved: there is no way to know which
// difference they accepted, so they re-prompt once and then store it.
export function hasUnresolvedDiscrepancy(
  reconciliation: { matches: boolean; differenceCentavos: number | null },
  bill: { discrepancyAcknowledged: boolean; acknowledgedDiscrepancyCentavos: number | null },
): boolean {
  if (reconciliation.matches) return false;
  const acknowledgedThisDifference =
    bill.discrepancyAcknowledged &&
    bill.acknowledgedDiscrepancyCentavos !== null &&
    bill.acknowledgedDiscrepancyCentavos === reconciliation.differenceCentavos;
  return !acknowledgedThisDifference;
}
