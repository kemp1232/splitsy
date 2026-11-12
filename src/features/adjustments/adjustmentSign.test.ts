import { adjustmentAmountSign } from './adjustmentSign';

describe('adjustmentAmountSign', () => {
  const negativeOther = { type: 'OTHER' as const, amountCentavos: -5000 };

  it('keeps an existing negative Other adjustment negative', () => {
    const sign = adjustmentAmountSign('OTHER', negativeOther);
    // Saved unchanged: the field holds the magnitude 5000.
    expect(sign * 5000).toBe(-5000);
  });

  it('keeps it negative when only the magnitude changes', () => {
    expect(adjustmentAmountSign('OTHER', negativeOther) * 7500).toBe(-7500);
  });

  it('treats an existing positive Other adjustment as positive', () => {
    expect(adjustmentAmountSign('OTHER', { type: 'OTHER', amountCentavos: 5000 })).toBe(1);
  });

  it('makes a new Other adjustment positive', () => {
    expect(adjustmentAmountSign('OTHER', null)).toBe(1);
  });

  it('always makes a Discount negative', () => {
    expect(adjustmentAmountSign('DISCOUNT', null)).toBe(-1);
    expect(adjustmentAmountSign('DISCOUNT', { type: 'DISCOUNT', amountCentavos: -1000 })).toBe(-1);
    expect(adjustmentAmountSign('DISCOUNT', { type: 'TAX', amountCentavos: 1000 })).toBe(-1);
  });

  it('makes Tax, Service charge and Tip positive', () => {
    expect(adjustmentAmountSign('TAX', null)).toBe(1);
    expect(
      adjustmentAmountSign('SERVICE_CHARGE', { type: 'SERVICE_CHARGE', amountCentavos: 1000 }),
    ).toBe(1);
    expect(adjustmentAmountSign('TIP', { type: 'TIP', amountCentavos: 1000 })).toBe(1);
  });

  it('makes a negative Other adjustment switched to Tax positive', () => {
    expect(adjustmentAmountSign('TAX', negativeOther)).toBe(1);
  });

  it('keeps an existing negative Tax, Service charge or Tip negative when the type is unchanged', () => {
    expect(adjustmentAmountSign('TAX', { type: 'TAX', amountCentavos: -1200 })).toBe(-1);
    expect(
      adjustmentAmountSign('SERVICE_CHARGE', { type: 'SERVICE_CHARGE', amountCentavos: -75700 }),
    ).toBe(-1);
    expect(adjustmentAmountSign('TIP', { type: 'TIP', amountCentavos: -500 })).toBe(-1);
  });

  it('makes a negative Service charge switched to Other positive', () => {
    expect(adjustmentAmountSign('OTHER', { type: 'SERVICE_CHARGE', amountCentavos: -75700 })).toBe(
      1,
    );
  });
});
