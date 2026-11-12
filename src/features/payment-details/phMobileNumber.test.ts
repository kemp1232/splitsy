import {
  buildPaymentDetailsBlock,
  formatPhMobileNumber,
  isCreditor,
  normalizePhMobileNumber,
} from './phMobileNumber';

describe('normalizePhMobileNumber', () => {
  it.each([
    ['09171234567', '09171234567'],
    ['0917 123 4567', '09171234567'],
    ['0917-123-4567', '09171234567'],
    ['+639171234567', '09171234567'],
    ['+63 917 123 4567', '09171234567'],
    ['+63-917-123-4567', '09171234567'],
    ['639171234567', '09171234567'],
    ['  09171234567  ', '09171234567'],
  ])('accepts and normalizes %p', (raw, expected) => {
    expect(normalizePhMobileNumber(raw)).toEqual({ ok: true, value: expected });
  });

  it.each([
    ['too short', '0917123456'],
    ['too long', '091712345678'],
    ['letters', '0917abc4567'],
    ['landline', '0281234567'],
    ['+63 landline', '+63281234567'],
    ['missing leading 0', '9171234567'],
    ['other country code', '+19171234567'],
    ['other punctuation', '(0917) 123 4567'],
  ])('rejects %s', (_label, raw) => {
    expect(normalizePhMobileNumber(raw)).toEqual({ ok: false });
  });

  it.each([[''], ['   '], [' - ']])('treats %p as cleared', (raw) => {
    expect(normalizePhMobileNumber(raw)).toEqual({ ok: true, value: null });
  });
});

describe('formatPhMobileNumber', () => {
  it('groups a stored number as 4-3-4', () => {
    expect(formatPhMobileNumber('09171234567')).toBe('0917 123 4567');
  });

  it('returns anything not in the stored form unchanged', () => {
    expect(formatPhMobileNumber('12345')).toBe('12345');
  });
});

describe('isCreditor', () => {
  const transactions = [{ fromParticipantId: 'b', toParticipantId: 'a', amountCentavos: 100 }];

  it('is true when the participant is owed money in a transaction', () => {
    expect(isCreditor(transactions, 'a')).toBe(true);
  });

  it('is false when the participant only owes, or is not listed', () => {
    expect(isCreditor(transactions, 'b')).toBe(false);
    expect(isCreditor(transactions, 'c')).toBe(false);
    expect(isCreditor([], 'a')).toBe(false);
  });
});

describe('buildPaymentDetailsBlock', () => {
  it('lists each saved number under the heading', () => {
    expect(
      buildPaymentDetailsBlock({
        name: 'Ana',
        gcashNumber: '09171234567',
        mayaNumber: '09187654321',
      }),
    ).toBe('Pay Ana via:\nGCash: 0917 123 4567\nMaya: 0918 765 4321');
  });

  it('returns null when no number is saved', () => {
    expect(buildPaymentDetailsBlock({ name: 'Ana', gcashNumber: null, mayaNumber: null })).toBe(
      null,
    );
  });
});
