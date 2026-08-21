import { memo, useMemo } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import type { ColorTokens } from '@/theme/tokens';
import { radius, spacing, touchTarget } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

type Props = {
  name: string;
  // Omit onPress to render a plain, non-interactive pill (e.g. a read-only
  // label). Provide it to render a selectable pill, as used by
  // ParticipantPickerSheet's multi-select list.
  selected?: boolean;
  onPress?: () => void;
};

// Memoized (RN perf rule) — rendered in a loop wherever a bill's/trip's
// participant list is shown as chips.
export const ParticipantChip = memo(function ParticipantChip({ name, selected, onPress }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const isInteractive = typeof onPress === 'function';

  return (
    <Pressable
      onPress={onPress}
      disabled={!isInteractive}
      accessibilityRole={isInteractive ? 'checkbox' : undefined}
      accessibilityState={isInteractive ? { checked: !!selected } : undefined}
      accessibilityLabel={isInteractive ? name : undefined}
      style={({ pressed }) => [
        styles.chip,
        selected && styles.chipSelected,
        isInteractive && pressed && styles.chipPressed,
      ]}
    >
      {/* Selection is conveyed by the check mark text, not only the pill's
          background color (spec section 17). */}
      <AppText variant="body" color={selected ? 'onPrimary' : 'textPrimary'}>
        {selected ? `✓ ${name}` : name}
      </AppText>
    </Pressable>
  );
});

function createStyles(colors: ColorTokens) {
  return StyleSheet.create({
    chip: {
      minHeight: touchTarget.min,
      justifyContent: 'center',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceMuted,
    },
    chipSelected: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    chipPressed: {
      opacity: 0.85,
    },
  });
}
