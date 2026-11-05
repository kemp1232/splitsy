import { formatCentavos } from '@/lib/money';

import { buildMismatchMessage, buildTotalHeadline, getTotalsMatch } from './buildTotalsSummary';

const fakeSpeech = (centavos: number) => `${centavos} centavos`;

describe('getTotalsMatch', () => {
  it('matches when the current total equals the receipt total', () => {
    expect(getTotalsMatch(52025, 52025)).toEqual({ status: 'match', differenceCentavos: 0 });
  });

  it('reports a mismatch with the signed difference', () => {
    expect(getTotalsMatch(52500, 52025)).toEqual({ status: 'mismatch', differenceCentavos: 475 });
    expect(getTotalsMatch(51000, 52025)).toEqual({ status: 'mismatch', differenceCentavos: -1025 });
  });

  it('reports no receipt total when none was detected', () => {
    expect(getTotalsMatch(52025, null)).toEqual({
      status: 'no-receipt-total',
      differenceCentavos: 0,
    });
  });
});

describe('buildTotalHeadline', () => {
  it('claims a receipt match only when the totals match', () => {
    expect(buildTotalHeadline(52025, 'match', formatCentavos)).toBe(
      `Total ${formatCentavos(52025)} ✓ matches receipt`,
    );
  });

  it('shows the plain total when no receipt total was detected', () => {
    expect(buildTotalHeadline(52025, 'no-receipt-total', formatCentavos)).toBe(
      `Total ${formatCentavos(52025)}`,
    );
  });

  it('shows the plain total on a mismatch', () => {
    expect(buildTotalHeadline(52025, 'mismatch', formatCentavos)).toBe(
      `Total ${formatCentavos(52025)}`,
    );
  });

  it('uses words instead of the check glyph for the speech label', () => {
    expect(buildTotalHeadline(52025, 'match', fakeSpeech, true)).toBe(
      'Total 52025 centavos, matches receipt',
    );
  });
});

describe('buildMismatchMessage', () => {
  it('says how much higher the current total is', () => {
    expect(buildMismatchMessage(475, formatCentavos)).toBe(
      `The current total is ${formatCentavos(475)} higher than the receipt.`,
    );
  });

  it('says how much lower the current total is', () => {
    expect(buildMismatchMessage(-1025, formatCentavos)).toBe(
      `The current total is ${formatCentavos(1025)} lower than the receipt.`,
    );
  });
});
