import Feather from '@expo/vector-icons/Feather';
import type { ComponentProps } from 'react';
import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { tint } from '@/theme/tint';
import type { ColorTokens } from '@/theme/tokens';
import { radius, spacing, touchTarget } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

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
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? `${title}, ${caption}`}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View
        style={styles.iconTile}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Feather name={icon} size={18} color={colors.primary} />
      </View>
      <View style={styles.text}>
        <AppText variant="subheading" style={styles.uniformText}>
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
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radius.md,
      borderCurve: 'continuous',
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    iconTile: {
      width: 36,
      height: 36,
      borderRadius: radius.sm,
      borderCurve: 'continuous',
      backgroundColor: tint(colors.primary),
      alignItems: 'center',
      justifyContent: 'center',
    },
    text: {
      flex: 1,
      gap: 2,
    },
    pressed: {
      backgroundColor: colors.surfaceMuted,
    },
    uniformText: {
      fontSize: 14,
      lineHeight: 19,
    },
  });
}
