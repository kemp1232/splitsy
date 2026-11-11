import { resolveVerifyEmailOutcome } from './resolveVerifyEmailOutcome';

describe('resolveVerifyEmailOutcome', () => {
  it('reports success only with the success marker', () => {
    expect(resolveVerifyEmailOutcome({ verified: '1' })).toBe('success');
  });

  it('reports an error even when the success marker is also present', () => {
    expect(resolveVerifyEmailOutcome({ verified: '1', error: 'TOKEN_EXPIRED' })).toBe('error');
    expect(resolveVerifyEmailOutcome({ error: 'INVALID_TOKEN' })).toBe('error');
  });

  it('claims nothing when opened with no params', () => {
    expect(resolveVerifyEmailOutcome({})).toBe('neutral');
    expect(resolveVerifyEmailOutcome({ verified: 'yes' })).toBe('neutral');
  });
});
