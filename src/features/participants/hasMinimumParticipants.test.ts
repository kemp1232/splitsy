import { hasMinimumParticipants, MINIMUM_PARTICIPANTS } from './hasMinimumParticipants';

describe('hasMinimumParticipants', () => {
  it('exposes 2 as the minimum required by spec F-012', () => {
    expect(MINIMUM_PARTICIPANTS).toBe(2);
  });

  it('returns false for zero participants', () => {
    expect(hasMinimumParticipants(0)).toBe(false);
  });

  it('returns false for one participant', () => {
    expect(hasMinimumParticipants(1)).toBe(false);
  });

  it('returns true at exactly the minimum of two participants', () => {
    expect(hasMinimumParticipants(2)).toBe(true);
  });

  it('returns true for more than the minimum', () => {
    expect(hasMinimumParticipants(3)).toBe(true);
  });
});
