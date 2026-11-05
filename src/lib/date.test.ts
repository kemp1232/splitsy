import { formatBillListDate, formatShortBillDate } from './date';

describe('formatShortBillDate', () => {
  it('formats a date-only receipt date as a short month and day', () => {
    expect(formatShortBillDate('2026-11-05')).toBe('Nov 5');
  });

  it('does not shift a date-only value to the previous day (no UTC parsing)', () => {
    expect(formatShortBillDate('2026-01-01')).toBe('Jan 1');
  });

  it('formats a full ISO timestamp in local time', () => {
    const local = new Date(2026, 10, 5, 12, 0, 0);
    expect(formatShortBillDate(local.toISOString())).toBe('Nov 5');
  });
});

describe('formatBillListDate', () => {
  it('formats a date-only receipt date as that same local calendar day (no UTC shift)', () => {
    expect(formatBillListDate('2026-01-01')).toBe(
      new Date(2026, 0, 1).toLocaleDateString('en-PH', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }),
    );
    expect(formatBillListDate('2026-01-01')).toContain('Jan 1');
  });

  it('still formats a full ISO timestamp in local time', () => {
    const local = new Date(2026, 10, 5, 12, 0, 0);
    expect(formatBillListDate(local.toISOString())).toContain('Nov 5');
  });
});
