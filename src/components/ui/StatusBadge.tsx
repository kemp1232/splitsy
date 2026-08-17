import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import type { ColorTokens } from '@/theme/tokens';
import { radius, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

import { AppText } from './AppText';

type Tone = 'neutral' | 'success' | 'warning' | 'danger';

type Props = {
  label: string;
  tone?: Tone;
};

// Status is always conveyed by the label text itself, never by background
// color alone (spec section 17).
export function StatusBadge({ label, tone = 'neutral' }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={[styles.badge, styles[tone]]}>
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
      borderWidth: 1,
    },
    neutral: { backgroundColor: colors.surfaceMuted, borderColor: colors.border },
    success: { backgroundColor: `${colors.success}26`, borderColor: colors.success },
    warning: { backgroundColor: `${colors.warning}26`, borderColor: colors.warning },
    danger: { backgroundColor: `${colors.danger}26`, borderColor: colors.danger },
  });
}
