import { textToCentavos } from './AmountInput';

describe('textToCentavos', () => {
  it('parses a whole number', () => {
    expect(textToCentavos('240')).toBe(24000);
  });

  it('parses two decimal digits', () => {
    expect(textToCentavos('12.50')).toBe(1250);
  });

  it('pads a single trailing decimal digit', () => {
    expect(textToCentavos('12.5')).toBe(1250);
  });

  it('treats a bare trailing dot as zero cents', () => {
    expect(textToCentavos('12.')).toBe(1200);
  });

  it('handles the spec max amount without float drift', () => {
    expect(textToCentavos('9999999.99')).toBe(999999999);
  });

  it('handles values notoriously lossy as floats', () => {
    expect(textToCentavos('0.10')).toBe(10);
    expect(textToCentavos('1000000.29')).toBe(100000029);
  });
});
