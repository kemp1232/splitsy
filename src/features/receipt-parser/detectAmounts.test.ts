import { detectAmounts, rightmostAmount } from './detectAmounts';

describe('detectAmounts', () => {
  it.each([
    ['99.00', 9900],
    ['1,250.00', 125000],
    ['₱99.00', 9900],
    ['P 99.00', 9900],
    ['PHP 99.00', 9900],
    ['-50.00', -5000],
    ['(50.00)', -5000],
  ])('parses %s to %i centavos', (text, expectedCentavos) => {
    const [amount] = detectAmounts(text);
    expect(amount?.centavos).toBe(expectedCentavos);
  });

  it('finds multiple amounts on one line and keeps their order', () => {
    const amounts = detectAmounts('2 X 120.00 240.00');
    expect(amounts.map((a) => a.centavos)).toEqual([12000, 24000]);
  });

  it('refuses to guess at a malformed 3-decimal-digit number rather than truncating it', () => {
    expect(detectAmounts('99.005')).toEqual([]);
  });

  it('does not match dates, times, or long ID-like digit runs', () => {
    expect(detectAmounts('DATE: 01/15/2026 TIME: 19:32')).toEqual([]);
    expect(detectAmounts('OR NO: 0000123456')).toEqual([]);
    expect(detectAmounts('TIN: 000-000-000-000')).toEqual([]);
  });

  it('does not mistake a dot-separated transaction number for an amount', () => {
    // Without the trailing (?!\.\d) guard this would parse "01.15" out of the
    // first two segments as if it were ₱1.15.
    expect(detectAmounts('TXN NO: 01.15.26.0042')).toEqual([]);
  });

  it('avoids floating-point drift for values that are notoriously lossy as floats', () => {
    expect(detectAmounts('0.10')[0]?.centavos).toBe(10);
    expect(detectAmounts('1,000,000.99')[0]?.centavos).toBe(100000099);
  });
});

describe('rightmostAmount', () => {
  it('picks the last amount as the first heuristic for the line total', () => {
    expect(rightmostAmount('2 X 120.00 240.00')?.centavos).toBe(24000);
  });

  it('returns null when no amount is present', () => {
    expect(rightmostAmount('SAMPLE DINER')).toBeNull();
  });
});
