import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { IconButton } from '@/components/ui/IconButton';
import { ReceiptTornEdge } from '@/components/ui/ReceiptTornEdge';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { copy } from '@/constants/copy';
import { formatBillListDate } from '@/lib/date';
import { formatCentavos } from '@/lib/money';
import type { ColorTokens } from '@/theme/tokens';
import { radius, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

import type { BillWithParticipantCount } from '../../db/repositories/bills.repository';

type Props = {
  entry: BillWithParticipantCount;
  onPress: () => void;
  // Spec 13.2's per-row overflow actions (Edit bill/Share summary/Delete
  // bill) — kept as a single trigger prop rather than three separate
  // onEdit/onShare/onDelete props, since this component only ever opens the
  // overflow sheet; the caller (home screen) owns what the sheet actually does.
  onOverflowPress: () => void;
};

export function BillListItem({ entry, onPress, onOverflowPress }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { bill, participantCount } = entry;
  const title = bill.merchantName ?? bill.title ?? copy.home.unknownMerchantTitle;
  const total =
    bill.detectedReceiptTotalCentavos != null
      ? formatCentavos(bill.detectedReceiptTotalCentavos)
      : null;

  return (
    <View>
      <View style={styles.row}>
        {/* The row's primary tap target (resume/view) is its own Pressable,
            separate from the overflow IconButton below rather than one
            Pressable wrapping both — nesting a touchable inside another
            touchable is an accessibility/hit-testing hazard (which one
            receives the tap becomes ambiguous), so this mirrors the
            established sibling-Pressables row shape already used by
            participants.tsx's own row + trailing IconButton. */}
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          style={({ pressed }) => [styles.main, pressed && styles.pressed]}
        >
          <View style={styles.mainText}>
            <AppText variant="subheading" numberOfLines={1}>
              {title}
            </AppText>
            <AppText variant="caption" color="textSecondary">
              {formatBillListDate(bill.updatedAt)}
              {participantCount > 0 ? ` · ${participantCount} people` : ''}
            </AppText>
          </View>
          <View style={styles.trailing}>
            {total ? (
              <AppText variant="amount" style={styles.totalText}>
                {total}
              </AppText>
            ) : null}
            <StatusBadge
              label={bill.status === 'COMPLETED' ? copy.home.completedBadge : copy.home.draftBadge}
              tone={bill.status === 'COMPLETED' ? 'success' : 'neutral'}
            />
            {/* Spec 13.2 defines both `resumeAction` ("Continue") and
                `openAction` ("View split") but leaves their placement to
                implementation. Surfaced here as a plain caption label rather
                than a second nested Pressable/button, so this Pressable stays
                a single tap target while still telling the user what tapping
                it actually does, instead of leaving that to the status badge
                alone. */}
            <AppText variant="caption" color="primary">
              {bill.status === 'COMPLETED' ? copy.home.openAction : copy.home.resumeAction}
            </AppText>
          </View>
        </Pressable>

        {/* Icon-only control — accessibilityLabel is required (spec section 17). */}
        <IconButton
          accessibilityLabel={copy.home.overflowAccessibilityLabel}
          onPress={onOverflowPress}
          icon={
            <AppText variant="subheading" color="textSecondary">
              ⋮
            </AppText>
          }
        />
      </View>
      {/* Signature torn-receipt-edge treatment (theme direction: applied
          sparingly to receipt/settlement surfaces only) — this row is the
          list's own stand-in for a physical receipt. */}
      <ReceiptTornEdge color={colors.surface} borderColor={colors.border} height={8} teeth={20} />
    </View>
  );
}

function createStyles(colors: ColorTokens) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      paddingVertical: spacing.xs,
      paddingRight: spacing.sm,
      borderTopLeftRadius: radius.md,
      borderTopRightRadius: radius.md,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderBottomWidth: 0,
      borderColor: colors.border,
    },
    main: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.md,
      padding: spacing.md,
    },
    pressed: {
      backgroundColor: colors.surfaceMuted,
    },
    mainText: {
      flex: 1,
      gap: 2,
    },
    trailing: {
      alignItems: 'flex-end',
      gap: spacing.xs,
    },
    totalText: {
      fontSize: 17,
      lineHeight: 22,
    },
  });
}
