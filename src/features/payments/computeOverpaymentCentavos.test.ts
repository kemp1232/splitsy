import { computeOverpaymentCentavos } from './computeOverpaymentCentavos';

describe('computeOverpaymentCentavos', () => {
  it('is 0 when less than the total has been entered', () => {
    expect(computeOverpaymentCentavos({ a: 3000, b: 2000 }, 10000)).toBe(0);
  });

  it('is 0 when the contributions exactly equal the total', () => {
    expect(computeOverpaymentCentavos({ a: 6000, b: 4000 }, 10000)).toBe(0);
  });

  it('returns the excess when more than the total has been entered', () => {
    expect(computeOverpaymentCentavos({ a: 10000, b: 2550 }, 10000)).toBe(2550);
  });

  it('is 0 when nothing has been entered', () => {
    expect(computeOverpaymentCentavos({}, 10000)).toBe(0);
  });

  it('is 0 for a negative total when every contribution is 0', () => {
    expect(computeOverpaymentCentavos({ a: 0, b: 0 }, -500)).toBe(0);
  });

  it('treats a negative total as 0, so any positive contribution is the excess', () => {
    expect(computeOverpaymentCentavos({ a: 300, b: 0 }, -500)).toBe(300);
  });
});
