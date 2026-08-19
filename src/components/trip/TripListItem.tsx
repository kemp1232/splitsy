import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { ReceiptTornEdge } from '@/components/ui/ReceiptTornEdge';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { copy } from '@/constants/copy';
import type { TripWithBillCount } from '@/db/repositories/trips.repository';
import { formatBillListDate } from '@/lib/date';
import { formatCentavos } from '@/lib/money';
import type { ColorTokens } from '@/theme/tokens';
import { radius, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

type Props = {
  entry: TripWithBillCount;
  // Precomputed by the caller (home screen) by summing every COMPLETED bill
  // in this trip — this component only ever renders a number it's handed,
  // never queries the database itself (spec section 7: screens/hooks own
  // that, not components). Zero when the trip has no completed bills yet.
  totalCentavos: number;
  onPress: () => void;
};

// The Trip feature's home-list counterpart to BillListItem (see the
// 2026-08-18 spec Amendment and PLAN.md's "Post-MVP feature: Trips" entry) —
// deliberately mirrors that component's row shape (title, date, secondary
// count, trailing total + status badge) so a trip row reads as a sibling of a
// bill row in the same list, not a visually distinct concept. No overflow
// control here (unlike BillListItem): a trip's own destructive actions
// (Delete trip) live inside the trip hub itself, reachable via this row's one
// tap target.
export function TripListItem({ entry, totalCentavos, onPress }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { trip, billCount } = entry;
  const title = trip.name ?? copy.trip.unknownTripTitle;

  return (
    <View>
      <View style={styles.row}>
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
              {formatBillListDate(trip.updatedAt)}
              {billCount > 0
                ? ` · ${copy.trip.billCountLabel.replace('{count}', String(billCount))}`
                : ''}
            </AppText>
          </View>
          <View style={styles.trailing}>
            {totalCentavos > 0 ? (
              <AppText variant="amount" style={styles.totalText}>
                {formatCentavos(totalCentavos)}
              </AppText>
            ) : null}
            <StatusBadge
              label={trip.status === 'SETTLED' ? copy.trip.settledBadge : copy.trip.activeBadge}
              tone={trip.status === 'SETTLED' ? 'success' : 'neutral'}
            />
          </View>
        </Pressable>
      </View>
      {/* Signature torn-receipt-edge treatment, same as BillListItem — a trip
          row is still a receipt-adjacent list surface. */}
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
