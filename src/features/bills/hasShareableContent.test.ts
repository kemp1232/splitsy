import { hasShareableContent } from './hasShareableContent';

describe('hasShareableContent', () => {
  it('is false for an empty draft with no items and no people', () => {
    expect(hasShareableContent(0, 0)).toBe(false);
  });

  it('is false when there are items but nobody to split them with', () => {
    expect(hasShareableContent(2, 0)).toBe(false);
  });

  it('is false when there are people but no items', () => {
    expect(hasShareableContent(0, 3)).toBe(false);
  });

  it('is true once the bill has items and people', () => {
    expect(hasShareableContent(1, 2)).toBe(true);
  });
});
