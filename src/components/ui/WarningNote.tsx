import Feather from '@expo/vector-icons/Feather';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import type { ColorTokens } from '@/theme/tokens';
import { radius, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

import { AppText } from './AppText';

type Props = {
  message: string;
};

// A non-blocking warning line: alert-triangle icon + text (not color alone,
// spec section 17). The warning counterpart to InlineError — e.g. the
// negative-total warning (getNegativeTotalWarning) on the fees, payments,
// summary and saved-bill screens.
export function WarningNote({ message }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.row} accessibilityLiveRegion="polite">
      <Feather name="alert-triangle" size={18} color={colors.warning} />
      <AppText variant="caption" style={styles.text}>
        {message}
      </AppText>
    </View>
  );
}

// 2026-11 redesign: a warning-outlined note card (icon + text, never color
// alone).
function createStyles(colors: ColorTokens) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radius.button,
      borderCurve: 'continuous',
      borderWidth: 1,
      borderColor: colors.warning,
      backgroundColor: colors.surface,
    },
    text: {
      flex: 1,
    },
  });
}
