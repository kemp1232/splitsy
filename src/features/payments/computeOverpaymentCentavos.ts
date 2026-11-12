// How much more has been entered as paid than the bill's computed total —
// 0 when the contributions are at or under the total (paying exactly the
// total is the normal "settled" case). The Payments screen blocks Continue
// while this is above zero, so an overpayment is never saved.
export function computeOverpaymentCentavos(
  contributions: Record<string, number>,
  computedTotalCentavos: number,
): number {
  const contributedCentavos = Object.values(contributions).reduce(
    (sum, centavos) => sum + centavos,
    0,
  );
  // A negative total (discounts larger than the items — the screen already
  // warns about it) is compared as 0, so entering nothing never counts as
  // an overpayment and Continue isn't permanently blocked.
  return Math.max(0, contributedCentavos - Math.max(0, computedTotalCentavos));
}
