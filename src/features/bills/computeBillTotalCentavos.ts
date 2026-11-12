// The bill total a list row shows: item subtotal + adjustment total — the
// same `computedTotalCentavos` reconcileBillTotals gives the bill detail
// screen, so a row never disagrees with the bill it opens (the receipt's own
// detected total can differ from what the user ended up entering). Plain
// sums, not calculateSplit: a draft may have no participants or unassigned
// items, and the total doesn't depend on either.
//
// Null for a bill with nothing in it yet (no items and no fees), so an
// empty draft's row shows no amount at all rather than a misleading ₱0.00.
export function computeBillTotalCentavos(
  items: { lineTotalCentavos: number }[],
  adjustments: { amountCentavos: number }[],
): number | null {
  if (items.length === 0 && adjustments.length === 0) return null;
  const itemSubtotalCentavos = items.reduce((sum, item) => sum + item.lineTotalCentavos, 0);
  const adjustmentTotalCentavos = adjustments.reduce(
    (sum, adjustment) => sum + adjustment.amountCentavos,
    0,
  );
  return itemSubtotalCentavos + adjustmentTotalCentavos;
}
