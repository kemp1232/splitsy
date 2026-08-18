import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { copy } from '@/constants/copy';
import type { Adjustment } from '@/db/repositories/adjustments.repository';
import { formatCentavos } from '@/lib/money';
import type { ColorTokens } from '@/theme/tokens';
import { radius, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

// Short allocation-method label shown under an adjustment's name, matching
// the same three strings the allocation picker in AdjustmentEditorSheet uses
// (spec 13.15).
const ALLOCATION_METHOD_LABELS: Record<Adjustment['allocationMethod'], string> = {
  PROPORTIONAL: copy.adjustments.allocationProportional,
  EQUAL: copy.adjustments.allocationEqual,
  CUSTOM: copy.adjustments.allocationCustom,
};

type Props = {
  adjustment: Adjustment;
  onPress: () => void;
};

// Mirrors LineItemRow's tap-to-edit row shape (spec 13.15's list of
// adjustments) — amountCentavos is already signed (negative for discounts),
// so formatCentavos renders its own minus sign; no separate "discount" styling
// is needed to convey that (spec section 17: status conveyed by text, not
// color alone).
export function AdjustmentRow({ adjustment, onPress }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={styles.main}>
        <AppText variant="body" numberOfLines={1}>
          {adjustment.label}
        </AppText>
        <AppText variant="caption" color="textSecondary">
          {ALLOCATION_METHOD_LABELS[adjustment.allocationMethod]}
        </AppText>
      </View>
      <AppText variant="subheading">{formatCentavos(adjustment.amountCentavos)}</AppText>
    </Pressable>
  );
}

function createStyles(colors: ColorTokens) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.md,
      padding: spacing.md,
      borderRadius: radius.md,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    pressed: {
      backgroundColor: colors.surfaceMuted,
    },
    main: {
      flex: 1,
      gap: 2,
    },
  });
}
