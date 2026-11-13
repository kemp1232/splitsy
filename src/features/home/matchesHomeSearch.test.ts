import { matchesHomeSearch } from './matchesHomeSearch';

describe('matchesHomeSearch', () => {
  const fields = ['Mesa Grill', 'Peña', 'Ana'];

  it('matches everything for an empty query', () => {
    expect(matchesHomeSearch(fields, '')).toBe(true);
  });

  it('matches everything for a whitespace-only query', () => {
    expect(matchesHomeSearch(fields, '   ')).toBe(true);
  });

  it('trims a padded query', () => {
    expect(matchesHomeSearch(['Mesa Grill'], '  mesa  ')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(matchesHomeSearch(fields, 'MESA')).toBe(true);
  });

  it('matches multiple tokens in any order across fields', () => {
    expect(matchesHomeSearch(fields, 'ana grill')).toBe(true);
  });

  it('does not match when one token is missing', () => {
    expect(matchesHomeSearch(fields, 'mesa zzz')).toBe(false);
  });

  it('ignores null and undefined fields', () => {
    expect(matchesHomeSearch([null, undefined, 'Mesa'], 'mesa')).toBe(true);
    expect(matchesHomeSearch([null, undefined], 'null')).toBe(false);
    expect(matchesHomeSearch([null, undefined], 'undefined')).toBe(false);
  });

  it('ignores diacritics on both sides', () => {
    expect(matchesHomeSearch(fields, 'pena')).toBe(true);
    expect(matchesHomeSearch(['Pena'], 'Peña')).toBe(true);
  });

  it('does not match a non-empty query when there are no fields', () => {
    expect(matchesHomeSearch([], 'mesa')).toBe(false);
  });
});
