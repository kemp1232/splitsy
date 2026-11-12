import { computeBillTotalCentavos } from './computeBillTotalCentavos';

describe('computeBillTotalCentavos', () => {
  it('adds the item subtotal and every adjustment, counting discounts as negative', () => {
    expect(
      computeBillTotalCentavos(
        [{ lineTotalCentavos: 6000 }, { lineTotalCentavos: 4000 }],
        [{ amountCentavos: 1200 }, { amountCentavos: -500 }],
      ),
    ).toBe(10700);
  });

  it('uses the computed total for a scanned bill, not the receipt total', () => {
    // A scanned bill whose items/fees don't add up to what the receipt said:
    // the row must show what the user actually split.
    expect(computeBillTotalCentavos([{ lineTotalCentavos: 9000 }], [])).toBe(9000);
  });

  it('returns the lump sum for a split-evenly bill (one "Total" item)', () => {
    expect(computeBillTotalCentavos([{ lineTotalCentavos: 250000 }], [])).toBe(250000);
  });

  it('returns the fee total for a bill that only has fees', () => {
    expect(computeBillTotalCentavos([], [{ amountCentavos: 300 }])).toBe(300);
  });

  it('returns null for an empty draft with no items and no fees', () => {
    expect(computeBillTotalCentavos([], [])).toBeNull();
  });
});
