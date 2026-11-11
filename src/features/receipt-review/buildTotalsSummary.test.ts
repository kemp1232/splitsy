import { formatCentavos } from '@/lib/money';

import {
  buildMismatchMessage,
  buildTotalHeadlineSpeech,
  getTotalsBadgeLabel,
  getNegativeTotalWarning,
  getTotalsMatch,
} from './buildTotalsSummary';

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

describe('getTotalsBadgeLabel', () => {
  it('claims a receipt match only when the totals match', () => {
    expect(getTotalsBadgeLabel('match')).toBe('Matches receipt');
  });

  it('flags a mismatch', () => {
    expect(getTotalsBadgeLabel('mismatch')).toBe('Totals differ');
  });

  it('claims nothing when no receipt total was detected', () => {
    expect(getTotalsBadgeLabel('no-receipt-total')).toBe('Not verified');
  });
});

describe('buildTotalHeadlineSpeech', () => {
  it('reads the total and its match status', () => {
    expect(buildTotalHeadlineSpeech(52025, 'match', fakeSpeech)).toBe(
      'Total 52025 centavos, matches receipt',
    );
  });

  it('never claims a match on a mismatch or without a receipt total', () => {
    expect(buildTotalHeadlineSpeech(52025, 'mismatch', fakeSpeech)).toBe(
      'Total 52025 centavos, totals differ',
    );
    expect(buildTotalHeadlineSpeech(52025, 'no-receipt-total', fakeSpeech)).toBe(
      'Total 52025 centavos, not verified',
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

describe('getNegativeTotalWarning', () => {
  it('warns when the discounts are bigger than the items', () => {
    expect(getNegativeTotalWarning(-1)).toBe(
      'The discounts are bigger than the items. Check the item prices and discount amounts on the receipt.',
    );
  });

  it('does not warn at exactly zero or above', () => {
    expect(getNegativeTotalWarning(0)).toBeNull();
    expect(getNegativeTotalWarning(52025)).toBeNull();
  });
});
