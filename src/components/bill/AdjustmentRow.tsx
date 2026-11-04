import Feather from '@expo/vector-icons/Feather';
import type { ComponentProps } from 'react';
import { memo, useCallback, useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { copy } from '@/constants/copy';
import type { Adjustment } from '@/db/repositories/adjustments.repository';
import { formatCentavos, formatCentavosForSpeech } from '@/lib/money';
import { tint } from '@/theme/tint';
import type { ColorTokens } from '@/theme/tokens';
import { radius, spacing, touchTarget } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

// Short allocation-method label shown under an adjustment's name, matching
// the same three strings the allocation picker in AdjustmentEditorSheet uses
// (spec 13.15).
const ALLOCATION_METHOD_LABELS: Record<Adjustment['allocationMethod'], string> = {
  PROPORTIONAL: copy.adjustments.allocationProportional,
  EQUAL: copy.adjustments.allocationEqual,
  CUSTOM: copy.adjustments.allocationCustom,
};

// Decorative leading glyph per adjustment type — the label text beside it
// already names the adjustment, so this only aids scanning.
const TYPE_ICONS: Record<Adjustment['type'], ComponentProps<typeof Feather>['name']> = {
  TAX: 'percent',
  SERVICE_CHARGE: 'bell',
  TIP: 'heart',
  DISCOUNT: 'tag',
  OTHER: 'plus-circle',
};

type Props = {
  adjustment: Adjustment;
  // Called with this row's own adjustment, so the screen can pass one stable
  // callback to every row instead of a new closure per renderItem call.
  onPress: (adjustment: Adjustment) => void;
};

// Mirrors LineItemRow's tap-to-edit row shape (spec 13.15's list of
// adjustments) — amountCentavos is already signed (negative for discounts),
// so formatCentavos renders its own minus sign; no separate "discount" styling
// is needed to convey that (spec section 17: status conveyed by text, not
// color alone).
// Memoized (RN list-performance rule): rendered as a FlatList row on the
// Adjustments screen. Borderless — the screen's GroupedCard draws the card
// and the hairline separators between rows.
export const AdjustmentRow = memo(function AdjustmentRow({ adjustment, onPress }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const handlePress = useCallback(() => onPress(adjustment), [onPress, adjustment]);
  const allocationLabel = ALLOCATION_METHOD_LABELS[adjustment.allocationMethod];
  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="button"
      // Explicit label so the icon-font glyphs (type tile, chevron) never leak
      // into the row's spoken text; the amount uses the spoken form (spec
      // section 17).
      accessibilityLabel={`${adjustment.label}, ${allocationLabel}, ${formatCentavosForSpeech(adjustment.amountCentavos)}`}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View
        style={styles.iconTile}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Feather name={TYPE_ICONS[adjustment.type]} size={18} color={colors.primary} />
      </View>
      <View style={styles.main}>
        <AppText variant="body" numberOfLines={1} style={styles.uniformText}>
          {adjustment.label}
        </AppText>
        <AppText variant="caption" color="textSecondary">
          {allocationLabel}
        </AppText>
      </View>
      <AppText variant="subheading" style={styles.uniformText}>
        {formatCentavos(adjustment.amountCentavos)}
      </AppText>
      <Feather
        name="chevron-right"
        size={20}
        color={colors.textSecondary}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
    </Pressable>
  );
});

function createStyles(colors: ColorTokens) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      minHeight: touchTarget.preferred,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
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
    pressed: {
      backgroundColor: colors.surfaceMuted,
    },
    main: {
      flex: 1,
      gap: 2,
    },
    uniformText: {
      fontSize: 14,
      lineHeight: 19,
    },
  });
}
