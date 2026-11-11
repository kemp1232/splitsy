import { useMemo, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import type { ColorTokens } from '@/theme/tokens';
import { radius, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

import { AppText } from './AppText';

type Tone = 'neutral' | 'success' | 'warning' | 'danger';

// Which color token each tone's `solid` fill uses (see `solid` below).
const SOLID_TONE_TOKEN: Record<Tone, keyof ColorTokens> = {
  neutral: 'textSecondary',
  success: 'success',
  warning: 'warning',
  danger: 'danger',
};

// Extracts just the hue (0-360) from a "#rrggbb" token — the only thing
// `pastelSolidColors` below needs from it.
function hueOf(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return 0;
  let h: number;
  switch (max) {
    case r:
      h = ((g - b) / d) % 6;
      break;
    case g:
      h = (b - r) / d + 2;
      break;
    default:
      h = (r - g) / d + 4;
  }
  return (h * 60 + 360) % 360;
}

function hslToHex(h: number, s: number, l: number): string {
  const sFrac = s / 100;
  const lFrac = l / 100;
  const c = (1 - Math.abs(2 * lFrac - 1)) * sFrac;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = lFrac - c / 2;
  let [r, g, b] = [0, 0, 0];
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const toHex = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// The `solid` pastel fill's bg/text pair: takes only the *hue* from the
// theme's own success/warning/danger token (which barely differs between
// light and dark theme — it's each tone's lightness/saturation that's
// calibrated very differently per theme for regular text-on-neutral-surface
// use) and re-renders it at a fixed, deliberately soft lightness/saturation
// band instead. This is what keeps the pastel look consistent between
// themes: mixing each theme's own success token toward white by a flat ratio
// would way overshoot on dark theme, whose base success color is already
// light, and undershoot on light theme, whose base is quite dark.
// bg 80L/42S + text 27L/48S computed to land at ~4.8-5.3:1 contrast — clearly
// softer than the previous full-saturation-fill + onPrimary-text pairing
// (5.3-12.2:1) without dropping below WCAG AA's 4.5:1 floor for this badge's
// caption-size text.
function pastelSolidColors(baseHex: string): { background: string; text: string } {
  const hue = hueOf(baseHex);
  return {
    background: hslToHex(hue, 42, 80),
    text: hslToHex(hue, 48, 27),
  };
}

type Props = {
  label: string;
  tone?: Tone;
  // Optional container-style override — e.g. BillListItem.tsx's own usage
  // needs `alignSelf: 'flex-end'` to right-align this inside a column that
  // otherwise left-aligns it by default. Merged after this component's own
  // base/tone styles, so a caller can only add to or override layout, never
  // touch the tone-color fill/border those already own.
  style?: StyleProp<ViewStyle>;
  // Overrides the label's default color. Only meaningful when `solid` is
  // false — the solid pastel variant always uses its own computed text color
  // (see `pastelSolidColors`), since that color isn't one of the fixed
  // `ColorTokens` this prop can name.
  labelColor?: keyof ColorTokens;
  // Full-opacity pastel fill instead of the default low-alpha wash, with no
  // border (the fill itself is the boundary). For a background the wash
  // isn't designed for — e.g. GradientHeroCard's own saturated gradient,
  // where a translucent tint composites into a murky smear rather than
  // reading as a distinct chip. See `pastelSolidColors` for how the
  // fill/text pair is derived.
  solid?: boolean;
  // Optional leading icon, rendered with the label's own color (same
  // render-prop shape as AppButton's `icon`).
  icon?: (color: string) => ReactNode;
};

// Status is always conveyed by the label text itself, never by background
// color alone (spec section 17).
export function StatusBadge({
  label,
  tone = 'neutral',
  style,
  solid = false,
  labelColor: labelColorProp,
  icon,
}: Props) {
  const { colors } = useTheme();
  // 2026-11 redesign: outlined status pills — a toned pill's label takes
  // the tone's own color (mint "Matches receipt", etc.) unless the caller
  // asks for a specific one. Every tone token clears 4.5:1 as text on
  // background/surface (tokens.test.ts).
  const labelColor: keyof ColorTokens =
    labelColorProp ?? (tone === 'neutral' ? 'textSecondary' : SOLID_TONE_TOKEN[tone]);
  const styles = useMemo(() => createStyles(colors), [colors]);
  const pastel = solid ? pastelSolidColors(colors[SOLID_TONE_TOKEN[tone]]) : null;
  const solidStyle = pastel ? { backgroundColor: pastel.background, borderWidth: 0 } : null;
  return (
    <View style={[styles.badge, styles[tone], solidStyle, style]}>
      {icon ? icon(pastel ? pastel.text : colors[labelColor]) : null}
      <AppText
        variant="caption"
        color={labelColor}
        style={pastel ? { color: pastel.text } : undefined}
      >
        {label}
      </AppText>
    </View>
  );
}

function createStyles(colors: ColorTokens) {
  // 2026-11 redesign: toned badges are outlines — a transparent fill with a
  // tone-colored border (and, by default, a tone-colored label), so they read
  // the same over any surface in either theme. Only `neutral` keeps a quiet
  // elevated-surface fill. (The `solid` variant above computes its own
  // pastel fill instead.)
  return StyleSheet.create({
    badge: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      borderRadius: radius.pill,
      borderCurve: 'continuous',
      borderWidth: 1.5,
    },
    neutral: { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
    success: { backgroundColor: 'transparent', borderColor: colors.success },
    warning: { backgroundColor: 'transparent', borderColor: colors.warning },
    danger: { backgroundColor: 'transparent', borderColor: colors.danger },
  });
}
