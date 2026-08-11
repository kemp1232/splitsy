import { reconcileBillTotals } from './reconciliation';

describe('reconcileBillTotals', () => {
  it('computes the computed total from item subtotal and adjustment total', () => {
    const result = reconcileBillTotals({
      itemSubtotalCentavos: 1000,
      adjustmentTotalCentavos: 150,
      detectedReceiptTotalCentavos: null,
    });
    expect(result.computedTotalCentavos).toBe(1150);
  });

  it('applies a negative adjustment total (a discount) when computing the total', () => {
    const result = reconcileBillTotals({
      itemSubtotalCentavos: 1000,
      adjustmentTotalCentavos: -100,
      detectedReceiptTotalCentavos: null,
    });
    expect(result.computedTotalCentavos).toBe(900);
  });

  it('reports an exact match when the detected total equals the computed total', () => {
    const result = reconcileBillTotals({
      itemSubtotalCentavos: 1000,
      adjustmentTotalCentavos: 150,
      detectedReceiptTotalCentavos: 1150,
    });
    expect(result.differenceCentavos).toBe(0);
    expect(result.matches).toBe(true);
  });

  it('computes the difference as detected minus computed, and flags a mismatch', () => {
    const result = reconcileBillTotals({
      itemSubtotalCentavos: 1000,
      adjustmentTotalCentavos: 150,
      detectedReceiptTotalCentavos: 1200,
    });
    expect(result.differenceCentavos).toBe(50);
    expect(result.matches).toBe(false);
  });

  it('reports a negative difference when the computed total is higher than detected', () => {
    const result = reconcileBillTotals({
      itemSubtotalCentavos: 1000,
      adjustmentTotalCentavos: 150,
      detectedReceiptTotalCentavos: 1100,
    });
    expect(result.differenceCentavos).toBe(-50);
    expect(result.matches).toBe(false);
  });

  it('treats a missing detected total as nothing to reconcile against', () => {
    const result = reconcileBillTotals({
      itemSubtotalCentavos: 1000,
      adjustmentTotalCentavos: 0,
      detectedReceiptTotalCentavos: null,
    });
    expect(result.differenceCentavos).toBeNull();
    expect(result.matches).toBe(true);
    expect(result.detectedReceiptTotalCentavos).toBeNull();
  });
});
