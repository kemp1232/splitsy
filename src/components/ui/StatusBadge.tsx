import { useMemo } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import type { ColorTokens } from '@/theme/tokens';
import { radius, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

import { AppText } from './AppText';

type Tone = 'neutral' | 'success' | 'warning' | 'danger';

type Props = {
  label: string;
  tone?: Tone;
  // Optional container-style override — e.g. BillListItem.tsx's own usage
  // needs `alignSelf: 'flex-end'` to right-align this inside a column that
  // otherwise left-aligns it by default. Merged after this component's own
  // base/tone styles, so a caller can only add to or override layout, never
  // touch the tone-color fill/border those already own.
  style?: StyleProp<ViewStyle>;
};

// Status is always conveyed by the label text itself, never by background
// color alone (spec section 17).
export function StatusBadge({ label, tone = 'neutral', style }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={[styles.badge, styles[tone], style]}>
      <AppText variant="caption" color="textPrimary">
        {label}
      </AppText>
    </View>
  );
}

function createStyles(colors: ColorTokens) {
  // Tone fills are a low-alpha wash of the tone color rather than a fixed
  // pastel literal — composited over whatever surface sits behind the badge,
  // that alpha blend naturally lands as a light tint in the light theme and a
  // dark tint in the dark theme, instead of needing a separate hardcoded pastel
  // per theme.
  return StyleSheet.create({
    badge: {
      alignSelf: 'flex-start',
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs / 2,
      borderRadius: radius.pill,
      borderCurve: 'continuous',
      borderWidth: 1,
    },
    neutral: { backgroundColor: colors.surfaceMuted, borderColor: colors.border },
    success: { backgroundColor: `${colors.success}26`, borderColor: colors.success },
    warning: { backgroundColor: `${colors.warning}26`, borderColor: colors.warning },
    danger: { backgroundColor: `${colors.danger}26`, borderColor: colors.danger },
  });
}
