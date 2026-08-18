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
};

// Icon-only controls must always carry a screen-reader label (spec section 17) —
// accessibilityLabel is required, not optional, on this component.
export function IconButton({ icon, onPress, accessibilityLabel }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [styles.base, pressed && styles.pressed]}
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
    },
    pressed: {
      backgroundColor: colors.surfaceMuted,
    },
  });
}
