import { memo, useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { AvatarStack } from '@/components/ui/InitialsAvatar';
import { IconButton } from '@/components/ui/IconButton';
import { ReceiptTornEdge } from '@/components/ui/ReceiptTornEdge';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { copy } from '@/constants/copy';
import { formatBillListDate } from '@/lib/date';
import { formatCentavos } from '@/lib/money';
import type { ColorTokens } from '@/theme/tokens';
import { radius, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

import type { Bill, BillWithParticipantCount } from '../../db/repositories/bills.repository';

type Props = {
  entry: BillWithParticipantCount;
  // Participant display names for this bill's avatar stack — fetched by the
  // caller (home screen / trip hub) from participantsRepository, never
  // derived here (spec section 7: components render what they're given).
  // Empty when the bill has no participants yet (a fresh draft).
  participantNames: string[];
  onPress: (bill: Bill) => void;
  // Spec 13.2's per-row overflow actions (Edit bill/Share summary/Delete
  // bill) — kept as a single trigger prop rather than three separate
  // onEdit/onShare/onDelete props, since this component only ever opens the
  // overflow sheet; the caller (home screen) owns what the sheet actually does.
  onOverflowPress: (bill: Bill) => void;
};

// Memoized (RN perf rule): this row renders inside a FlatList and its own
// props (entry, participantNames, the two stable callbacks below) rarely
// change between renders of the list itself.
export const BillListItem = memo(function BillListItem({
  entry,
  participantNames,
  onPress,
  onOverflowPress,
}: Props) {
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
          onPress={() => onPress(bill)}
          accessibilityRole="button"
          style={({ pressed }) => [styles.main, pressed && styles.pressed]}
        >
          {/* Decorative thumbnail-in-a-circle (reference row shape) — the
              row's own title text already names the bill, so this glyph is
              hidden from screen readers rather than announced on its own. */}
          <View
            style={styles.thumbnail}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <AppText variant="subheading">🧾</AppText>
          </View>

          <View style={styles.mainText}>
            <AppText variant="subheading" numberOfLines={1}>
              {title}
            </AppText>
            <View style={styles.metaRow}>
              <AppText variant="caption" color="textSecondary">
                {formatBillListDate(bill.updatedAt)}
              </AppText>
              {participantCount > 0 ? (
                <AvatarStack names={participantNames} size={18} max={3} />
              ) : null}
            </View>
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
          onPress={() => onOverflowPress(bill)}
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
});

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
      gap: spacing.md,
      padding: spacing.md,
    },
    pressed: {
      backgroundColor: colors.surfaceMuted,
    },
    thumbnail: {
      width: 40,
      height: 40,
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceMuted,
      borderWidth: 1,
      borderColor: colors.border,
    },
    mainText: {
      flex: 1,
      gap: 2,
    },
    metaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
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
