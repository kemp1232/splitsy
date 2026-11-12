import { hasUnresolvedDiscrepancy } from './hasUnresolvedDiscrepancy';

const unacknowledged = { discrepancyAcknowledged: false, acknowledgedDiscrepancyCentavos: null };

describe('hasUnresolvedDiscrepancy', () => {
  it('is false when the totals match', () => {
    expect(hasUnresolvedDiscrepancy({ matches: true, differenceCentavos: 0 }, unacknowledged)).toBe(
      false,
    );
  });

  it('is false when there is no detected receipt total', () => {
    expect(
      hasUnresolvedDiscrepancy({ matches: true, differenceCentavos: null }, unacknowledged),
    ).toBe(false);
  });

  it('is true for a difference that was never acknowledged', () => {
    expect(
      hasUnresolvedDiscrepancy({ matches: false, differenceCentavos: 1200 }, unacknowledged),
    ).toBe(true);
  });

  it('is false when the acknowledged amount equals the current difference', () => {
    expect(
      hasUnresolvedDiscrepancy(
        { matches: false, differenceCentavos: -350 },
        { discrepancyAcknowledged: true, acknowledgedDiscrepancyCentavos: -350 },
      ),
    ).toBe(false);
  });

  it('is true when the difference changed after it was acknowledged', () => {
    expect(
      hasUnresolvedDiscrepancy(
        { matches: false, differenceCentavos: 500 },
        { discrepancyAcknowledged: true, acknowledgedDiscrepancyCentavos: 1200 },
      ),
    ).toBe(true);
  });

  it('is true for a legacy acknowledgment with no stored amount', () => {
    expect(
      hasUnresolvedDiscrepancy(
        { matches: false, differenceCentavos: 1200 },
        { discrepancyAcknowledged: true, acknowledgedDiscrepancyCentavos: null },
      ),
    ).toBe(true);
  });

  it('is true when a stored amount of 0 meets a non-zero difference', () => {
    expect(
      hasUnresolvedDiscrepancy(
        { matches: false, differenceCentavos: 100 },
        { discrepancyAcknowledged: true, acknowledgedDiscrepancyCentavos: 0 },
      ),
    ).toBe(true);
  });
});
