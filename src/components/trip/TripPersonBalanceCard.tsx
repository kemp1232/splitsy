import { memo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { buildPaidAndGetsBack } from '@/components/bill/PersonTotalCard';
import { AppButton } from '@/components/ui/AppButton';
import { AppText } from '@/components/ui/AppText';
import { Divider } from '@/components/ui/Divider';
import { InitialsAvatar } from '@/components/ui/InitialsAvatar';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { SectionCard } from '@/components/ui/SectionCard';
import { copy } from '@/constants/copy';
import { computeGetsBackCentavos } from '@/features/summary/computeGetsBackCentavos';
import type { TripAdjustmentShareDisplay } from '@/features/trips/buildTripParticipantAdjustmentShareDisplay';
import type { TripItemShareDisplay } from '@/features/trips/buildTripParticipantItemShareDisplay';
import { formatCentavos, formatCentavosForSpeech } from '@/lib/money';
import { spacing } from '@/theme/tokens';

type TripPersonBillItems = {
  billId: string;
  billLabel: string;
  items: TripItemShareDisplay[];
  // This person's share of each fee/tax/discount on the bill, after the items.
  adjustments: TripAdjustmentShareDisplay[];
};

type Props = {
  name: string;
  fairShareCentavos: number;
  contributedCentavos: number;
  // Every bill this person has a nonzero item or fee/discount share in, in
  // bill order — the expanded section's whole reason to exist. Empty when
  // there's nothing to show, in which case no "View breakdown" button
  // renders at all rather than expanding into an empty section.
  billItems: TripPersonBillItems[];
};

// The trip-wide counterpart to PersonTotalCard's collapsed header +
// payment-progress bar (bill/[billId]/summary.tsx), reused for one identity's
// combined balance across every COMPLETED bill in a trip
// (computeTripSettlement.ts). Unlike PersonTotalCard, expanding this card
// doesn't reveal one bill's breakdown — it reveals every item this person is
// assigned to across every bill in the trip, grouped per bill (a trip spans
// multiple receipts, so an ungrouped flat list could collide two different
// restaurants' same-named items), each labeled with who else shared it by
// name (buildTripParticipantItemShareDisplay), followed by their share of
// that bill's fees/tax/discounts (buildTripParticipantAdjustmentShareDisplay)
// so the lines add up to what they owe, ending in the amount they've
// actually paid. This is a deliberate, explicit
// "expand" action (a button under the paid section) rather than a tappable
// header the way PersonTotalCard does it, since the user asked for this to
// be obvious rather than discovered by tapping the row.
// Memoized (RN perf rule): one of these renders per trip identity on the
// trip settlement screen, and its own expand/collapse state is entirely
// local — it shouldn't re-render just because a sibling card toggled or a
// parent-level toast/error state changed.
export const TripPersonBalanceCard = memo(function TripPersonBalanceCard({
  name,
  fairShareCentavos,
  contributedCentavos,
  billItems,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const fraction = fairShareCentavos > 0 ? contributedCentavos / fairShareCentavos : 0;
  const isPaidInFull = contributedCentavos >= fairShareCentavos;
  const hasItems = billItems.some((bill) => bill.items.length > 0 || bill.adjustments.length > 0);
  // Paid more than their share: "Paid X · gets back Y", not "{name} owes",
  // same treatment as PersonTotalCard on a single bill's summary.
  const getsBackCentavos = computeGetsBackCentavos(contributedCentavos, fairShareCentavos);

  return (
    <SectionCard>
      {/* Reference row shape: avatar + name + trailing amount, with the
          progress bar directly underneath — InitialsAvatar substitutes for
          the reference's photo avatar (see that component's own header note). */}
      <View style={styles.header}>
        <InitialsAvatar name={name} size={36} />
        <View style={styles.headerText}>
          <AppText variant="subheading">
            {getsBackCentavos !== null
              ? name
              : copy.summary.participantOwes.replace('{name}', () => name)}
          </AppText>
          {getsBackCentavos !== null ? (
            <AppText
              variant="subheading"
              color="success"
              accessibilityLabel={buildPaidAndGetsBack(
                contributedCentavos,
                getsBackCentavos,
                formatCentavosForSpeech,
              )}
            >
              {buildPaidAndGetsBack(contributedCentavos, getsBackCentavos, formatCentavos)}
            </AppText>
          ) : null}
        </View>
        {getsBackCentavos !== null ? null : (
          <AppText variant="amount" accessibilityLabel={formatCentavosForSpeech(fairShareCentavos)}>
            {formatCentavos(fairShareCentavos)}
          </AppText>
        )}
      </View>
      <ProgressBar
        fraction={fraction}
        tone={isPaidInFull ? 'success' : 'primary'}
        label={
          isPaidInFull
            ? copy.payments.progressPaidInFull
            : copy.payments.progressPartial
                .replace('{paid}', formatCentavos(contributedCentavos))
                .replace('{total}', formatCentavos(fairShareCentavos))
        }
      />

      {hasItems ? (
        <AppButton
          variant="text"
          label={
            expanded ? copy.tripSettlement.hideItemsAction : copy.tripSettlement.viewItemsAction
          }
          onPress={() => setExpanded((current) => !current)}
        />
      ) : null}

      {expanded && hasItems ? (
        <View style={styles.details}>
          {billItems.map((bill) =>
            bill.items.length > 0 || bill.adjustments.length > 0 ? (
              <View key={bill.billId} style={styles.section}>
                <AppText variant="caption" color="textSecondary">
                  {bill.billLabel}
                </AppText>
                {bill.items.map((item) => (
                  <View key={item.lineItemId} style={styles.row}>
                    <AppText variant="body" numberOfLines={1} style={styles.rowLabel}>
                      {item.sharedWithNames.length > 0
                        ? `${item.name} (${copy.tripSettlement.itemSharedWithSuffix.replace(
                            '{names}',
                            item.sharedWithNames.join(', '),
                          )})`
                        : item.name}
                    </AppText>
                    <AppText variant="body">{formatCentavos(item.amountCentavos)}</AppText>
                  </View>
                ))}
                {bill.adjustments.map((adjustment) => (
                  <View key={adjustment.adjustmentId} style={styles.row}>
                    <AppText
                      variant="body"
                      color="textSecondary"
                      numberOfLines={1}
                      style={styles.rowLabel}
                    >
                      {adjustment.label}
                    </AppText>
                    <AppText variant="body" color="textSecondary">
                      {formatCentavos(adjustment.amountCentavos)}
                    </AppText>
                  </View>
                ))}
              </View>
            ) : null,
          )}

          <Divider />

          <View style={styles.row}>
            <AppText variant="subheading">{copy.tripSettlement.paidLabel}</AppText>
            <AppText
              variant="subheading"
              accessibilityLabel={formatCentavosForSpeech(contributedCentavos)}
            >
              {formatCentavos(contributedCentavos)}
            </AppText>
          </View>
        </View>
      ) : null}
    </SectionCard>
  );
});

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  headerText: {
    flex: 1,
  },
  details: {
    gap: spacing.md,
  },
  section: {
    gap: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  rowLabel: {
    flex: 1,
    minWidth: 0,
  },
});
