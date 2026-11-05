import { isTabBarHiddenForPath } from './tabBarVisibility';

describe('isTabBarHiddenForPath', () => {
  it.each(['/bill/new', '/bill/capture', '/bill/abc123/summary', '/bill/abc123', '/bill'])(
    'hides the tab bar on bill screens (%s)',
    (pathname) => {
      expect(isTabBarHiddenForPath(pathname)).toBe(true);
    },
  );

  it.each(['/', '/settings', '/trip/abc123', '/trip/new', '/billing'])(
    'keeps the tab bar elsewhere (%s)',
    (pathname) => {
      expect(isTabBarHiddenForPath(pathname)).toBe(false);
    },
  );
});
