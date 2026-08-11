import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { copy } from '@/constants/copy';
import type { LineItem } from '@/db/repositories/lineItems.repository';
import { formatCentavos } from '@/lib/money';
import { colors, radius, spacing } from '@/theme/tokens';

type Props = {
  item: LineItem;
  onPress: () => void;
};

export function LineItemRow({ item, onPress }: Props) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={styles.main}>
        <AppText variant="body" numberOfLines={1}>
          {item.name}
        </AppText>
        {item.quantity > 1 ? (
          <AppText variant="caption" color="textSecondary">
            {copy.receiptReview.itemQuantityLabel.replace('{quantity}', String(item.quantity))}
          </AppText>
        ) : null}
      </View>
      <AppText variant="subheading">{formatCentavos(item.lineTotalCentavos)}</AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
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
