import {
  resolvePostAssignmentsRoute,
  type PostAssignmentsRouteInput,
} from './resolvePostAssignmentsRoute';

// Items (₱100.00) plus a ₱12.00 tax exactly matching a ₱112.00 receipt total.
// Tests override only the field(s) relevant to the case under test.
const matchedInput: PostAssignmentsRouteInput = {
  items: [{ lineTotalCentavos: 6000 }, { lineTotalCentavos: 4000 }],
  adjustments: [{ amountCentavos: 1200 }],
  detectedReceiptTotalCentavos: 11200,
  discrepancyAcknowledged: false,
  acknowledgedDiscrepancyCentavos: null,
};

describe('resolvePostAssignmentsRoute', () => {
  it('routes to payments when the bill matches the receipt total', () => {
    expect(resolvePostAssignmentsRoute(matchedInput)).toBe('payments');
  });

  it('routes to adjustments when the totals differ and the difference is unacknowledged', () => {
    expect(resolvePostAssignmentsRoute({ ...matchedInput, adjustments: [] })).toBe('adjustments');
  });

  it('routes to payments when the totals differ but the difference was acknowledged', () => {
    // Items 100.00 vs receipt 112.00: difference +12.00, acknowledged as-is.
    expect(
      resolvePostAssignmentsRoute({
        ...matchedInput,
        adjustments: [],
        discrepancyAcknowledged: true,
        acknowledgedDiscrepancyCentavos: 1200,
      }),
    ).toBe('payments');
  });

  it('routes to adjustments when the difference changed after it was acknowledged', () => {
    // Acknowledged +12.00, then an item was edited: now 90.00 vs 112.00 (+22.00).
    expect(
      resolvePostAssignmentsRoute({
        ...matchedInput,
        items: [{ lineTotalCentavos: 6000 }, { lineTotalCentavos: 3000 }],
        adjustments: [],
        discrepancyAcknowledged: true,
        acknowledgedDiscrepancyCentavos: 1200,
      }),
    ).toBe('adjustments');
  });

  it('routes to payments when an acknowledged negative difference is unchanged', () => {
    // Items 100.00 + tax 12.00 vs receipt 110.00: difference -2.00.
    expect(
      resolvePostAssignmentsRoute({
        ...matchedInput,
        detectedReceiptTotalCentavos: 11000,
        discrepancyAcknowledged: true,
        acknowledgedDiscrepancyCentavos: -200,
      }),
    ).toBe('payments');
  });

  it('routes to adjustments for a legacy acknowledgment with no stored amount', () => {
    expect(
      resolvePostAssignmentsRoute({
        ...matchedInput,
        adjustments: [],
        discrepancyAcknowledged: true,
        acknowledgedDiscrepancyCentavos: null,
      }),
    ).toBe('adjustments');
  });

  it('routes to payments when there is no detected receipt total', () => {
    expect(
      resolvePostAssignmentsRoute({
        ...matchedInput,
        adjustments: [],
        detectedReceiptTotalCentavos: null,
      }),
    ).toBe('payments');
  });

  it('counts a negative discount when checking for a match', () => {
    expect(
      resolvePostAssignmentsRoute({
        ...matchedInput,
        adjustments: [{ amountCentavos: 1200 }, { amountCentavos: -1000 }],
        detectedReceiptTotalCentavos: 10200,
      }),
    ).toBe('payments');
  });

  it('routes to payments with no adjustments when the items alone match', () => {
    expect(
      resolvePostAssignmentsRoute({
        ...matchedInput,
        adjustments: [],
        detectedReceiptTotalCentavos: 10000,
      }),
    ).toBe('payments');
  });
});
