import type { ReactNode } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { colors, radius, touchTarget } from '@/theme/tokens';

type Props = {
  icon: ReactNode;
  onPress: () => void;
  accessibilityLabel: string;
};

// Icon-only controls must always carry a screen-reader label (spec section 17) —
// accessibilityLabel is required, not optional, on this component.
export function IconButton({ icon, onPress, accessibilityLabel }: Props) {
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

const styles = StyleSheet.create({
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
