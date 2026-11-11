import Feather from '@expo/vector-icons/Feather';
import type { ComponentProps } from 'react';
import { useMemo } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import type { ColorTokens } from '@/theme/tokens';
import { radius, spacing, touchTarget } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

import { usePressFeedback } from './usePressFeedback';

type Props = {
  icon: ComponentProps<typeof Feather>['name'];
  title: string;
  caption: string;
  onPress: () => void;
  // Defaults to "{title}, {caption}".
  accessibilityLabel?: string;
};

// Tinted icon tile + title/caption + chevron — the same row receipt-review.tsx
// uses for its "View receipt"/"View text" entries, shared here for the other
// bill screens' receipt shortcuts.
export function ActionRow({ icon, title, caption, onPress, accessibilityLabel }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const press = usePressFeedback();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? `${title}, ${caption}`}
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
    >
      {({ pressed }) => (
        <Animated.View style={[styles.row, pressed && styles.pressed, press.animatedStyle]}>
          <View
            style={styles.iconTile}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <Feather name={icon} size={20} color={colors.primary} />
          </View>
          <View style={styles.text}>
            <AppText variant="cardTitle" style={styles.uniformText}>
              {title}
            </AppText>
            <AppText variant="caption" color="textSecondary">
              {caption}
            </AppText>
          </View>
          <Feather
            name="chevron-right"
            size={20}
            color={colors.textSecondary}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          />
        </Animated.View>
      )}
    </Pressable>
  );
}

function createStyles(colors: ColorTokens) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      minHeight: touchTarget.preferred,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderRadius: radius.card,
      borderCurve: 'continuous',
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    iconTile: {
      width: 44,
      height: 44,
      borderRadius: radius.tile,
      borderCurve: 'continuous',
      backgroundColor: colors.surfaceElevated,
      alignItems: 'center',
      justifyContent: 'center',
    },
    text: {
      flex: 1,
      gap: 2,
    },
    pressed: {
      backgroundColor: colors.surfaceMuted,
      borderColor: colors.borderStrong,
    },
    uniformText: {
      fontSize: 15,
      lineHeight: 20,
    },
  });
}
