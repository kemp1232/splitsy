import { computeGetsBackCentavos } from './computeGetsBackCentavos';

describe('computeGetsBackCentavos', () => {
  it('returns paid minus share for someone who paid more than their share', () => {
    expect(computeGetsBackCentavos(100000, 25050)).toBe(74950);
  });

  it('returns null when they paid exactly their share', () => {
    expect(computeGetsBackCentavos(25050, 25050)).toBeNull();
  });

  it('returns null when they paid less than their share', () => {
    expect(computeGetsBackCentavos(10000, 25050)).toBeNull();
  });

  it('returns null when there is no payment info', () => {
    expect(computeGetsBackCentavos(undefined, 25050)).toBeNull();
  });
});
