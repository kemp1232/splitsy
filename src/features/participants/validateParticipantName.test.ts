import {
  displayParticipantName,
  isDuplicateParticipantName,
  MAX_PARTICIPANT_NAME_LENGTH,
  normalizeParticipantName,
  QUICK_ADD_ME_NAME,
  resolveQuickAddMeName,
  validateParticipantName,
} from './validateParticipantName';

describe('normalizeParticipantName', () => {
  it('trims surrounding whitespace and lowercases', () => {
    expect(normalizeParticipantName('  Alex  ')).toBe('alex');
  });
});

describe('isDuplicateParticipantName', () => {
  it('returns false when there are no existing names', () => {
    expect(isDuplicateParticipantName('Alex', [])).toBe(false);
  });

  it('returns true for an exact duplicate', () => {
    expect(isDuplicateParticipantName('Alex', ['Alex'])).toBe(true);
  });

  it('returns true for a case-insensitive duplicate', () => {
    expect(isDuplicateParticipantName('alex', ['Alex'])).toBe(true);
    expect(isDuplicateParticipantName('Alex', ['alex'])).toBe(true);
  });

  it('ignores surrounding whitespace on both sides of the comparison', () => {
    expect(isDuplicateParticipantName('  Alex  ', ['alex'])).toBe(true);
    expect(isDuplicateParticipantName('Alex', ['  alex  '])).toBe(true);
  });

  it('returns false when the name does not match any existing name', () => {
    expect(isDuplicateParticipantName('Jamie', ['Alex', 'Kemp'])).toBe(false);
  });
});

describe('validateParticipantName', () => {
  it('rejects an empty name as required', () => {
    expect(validateParticipantName('', [])).toEqual({ valid: false, reason: 'required' });
  });

  it('rejects a whitespace-only name as required', () => {
    expect(validateParticipantName('   ', [])).toEqual({ valid: false, reason: 'required' });
  });

  it('rejects a name longer than the maximum as too long', () => {
    const tooLong = 'a'.repeat(MAX_PARTICIPANT_NAME_LENGTH + 1);
    expect(validateParticipantName(tooLong, [])).toEqual({ valid: false, reason: 'tooLong' });
  });

  it('accepts a name exactly at the maximum length', () => {
    const atMax = 'a'.repeat(MAX_PARTICIPANT_NAME_LENGTH);
    expect(validateParticipantName(atMax, [])).toEqual({ valid: true, name: atMax });
  });

  it('rejects an exact duplicate', () => {
    expect(validateParticipantName('Alex', ['Alex', 'Kemp'])).toEqual({
      valid: false,
      reason: 'duplicate',
    });
  });

  it('rejects a case-insensitive duplicate', () => {
    expect(validateParticipantName('alex', ['Alex'])).toEqual({
      valid: false,
      reason: 'duplicate',
    });
  });

  it('accepts a trimmed, non-duplicate name', () => {
    expect(validateParticipantName('  Jamie  ', ['Alex', 'Kemp'])).toEqual({
      valid: true,
      name: 'Jamie',
    });
  });
});

describe('resolveQuickAddMeName', () => {
  it('uses the trimmed session name', () => {
    expect(resolveQuickAddMeName('  Kemp  ')).toBe('Kemp');
  });

  it('falls back to the Me name for undefined, null, or whitespace', () => {
    expect(resolveQuickAddMeName(undefined)).toBe(QUICK_ADD_ME_NAME);
    expect(resolveQuickAddMeName(null)).toBe(QUICK_ADD_ME_NAME);
    expect(resolveQuickAddMeName('   ')).toBe(QUICK_ADD_ME_NAME);
  });

  it('truncates to the maximum participant name length', () => {
    const result = resolveQuickAddMeName('a'.repeat(MAX_PARTICIPANT_NAME_LENGTH + 10));
    expect(result).toBe('a'.repeat(MAX_PARTICIPANT_NAME_LENGTH));
  });
});

describe('displayParticipantName', () => {
  it("shows the signed-in user's name for a stored 'Me' participant", () => {
    expect(displayParticipantName('Me', 'Kemp')).toBe('Kemp');
    expect(displayParticipantName('  me ', 'Kemp')).toBe('Kemp');
  });

  it('leaves every other name unchanged', () => {
    expect(displayParticipantName('Sam', 'Kemp')).toBe('Sam');
    expect(displayParticipantName('Meg', 'Kemp')).toBe('Meg');
  });
});
