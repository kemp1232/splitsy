import { contrastRatio } from './contrast';
import { avatarPalette, foodBadgePalette, onBadge } from './palettes';
import { darkColors, lightColors, type ColorTokens } from './tokens';

const palettes: [string, ColorTokens][] = [
  ['dark', darkColors],
  ['light', lightColors],
];

const AA = 4.5;

describe('contrastRatio', () => {
  it('matches the WCAG reference values for black/white', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5);
  });
});

describe.each(palettes)('%s palette contrast ratios meet WCAG AA', (_name, colors) => {
  it.each(['textPrimary', 'textSecondary', 'textMuted'] as const)(
    '%s on background and surface >= 4.5:1',
    (token) => {
      expect(contrastRatio(colors[token], colors.background)).toBeGreaterThanOrEqual(AA);
      expect(contrastRatio(colors[token], colors.surface)).toBeGreaterThanOrEqual(AA);
    },
  );

  it('textMuted on surfaceElevated >= 3:1 (non-essential text only)', () => {
    expect(contrastRatio(colors.textMuted, colors.surfaceElevated)).toBeGreaterThanOrEqual(3);
  });

  it.each([
    'primary',
    'primaryPressed',
    'gradientStart',
    'gradientEnd',
    'danger',
    'dangerPressed',
  ] as const)('onPrimary on %s >= 4.5:1', (token) => {
    expect(contrastRatio(colors.onPrimary, colors[token])).toBeGreaterThanOrEqual(AA);
  });

  it.each(['primary', 'success', 'warning', 'danger'] as const)(
    '%s as text on surface and background >= 4.5:1',
    (token) => {
      expect(contrastRatio(colors[token], colors.surface)).toBeGreaterThanOrEqual(AA);
      expect(contrastRatio(colors[token], colors.background)).toBeGreaterThanOrEqual(AA);
    },
  );
});

describe('decorative palettes', () => {
  it.each([...avatarPalette, ...Object.values(foodBadgePalette)])(
    'onBadge on %s >= 4.5:1',
    (fill) => {
      expect(contrastRatio(onBadge, fill)).toBeGreaterThanOrEqual(AA);
    },
  );
});
