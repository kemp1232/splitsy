import {
  getBillCustomName,
  getBillDisplayTitle,
  LEGACY_UNTITLED_BILL_TITLE,
} from './getBillDisplayTitle';

const base = {
  merchantName: null,
  title: '',
  receiptDate: null,
  createdAt: new Date(2026, 9, 20, 12, 0, 0).toISOString(),
};

describe('getBillDisplayTitle', () => {
  it('prefers the merchant name', () => {
    expect(getBillDisplayTitle({ ...base, merchantName: 'Mesa', title: 'Dinner' })).toBe('Mesa');
  });

  it('uses a custom title when there is no merchant name', () => {
    expect(getBillDisplayTitle({ ...base, title: 'Dinner' })).toBe('Dinner');
  });

  it('builds a date-based name from the receipt date for an empty title', () => {
    expect(getBillDisplayTitle({ ...base, receiptDate: '2026-11-05' })).toBe('Bill · Nov 5');
  });

  it('treats the legacy "Untitled bill" title as empty', () => {
    expect(
      getBillDisplayTitle({
        ...base,
        title: LEGACY_UNTITLED_BILL_TITLE,
        receiptDate: '2026-11-05',
      }),
    ).toBe('Bill · Nov 5');
  });

  it('falls back to the created date when there is no receipt date', () => {
    expect(getBillDisplayTitle(base)).toBe('Bill · Oct 20');
  });

  it('ignores a whitespace-only merchant name', () => {
    expect(getBillDisplayTitle({ ...base, merchantName: '  ', receiptDate: '2026-11-05' })).toBe(
      'Bill · Nov 5',
    );
  });
});

describe('getBillCustomName', () => {
  it('returns null for an untitled bill', () => {
    expect(getBillCustomName({ ...base, title: LEGACY_UNTITLED_BILL_TITLE })).toBeNull();
  });
});
