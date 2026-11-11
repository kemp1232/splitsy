import Feather from '@expo/vector-icons/Feather';
import { memo, useMemo } from 'react';
import { Platform, Pressable, StyleSheet, View, type TextStyle } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { IconButton } from '@/components/ui/IconButton';
import { copy } from '@/constants/copy';
import type { LineItem } from '@/db/repositories/lineItems.repository';
import { formatCentavos, formatCentavosForSpeech } from '@/lib/money';
import type { ColorTokens } from '@/theme/tokens';
import { radius, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

type Props = {
  item: LineItem;
  // Both take the item itself (rather than a pre-bound closure) so the
  // parent list can hand down one stable callback for every row, letting
  // React.memo below actually skip re-rendering unchanged rows.
  onEdit: (item: LineItem) => void;
  onDelete: (item: LineItem) => void;
};

// Compact receipt-review row: name, "×N" pill (only when quantity > 1),
// right-aligned line total, then edit/delete icon buttons. The container is a
// plain View rather than one big Pressable on purpose — an accessible parent
// Pressable would swallow its children for VoiceOver/TalkBack, making the
// edit/delete icon buttons unreachable. Instead the name/qty/amount area is
// its own Pressable (tap still opens the editor), with the icon buttons as
// its siblings.
function LineItemRowComponent({ item, onEdit, onDelete }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const showQuantity = item.quantity > 1;
  const editLabel = copy.receiptReview.editItemAccessibilityLabel.replace(
    '{name}',
    () => item.name,
  );
  const deleteLabel = copy.receiptReview.deleteItemAccessibilityLabel.replace(
    '{name}',
    () => item.name,
  );
  const rowLabel = [
    item.name,
    showQuantity
      ? copy.receiptReview.itemQuantityAccessibilityLabel.replace('{quantity}', () =>
          String(item.quantity),
        )
      : null,
    formatCentavosForSpeech(item.lineTotalCentavos),
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <View style={styles.row}>
      <Pressable
        onPress={() => onEdit(item)}
        accessibilityRole="button"
        accessibilityLabel={rowLabel}
        accessibilityHint={copy.receiptReview.editItemHint}
        style={({ pressed }) => [styles.main, pressed && styles.pressed]}
      >
        <AppText variant="body" numberOfLines={2} style={[styles.name, webBreakLongWords]}>
          {item.name}
        </AppText>
        {showQuantity ? (
          <View style={styles.quantityPill}>
            <AppText variant="caption" color="textSecondary" style={styles.quantityText}>
              {copy.receiptReview.itemQuantityLabel.replace('{quantity}', () =>
                String(item.quantity),
              )}
            </AppText>
          </View>
        ) : null}
        <AppText variant="amount" style={styles.amount}>
          {formatCentavos(item.lineTotalCentavos)}
        </AppText>
      </Pressable>
      <IconButton
        accessibilityLabel={editLabel}
        onPress={() => onEdit(item)}
        icon={<Feather name="edit-2" size={18} color={colors.textSecondary} />}
      />
      <IconButton
        accessibilityLabel={deleteLabel}
        onPress={() => onDelete(item)}
        icon={<Feather name="trash-2" size={18} color={colors.danger} />}
      />
    </View>
  );
}

export const LineItemRow = memo(LineItemRowComponent);

// Web only: a long unbroken name (no spaces) would otherwise run past its
// column into the quantity/amount instead of wrapping — native already breaks
// such words at the column edge. `wordBreak` isn't in RN's TextStyle type, but
// react-native-web passes it straight through to the element's CSS.
const webBreakLongWords =
  Platform.OS === 'web' ? ({ wordBreak: 'break-word' } as unknown as TextStyle) : null;

function createStyles(colors: ColorTokens) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 48,
      paddingRight: spacing.xs,
      borderRadius: radius.md,
      borderCurve: 'continuous',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
    },
    main: {
      flex: 1,
      // Lets the row shrink below its content's width (web flex items
      // default to min-width: auto), so a long name wraps instead of
      // pushing the amount and buttons out of place.
      minWidth: 0,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      alignSelf: 'stretch',
      paddingVertical: spacing.sm,
      paddingLeft: spacing.md,
      paddingRight: spacing.xs,
    },
    pressed: {
      backgroundColor: colors.surfaceMuted,
    },
    // Matches receipt-review.tsx's own uniform text size (see that screen's
    // `uniformText` style).
    name: {
      flexShrink: 1,
      flexGrow: 1,
      minWidth: 0,
      fontSize: 14,
      lineHeight: 19,
    },
    quantityPill: {
      flexShrink: 0,
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
      borderRadius: radius.pill,
      borderCurve: 'continuous',
      backgroundColor: colors.surfaceMuted,
    },
    quantityText: {
      fontSize: 13,
      lineHeight: 17,
    },
    amount: {
      flexShrink: 0,
      textAlign: 'right',
      fontSize: 14,
      lineHeight: 19,
    },
  });
}
