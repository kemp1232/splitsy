import {
  formatCentavos,
  formatCentavosForSpeech,
  isSafeCentavos,
  MAX_SAFE_CENTAVOS,
} from './money';

describe('formatCentavos', () => {
  it('formats zero', () => {
    expect(formatCentavos(0)).toBe('₱0.00');
  });

  it('formats a positive amount with thousands separators', () => {
    expect(formatCentavos(123456)).toBe('₱1,234.56');
  });

  it('formats a negative amount with the sign before the currency symbol', () => {
    expect(formatCentavos(-5000)).toBe('-₱50.00');
  });
});

describe('formatCentavosForSpeech', () => {
  it('speaks pesos and centavos together, matching the spec section 17 example', () => {
    expect(formatCentavosForSpeech(52025)).toBe('520 pesos and 25 centavos');
  });

  it('omits the centavos phrase entirely for a whole-peso amount', () => {
    expect(formatCentavosForSpeech(52000)).toBe('520 pesos');
  });

  it('speaks zero as "0 pesos"', () => {
    expect(formatCentavosForSpeech(0)).toBe('0 pesos');
  });

  it('uses the singular "peso" for exactly one peso', () => {
    expect(formatCentavosForSpeech(100)).toBe('1 peso');
  });

  it('uses the singular "centavo" for exactly one centavo', () => {
    expect(formatCentavosForSpeech(1)).toBe('0 pesos and 1 centavo');
  });

  it('uses the singular form for both pesos and centavos at once', () => {
    expect(formatCentavosForSpeech(101)).toBe('1 peso and 1 centavo');
  });

  it('prefixes a negative amount with "negative" rather than a bare minus sign', () => {
    expect(formatCentavosForSpeech(-52025)).toBe('negative 520 pesos and 25 centavos');
  });
});

describe('isSafeCentavos', () => {
  it('accepts zero, positive, and negative integers within the safe range', () => {
    expect(isSafeCentavos(0)).toBe(true);
    expect(isSafeCentavos(12345)).toBe(true);
    expect(isSafeCentavos(-12345)).toBe(true);
    expect(isSafeCentavos(MAX_SAFE_CENTAVOS)).toBe(true);
    expect(isSafeCentavos(-MAX_SAFE_CENTAVOS)).toBe(true);
  });

  it('rejects values outside the configured safe limit', () => {
    expect(isSafeCentavos(MAX_SAFE_CENTAVOS + 1)).toBe(false);
    expect(isSafeCentavos(-MAX_SAFE_CENTAVOS - 1)).toBe(false);
  });

  it('rejects non-integer, NaN, and infinite values', () => {
    expect(isSafeCentavos(12.5)).toBe(false);
    expect(isSafeCentavos(NaN)).toBe(false);
    expect(isSafeCentavos(Infinity)).toBe(false);
    expect(isSafeCentavos(-Infinity)).toBe(false);
  });
});
