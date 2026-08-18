import { useMemo } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ColorTokens } from '@/theme/tokens';
import { radius, spacing, touchTarget } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

import { AppText } from './AppText';

type Props = {
  onPress: () => void;
  accessibilityLabel: string;
};

// The one floating primary action this app's flow genuinely calls for (see
// the theme direction notes) — starting a new bill from the home screen.
// Deliberately kept to this single spot rather than scattered elsewhere.
export function FloatingActionButton({ onPress, accessibilityLabel }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [
        styles.fab,
        { bottom: spacing.lg + insets.bottom },
        pressed && styles.pressed,
      ]}
    >
      <AppText variant="heading" color="onPrimary" style={styles.plus}>
        +
      </AppText>
    </Pressable>
  );
}

function createStyles(colors: ColorTokens) {
  return StyleSheet.create({
    fab: {
      position: 'absolute',
      right: spacing.lg,
      width: touchTarget.preferred + 8,
      height: touchTarget.preferred + 8,
      borderRadius: radius.pill,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.2,
      shadowRadius: 8,
      elevation: 5,
    },
    pressed: {
      backgroundColor: colors.primaryPressed,
    },
    plus: {
      lineHeight: 30,
      marginTop: -2,
    },
  });
}
