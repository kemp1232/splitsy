import Feather from '@expo/vector-icons/Feather';
import { memo, useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { FoodIconBadge } from '@/components/ui/FoodIconBadge';
import { IconButton } from '@/components/ui/IconButton';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { copy } from '@/constants/copy';
import { formatBillListDate } from '@/lib/date';
import { formatCentavos, formatCentavosForSpeech } from '@/lib/money';
import type { ColorTokens } from '@/theme/tokens';
import { radius, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

import type { Bill, BillWithParticipantCount } from '../../db/repositories/bills.repository';

// First name only, for a compact per-participant chip — "Micheal Reyes" reads
// as "Micheal", matching the reference row's own "Paid by Micheal" shorthand.
function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

// How many name chips show before collapsing into a trailing "+N" chip —
// mirrors AvatarStack's own `max` cap (InitialsAvatar.tsx), just smaller:
// chips take more horizontal room per person than an overlapping circle
// does, and this row also has to fit a date next to them on the same line.
const MAX_VISIBLE_NAME_CHIPS = 2;

type Props = {
  entry: BillWithParticipantCount;
  // Participant display names for this bill's name-chip row — fetched by the
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
  const visibleNames = participantNames.slice(0, MAX_VISIBLE_NAME_CHIPS);
  const remainingNameCount = participantNames.length - visibleNames.length;
  const isCompleted = bill.status === 'COMPLETED';
  const statusLabel = isCompleted ? copy.home.completedBadge : copy.home.draftBadge;

  return (
    // Draft vs. completed is now a border-color cue only (no visible badge/
    // label text — an explicit, deliberate simplification the user asked
    // for), which alone would fail spec section 17's "status conveyed by
    // more than color" rule for sighted users AND leave screen-reader users
    // with no status signal at all. The row's own accessibilityLabel below
    // is what keeps that information actually available — a screen reader
    // still hears the status even though it's no longer drawn as its own
    // badge — rather than silently dropping it.
    <View
      style={[
        styles.row,
        // Completed gets a lighter tint of `success` (a 40%-alpha wash, same
        // technique StatusBadge.tsx already uses for its own tone fills)
        // rather than the fully-saturated token — draft just keeps the row's
        // own plain, neutral `colors.border` (already a grayish token in
        // both themes), so it reads as "unaccented" next to completed's
        // accent rather than needing a second color of its own.
        { borderColor: isCompleted ? `${colors.success}66` : colors.border },
      ]}
    >
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
        accessibilityLabel={`${title}, ${statusLabel}${
          bill.detectedReceiptTotalCentavos != null
            ? `, ${formatCentavosForSpeech(bill.detectedReceiptTotalCentavos)}`
            : ''
        }`}
        style={({ pressed }) => [styles.main, pressed && styles.pressed]}
      >
        <FoodIconBadge id={bill.id} />

        <View style={styles.mainText}>
          <AppText variant="subheading" numberOfLines={1} style={styles.titleText}>
            {title}
          </AppText>
          <View style={styles.metaRow}>
            <AppText variant="caption" color="textSecondary">
              {formatBillListDate(bill.updatedAt)}
            </AppText>
            {participantCount > 0 ? (
              <View style={styles.chipRow}>
                {visibleNames.map((name, index) => (
                  <View key={`${name}-${index}`} style={styles.chip}>
                    <AppText variant="caption" color="textSecondary" numberOfLines={1}>
                      {firstName(name)}
                    </AppText>
                  </View>
                ))}
                {remainingNameCount > 0 ? (
                  <View style={styles.chip}>
                    <AppText variant="caption" color="textSecondary">
                      +{remainingNameCount}
                    </AppText>
                  </View>
                ) : null}
              </View>
            ) : null}
          </View>
        </View>
        <View style={styles.trailing}>
          {total ? (
            <AppText variant="amount" style={styles.totalText}>
              {total}
            </AppText>
          ) : null}
          {/* Draft only — a completed bill has nothing left to flag (the
              lighter border-color cue is enough there on its own), so the
              badge would just be noise repeating what's already obvious.
              `style` right-aligns it (StatusBadge's own default is
              `alignSelf: 'flex-start'`, which every other usage of it wants,
              but this column needs the opposite). */}
          {!isCompleted ? (
            <StatusBadge label={statusLabel} tone="neutral" style={styles.trailingBadge} />
          ) : null}
        </View>
      </Pressable>

      {/* Icon-only control — accessibilityLabel is required (spec section 17).
          Sized down from this app's other overflow triggers (still inside
          IconButton's own unchanged touchTarget.preferred hit box, so the
          tap target itself stays accessibility-compliant — only the visible
          glyph shrinks). */}
      <IconButton
        accessibilityLabel={copy.home.overflowAccessibilityLabel}
        onPress={() => onOverflowPress(bill)}
        icon={<Feather name="more-vertical" size={16} color={colors.textSecondary} />}
      />
    </View>
  );
});

function createStyles(colors: ColorTokens) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      // No gap here (was spacing.xs) and `main` below drops its own
      // right-side padding — both per the user's own request to close the
      // space between the overflow button and the total next to it.
      paddingVertical: spacing.xs,
      paddingRight: spacing.sm,
      // Fully rounded card (reference row shape) now that this row no longer
      // pairs with a ReceiptTornEdge underneath it, which needed the bottom
      // corners left square to sit flush against.
      borderRadius: radius.xl,
      borderCurve: 'continuous',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      // Clips `main`'s own pressed-state background (a plain rectangle) to
      // this row's rounded corners — without this, that rectangle's sharp
      // corners poke out past the border's curve on press.
      overflow: 'hidden',
    },
    main: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingVertical: spacing.md,
      paddingLeft: spacing.md,
    },
    pressed: {
      backgroundColor: colors.surfaceMuted,
    },
    mainText: {
      flex: 1,
      gap: 2,
    },
    // Matches the `caption` variant's own size (used by the date, name
    // chips, and StatusBadge's label below) — every text in this row now
    // reads at one uniform size, `subheading`'s bold weight is what still
    // marks this out as the title rather than a bigger font.
    titleText: {
      fontSize: 14,
      lineHeight: 19,
    },
    metaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: spacing.xs,
      marginTop: 2,
    },
    chipRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs / 2,
    },
    chip: {
      paddingHorizontal: spacing.xs,
      paddingVertical: 1,
      borderRadius: radius.pill,
      borderCurve: 'continuous',
      backgroundColor: colors.surfaceMuted,
      borderWidth: 1,
      borderColor: colors.border,
    },
    trailing: {
      alignItems: 'flex-end',
      gap: spacing.xs,
    },
    trailingBadge: {
      alignSelf: 'flex-end',
    },
    // Matches the `caption` variant's own size, same as titleText above —
    // the `amount` variant's tabular-nums digit alignment is the one thing
    // still worth keeping here even at this size.
    totalText: {
      fontSize: 14,
      lineHeight: 19,
    },
  });
}
