import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { copy } from '@/constants/copy';
import type { LineItem } from '@/db/repositories/lineItems.repository';
import { formatCentavos } from '@/lib/money';
import type { ColorTokens } from '@/theme/tokens';
import { radius, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

type Props = {
  item: LineItem;
  onPress: () => void;
};

export function LineItemRow({ item, onPress }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={styles.main}>
        <AppText variant="body" numberOfLines={1} style={styles.smallText}>
          {item.name}
        </AppText>
        {item.quantity > 1 ? (
          <AppText variant="caption" color="textSecondary">
            {copy.receiptReview.itemQuantityLabel.replace('{quantity}', String(item.quantity))}
          </AppText>
        ) : null}
      </View>
      <AppText variant="amount" style={styles.smallText}>
        {formatCentavos(item.lineTotalCentavos)}
      </AppText>
    </Pressable>
  );
}

function createStyles(colors: ColorTokens) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      padding: spacing.md,
      borderRadius: radius.md,
      borderCurve: 'continuous',
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
    // Matches receipt-review.tsx's own uniform text size (see that screen's
    // `uniformText` style) — title/price no longer stand out by size, only
    // by the `variant` each already carries (body's regular weight vs
    // amount's bold weight + tabular-nums digit alignment).
    smallText: {
      fontSize: 14,
      lineHeight: 19,
    },
  });
}
