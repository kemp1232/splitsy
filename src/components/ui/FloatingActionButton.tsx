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
//
// Styled after the reference UI's rounder, more prominent circular action
// button language (a bigger circle, a heavier shadow) — this app keeps a
// single floating action rather than the reference's pill-button-plus-
// separate-circle pairing (there's nothing else on this screen that calls
// for a second action).
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
      width: touchTarget.preferred + 16,
      height: touchTarget.preferred + 16,
      borderRadius: radius.pill,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.28,
      shadowRadius: 12,
      elevation: 8,
    },
    pressed: {
      backgroundColor: colors.primaryPressed,
    },
    plus: {
      fontSize: 30,
      lineHeight: 34,
      marginTop: -2,
    },
  });
}
