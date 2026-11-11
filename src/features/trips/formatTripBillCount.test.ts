import { buildTripDeleteConfirmBody, formatTripBillCount } from './formatTripBillCount';

describe('formatTripBillCount', () => {
  it('shows nothing for a trip with no bills', () => {
    expect(formatTripBillCount(0)).toBeNull();
  });

  it('uses the singular for one bill', () => {
    expect(formatTripBillCount(1)).toBe('1 bill');
  });

  it('uses the plural with the count otherwise', () => {
    expect(formatTripBillCount(3)).toBe('3 bills');
  });
});

describe('buildTripDeleteConfirmBody', () => {
  it('mentions no bills for an empty trip', () => {
    expect(buildTripDeleteConfirmBody(0)).toBe('This permanently removes the trip.');
  });

  it('uses the singular for one bill', () => {
    expect(buildTripDeleteConfirmBody(1)).toBe(
      'This permanently removes the trip and the 1 bill in it, including its receipt image.',
    );
  });

  it('uses the plural with the count otherwise', () => {
    expect(buildTripDeleteConfirmBody(4)).toBe(
      'This permanently removes the trip and all 4 bills in it, including their receipt images.',
    );
  });
});
