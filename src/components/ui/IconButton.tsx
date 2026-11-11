import type { ReactNode } from 'react';
import { useMemo } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import type { ColorTokens } from '@/theme/tokens';
import { radius, touchTarget } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

type Props = {
  icon: ReactNode;
  onPress: () => void;
  accessibilityLabel: string;
  // Optional and additive: omitted by every existing call site.
  disabled?: boolean;
};

// Icon-only controls must always carry a screen-reader label (spec section 17) —
// accessibilityLabel is required, not optional, on this component.
export function IconButton({ icon, onPress, accessibilityLabel, disabled }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      aria-disabled={!!disabled}
      disabled={disabled}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [styles.base, pressed && styles.pressed, disabled && styles.disabled]}
    >
      {icon}
    </Pressable>
  );
}

function createStyles(colors: ColorTokens) {
  return StyleSheet.create({
    base: {
      width: touchTarget.preferred,
      height: touchTarget.preferred,
      minWidth: touchTarget.min,
      minHeight: touchTarget.min,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.pill,
      borderCurve: 'continuous',
    },
    pressed: {
      backgroundColor: colors.surfaceMuted,
    },
    disabled: {
      opacity: 0.4,
    },
  });
}
