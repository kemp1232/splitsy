import { MAX_SAFE_CENTAVOS } from '@/lib/money';

import { isValidAdjustmentAmount } from './validateAdjustmentAmount';

describe('isValidAdjustmentAmount', () => {
  it('rejects zero', () => {
    expect(isValidAdjustmentAmount(0)).toBe(false);
  });

  it('rejects a negative amount', () => {
    expect(isValidAdjustmentAmount(-500)).toBe(false);
  });

  it('accepts a valid positive amount', () => {
    expect(isValidAdjustmentAmount(500)).toBe(true);
  });

  it('rejects NaN', () => {
    expect(isValidAdjustmentAmount(NaN)).toBe(false);
  });

  it('rejects positive Infinity', () => {
    expect(isValidAdjustmentAmount(Infinity)).toBe(false);
  });

  it('rejects negative Infinity', () => {
    expect(isValidAdjustmentAmount(-Infinity)).toBe(false);
  });

  it('rejects a non-integer amount', () => {
    expect(isValidAdjustmentAmount(500.5)).toBe(false);
  });

  it('accepts exactly the configured maximum (spec 10.1: ₱9,999,999.99)', () => {
    expect(isValidAdjustmentAmount(MAX_SAFE_CENTAVOS)).toBe(true);
  });

  it('rejects an amount one centavo past the configured maximum', () => {
    expect(isValidAdjustmentAmount(MAX_SAFE_CENTAVOS + 1)).toBe(false);
  });
});
