import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import type { ColorTokens } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

export function Divider() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return <View style={styles.line} />;
}

function createStyles(colors: ColorTokens) {
  return StyleSheet.create({
    line: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.border,
    },
  });
}
