import { normalizeAmountText, textToCentavos } from './AmountInput';

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

describe('normalizeAmountText', () => {
  it('strips thousands commas', () => {
    expect(normalizeAmountText('1,234.56')).toBe('1234.56');
    expect(textToCentavos(normalizeAmountText('1,234.56') ?? '')).toBe(123456);
  });

  it('strips a peso sign', () => {
    expect(normalizeAmountText('₱170')).toBe('170');
    expect(textToCentavos(normalizeAmountText('₱170') ?? '')).toBe(17000);
  });

  it('strips surrounding spaces', () => {
    expect(normalizeAmountText(' 170 ')).toBe('170');
    expect(textToCentavos(normalizeAmountText(' 170 ') ?? '')).toBe(17000);
  });

  it('strips a PHP prefix', () => {
    expect(normalizeAmountText('PHP 1,500')).toBe('1500');
  });

  it('keeps an empty or in-progress amount', () => {
    expect(normalizeAmountText('')).toBe('');
    expect(normalizeAmountText('12.')).toBe('12.');
  });

  it('rejects text that is still not an amount', () => {
    expect(normalizeAmountText('abc')).toBeNull();
    expect(normalizeAmountText('12a')).toBeNull();
  });

  it('strips commas between groups of three digits', () => {
    expect(normalizeAmountText('12,345')).toBe('12345');
    expect(normalizeAmountText('₱1,234')).toBe('1234');
    expect(normalizeAmountText('1,234,567.89')).toBe('1234567.89');
  });

  it('rejects a decimal comma instead of multiplying the amount', () => {
    expect(normalizeAmountText('12,50')).toBeNull();
  });

  it('rejects a comma that is not a thousands separator', () => {
    expect(normalizeAmountText('1,2')).toBeNull();
    expect(normalizeAmountText('1234,567')).toBeNull();
    expect(normalizeAmountText('1,234.5,6')).toBeNull();
  });

  it('rejects more than one decimal point', () => {
    expect(normalizeAmountText('1.2.3')).toBeNull();
  });

  it('rejects more than 7 integer digits or 2 decimal digits', () => {
    expect(normalizeAmountText('12345678')).toBeNull();
    expect(normalizeAmountText('1.234')).toBeNull();
  });
});
