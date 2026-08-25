import {
  MAX_DISPLAY_NAME_LENGTH,
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  passwordsMatch,
  validateDisplayName,
  validateEmail,
  validateNewPassword,
  validateSignInPassword,
} from './validateAuthForm';

describe('validateEmail', () => {
  it('rejects an empty email as required', () => {
    expect(validateEmail('')).toEqual({ valid: false, reason: 'required' });
  });

  it('rejects a whitespace-only email as required', () => {
    expect(validateEmail('   ')).toEqual({ valid: false, reason: 'required' });
  });

  it('rejects an email missing an @ as invalid', () => {
    expect(validateEmail('not-an-email')).toEqual({ valid: false, reason: 'invalid' });
  });

  it('rejects an email missing a domain as invalid', () => {
    expect(validateEmail('alex@')).toEqual({ valid: false, reason: 'invalid' });
  });

  it('accepts a trimmed, well-formed email', () => {
    expect(validateEmail('  alex@example.com  ')).toEqual({
      valid: true,
      email: 'alex@example.com',
    });
  });
});

describe('validateSignInPassword', () => {
  it('rejects an empty password as required', () => {
    expect(validateSignInPassword('')).toEqual({ valid: false, reason: 'required' });
  });

  it('accepts any non-empty password, regardless of length', () => {
    expect(validateSignInPassword('a')).toEqual({ valid: true, password: 'a' });
  });
});

describe('validateNewPassword', () => {
  it('rejects an empty password as required', () => {
    expect(validateNewPassword('')).toEqual({ valid: false, reason: 'required' });
  });

  it('rejects a password shorter than the minimum as too short', () => {
    const tooShort = 'a'.repeat(MIN_PASSWORD_LENGTH - 1);
    expect(validateNewPassword(tooShort)).toEqual({ valid: false, reason: 'tooShort' });
  });

  it('accepts a password exactly at the minimum length', () => {
    const atMin = 'a'.repeat(MIN_PASSWORD_LENGTH);
    expect(validateNewPassword(atMin)).toEqual({ valid: true, password: atMin });
  });

  it('rejects a password longer than the maximum as too long', () => {
    const tooLong = 'a'.repeat(MAX_PASSWORD_LENGTH + 1);
    expect(validateNewPassword(tooLong)).toEqual({ valid: false, reason: 'tooLong' });
  });

  it('accepts a password exactly at the maximum length', () => {
    const atMax = 'a'.repeat(MAX_PASSWORD_LENGTH);
    expect(validateNewPassword(atMax)).toEqual({ valid: true, password: atMax });
  });
});

describe('validateDisplayName', () => {
  it('rejects an empty name as required', () => {
    expect(validateDisplayName('')).toEqual({ valid: false, reason: 'required' });
  });

  it('rejects a whitespace-only name as required', () => {
    expect(validateDisplayName('   ')).toEqual({ valid: false, reason: 'required' });
  });

  it('rejects a name longer than the maximum as too long', () => {
    const tooLong = 'a'.repeat(MAX_DISPLAY_NAME_LENGTH + 1);
    expect(validateDisplayName(tooLong)).toEqual({ valid: false, reason: 'tooLong' });
  });

  it('accepts a trimmed name within the maximum length', () => {
    expect(validateDisplayName('  Alex  ')).toEqual({ valid: true, name: 'Alex' });
  });
});

describe('passwordsMatch', () => {
  it('returns true when both passwords are identical', () => {
    expect(passwordsMatch('hunter2000', 'hunter2000')).toBe(true);
  });

  it('returns false when the passwords differ', () => {
    expect(passwordsMatch('hunter2000', 'hunter2001')).toBe(false);
  });
});
