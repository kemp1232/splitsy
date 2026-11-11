import { formatBillListDate, formatShortBillDate, isValidDateOnly, rollOverDateOnly } from './date';

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

describe('isValidDateOnly', () => {
  it('accepts a real calendar day', () => {
    expect(isValidDateOnly('2026-11-10')).toBe(true);
    expect(isValidDateOnly('2028-02-29')).toBe(true);
  });

  it('rejects days that do not exist', () => {
    expect(isValidDateOnly('2026-02-31')).toBe(false);
    expect(isValidDateOnly('2026-02-29')).toBe(false);
    expect(isValidDateOnly('2026-13-01')).toBe(false);
    expect(isValidDateOnly('2026-00-10')).toBe(false);
  });

  it('rejects anything not shaped YYYY-MM-DD', () => {
    expect(isValidDateOnly('2026/11/10')).toBe(false);
    expect(isValidDateOnly('2026-1-5')).toBe(false);
    expect(isValidDateOnly('')).toBe(false);
  });
});

describe('rollOverDateOnly', () => {
  it('rolls a day that does not exist over to the real date', () => {
    expect(rollOverDateOnly('2026-02-31')).toEqual({ date: '2026-03-03', rolledOver: true });
    expect(rollOverDateOnly('2026-02-29')).toEqual({ date: '2026-03-01', rolledOver: true });
    expect(rollOverDateOnly('2026-04-31')).toEqual({ date: '2026-05-01', rolledOver: true });
  });

  it('rolls an impossible month or day zero over too', () => {
    expect(rollOverDateOnly('2026-13-01')).toEqual({ date: '2027-01-01', rolledOver: true });
    expect(rollOverDateOnly('2026-03-00')).toEqual({ date: '2026-02-28', rolledOver: true });
  });

  it('leaves a real date unchanged', () => {
    expect(rollOverDateOnly('2028-02-29')).toEqual({ date: '2028-02-29', rolledOver: false });
  });

  it('leaves anything not shaped YYYY-MM-DD unchanged', () => {
    expect(rollOverDateOnly('Feb 31')).toEqual({ date: 'Feb 31', rolledOver: false });
  });
});
