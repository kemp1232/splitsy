import { canRescanReceipt } from './canRescanReceipt';

const interrupted = {
  status: 'DRAFT' as const,
  entryMethod: 'GALLERY' as const,
  receiptImageUri: 'file:///receipt.jpg',
  rawOcrText: null,
  merchantName: null,
  receiptDate: null,
};

describe('canRescanReceipt', () => {
  it('is offered for a photo draft whose scan never finished', () => {
    expect(canRescanReceipt(interrupted, 0, 0)).toBe(true);
    expect(canRescanReceipt({ ...interrupted, entryMethod: 'CAMERA' }, 0, 0)).toBe(true);
  });

  it('is not offered once items or adjustments exist (a re-scan would duplicate them)', () => {
    expect(canRescanReceipt(interrupted, 1, 0)).toBe(false);
    expect(canRescanReceipt(interrupted, 0, 1)).toBe(false);
  });

  it('is not offered once a merchant name or date was typed', () => {
    expect(canRescanReceipt({ ...interrupted, merchantName: 'Ramen House' }, 0, 0)).toBe(false);
    expect(canRescanReceipt({ ...interrupted, receiptDate: '2026-11-11' }, 0, 0)).toBe(false);
    // Blank values don't count as typed.
    expect(canRescanReceipt({ ...interrupted, merchantName: '  ', receiptDate: '' }, 0, 0)).toBe(
      true,
    );
  });

  it('is not offered when the scan already produced text', () => {
    expect(canRescanReceipt({ ...interrupted, rawOcrText: 'TOTAL 500' }, 0, 0)).toBe(false);
  });

  it('is not offered for a completed, manual or photo-less bill', () => {
    expect(canRescanReceipt({ ...interrupted, status: 'COMPLETED' }, 0, 0)).toBe(false);
    expect(canRescanReceipt({ ...interrupted, entryMethod: 'MANUAL' }, 0, 0)).toBe(false);
    expect(canRescanReceipt({ ...interrupted, receiptImageUri: null }, 0, 0)).toBe(false);
  });
});
