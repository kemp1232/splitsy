import { normalizeTripName } from './normalizeTripName';

describe('normalizeTripName', () => {
  it('trims surrounding whitespace', () => {
    expect(normalizeTripName('  Baguio weekend  ')).toBe('Baguio weekend');
  });

  it('returns null for an empty string', () => {
    expect(normalizeTripName('')).toBeNull();
  });

  it('returns null for whitespace only', () => {
    expect(normalizeTripName('   \t ')).toBeNull();
  });

  it('keeps inner spacing', () => {
    expect(normalizeTripName(' Baguio  weekend ')).toBe('Baguio  weekend');
  });
});
