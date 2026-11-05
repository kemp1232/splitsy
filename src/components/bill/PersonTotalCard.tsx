import Feather from '@expo/vector-icons/Feather';
import { memo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { InitialsAvatar } from '@/components/ui/InitialsAvatar';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { copy } from '@/constants/copy';
import type {
  ParticipantAdjustmentShareDisplay,
  ParticipantItemShareDisplay,
} from '@/features/summary/buildParticipantShareDisplay';
import { computeGetsBackCentavos } from '@/features/summary/computeGetsBackCentavos';
import { formatCentavos, formatCentavosForSpeech } from '@/lib/money';
import { spacing, touchTarget } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

type Props = {
  name: string;
  finalTotalCentavos: number;
  // Already filtered to nonzero shares and matched to display names/labels
  // (src/features/summary/buildParticipantShareDisplay.ts) — this component
  // only ever renders what it's given, never re-derives it from raw ids.
  itemShares: ParticipantItemShareDisplay[];
  adjustmentShares: ParticipantAdjustmentShareDisplay[];
  // Undefined when the bill has no contribution data worth showing yet (the
  // Payments screen is skippable — see summary.tsx's own hasAnyContribution
  // gate); the caller only ever passes this once at least one participant has
  // recorded a nonzero contribution, so a bill that never touched Payments
  // renders exactly as it did before this bar existed.
  paidCentavos?: number;
};

// Spec section 16's suggested PersonTotalCard, one per participant on the
// summary screen (spec F-016): collapsed, it shows just "{name} owes" and
// their final total; expanded, it breaks that total down into their
// itemized item and adjustment shares (spec 13.18). Expand/collapse is a
// simple local boolean — there is no state to coordinate across cards, and
// letting more than one stay open at once (rather than an accordion that
// force-closes the others) is both simpler to implement and more useful for
// comparing two people's breakdowns side by side.
// Memoized (RN perf rule): one of these renders per participant on the
// Summary/saved-bill-detail screens, and this card's own expand/collapse
// state is entirely local — it shouldn't re-render just because an unrelated
// sibling card toggled or a parent-level toast/error state changed.
// Borderless row: the Summary/saved-bill screens wrap these in one
// GroupedCard with hairline separators between people.
export const PersonTotalCard = memo(function PersonTotalCard({
  name,
  finalTotalCentavos,
  itemShares,
  adjustmentShares,
  paidCentavos,
}: Props) {
  const { colors } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const hasPaymentInfo = paidCentavos !== undefined;
  const fraction = hasPaymentInfo && finalTotalCentavos > 0 ? paidCentavos / finalTotalCentavos : 0;
  const isPaidInFull = hasPaymentInfo && paidCentavos >= finalTotalCentavos;
  // Paid more than their own share: the header reads "Paid ₱X · gets back
  // ₱Y" instead of "owes ₱share", and the progress bar is dropped.
  const getsBackCentavos = computeGetsBackCentavos(paidCentavos, finalTotalCentavos);

  return (
    <View style={styles.container}>
      <Pressable
        onPress={() => setExpanded((current) => !current)}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        style={styles.header}
      >
        {/* Reference row shape: avatar + name + trailing amount, with the
            progress bar directly underneath (rendered just below this
            Pressable) — InitialsAvatar substitutes for the reference's photo
            avatar (see that component's own header note). */}
        <InitialsAvatar name={name} size={36} />
        <View style={styles.headerText}>
          <AppText variant="subheading" style={styles.uniformText}>
            {getsBackCentavos !== null
              ? name
              : copy.summary.participantOwes.replace('{name}', name)}
          </AppText>
          {/* accessibilityLabel is the spoken form (spec section 17's "520
              pesos and 25 centavos" example) — distinct from the visible
              formatCentavos text, which a screen reader would otherwise read
              out character-by-character (e.g. "peso sign five two zero"). */}
          {getsBackCentavos !== null ? (
            <AppText
              variant="subheading"
              color="success"
              style={styles.uniformText}
              accessibilityLabel={buildPaidAndGetsBack(
                paidCentavos ?? 0,
                getsBackCentavos,
                formatCentavosForSpeech,
              )}
            >
              {buildPaidAndGetsBack(paidCentavos ?? 0, getsBackCentavos, formatCentavos)}
            </AppText>
          ) : (
            <AppText
              variant="amount"
              style={styles.totalAmount}
              accessibilityLabel={formatCentavosForSpeech(finalTotalCentavos)}
            >
              {formatCentavos(finalTotalCentavos)}
            </AppText>
          )}
        </View>
        {/* Decorative only, and hidden from screen readers — the row's own
            visible text already fully describes what pressing it does (spec
            section 17's icon-only-control label rule doesn't apply here,
            since this row isn't icon-only). accessibilityState.expanded above
            is what actually announces the expand/collapse state. */}
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Feather
            name={expanded ? 'chevron-down' : 'chevron-right'}
            size={20}
            color={colors.textSecondary}
          />
        </View>
      </Pressable>

      {hasPaymentInfo && getsBackCentavos === null ? (
        <ProgressBar
          fraction={fraction}
          tone={isPaidInFull ? 'success' : 'primary'}
          label={
            isPaidInFull
              ? copy.payments.progressPaidInFull
              : copy.payments.progressPartial
                  .replace('{paid}', formatCentavos(paidCentavos))
                  .replace('{total}', formatCentavos(finalTotalCentavos))
          }
        />
      ) : null}

      {expanded ? (
        <View style={styles.details}>
          {itemShares.length > 0 ? (
            <View style={styles.section}>
              <AppText variant="caption" color="textSecondary">
                {copy.summary.itemsSubheading}
              </AppText>
              {itemShares.map((share) => (
                <View key={share.lineItemId} style={styles.row}>
                  <AppText
                    variant="body"
                    numberOfLines={1}
                    style={[styles.rowLabel, styles.uniformText]}
                  >
                    {share.shared ? `${share.name} (${copy.summary.sharedSuffix})` : share.name}
                  </AppText>
                  <AppText variant="body" style={styles.uniformText}>
                    {formatCentavos(share.amountCentavos)}
                  </AppText>
                </View>
              ))}
            </View>
          ) : null}

          {adjustmentShares.length > 0 ? (
            <View style={styles.section}>
              <AppText variant="caption" color="textSecondary">
                {copy.summary.adjustmentsSubheading}
              </AppText>
              {adjustmentShares.map((share) => (
                <View key={share.adjustmentId} style={styles.row}>
                  <AppText
                    variant="body"
                    numberOfLines={1}
                    style={[styles.rowLabel, styles.uniformText]}
                  >
                    {share.label}
                  </AppText>
                  <AppText variant="body" style={styles.uniformText}>
                    {formatCentavos(share.amountCentavos)}
                  </AppText>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
});

function buildPaidAndGetsBack(
  paidCentavos: number,
  getsBackCentavos: number,
  formatMoney: (centavos: number) => string,
): string {
  return copy.summary.participantPaidAndGetsBack
    .replace('{paid}', () => formatMoney(paidCentavos))
    .replace('{refund}', () => formatMoney(getsBackCentavos));
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: touchTarget.preferred,
    gap: spacing.md,
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  // Indented past the 36px avatar so the breakdown lines up under the
  // name rather than the avatar.
  details: {
    gap: spacing.md,
    paddingLeft: 36 + spacing.md,
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
  },
  // Matches the app's usual uniform row size (see e.g. PaymentContributionRow.tsx/
  // BillListItem.tsx's own uniform text) — the header name text and the
  // expanded item/adjustment breakdown rows all read smaller than their
  // default variant size (subheading 17/22, body 15/21).
  uniformText: {
    fontSize: 14,
    lineHeight: 19,
  },
  // Smaller than the `amount` variant's own default (28/34) — the user found
  // it too large next to the now-smaller name text beside it. Font weight and
  // tabular-nums still come from the variant itself.
  totalAmount: {
    fontSize: 20,
    lineHeight: 25,
  },
});
