import { StyleSheet, View } from 'react-native';

import { AppButton } from '@/components/ui/AppButton';
import { AppText } from '@/components/ui/AppText';
import { SectionCard } from '@/components/ui/SectionCard';
import { copy } from '@/constants/copy';
import { formatCentavos, formatCentavosForSpeech } from '@/lib/money';
import { spacing } from '@/theme/tokens';

type Props = {
  itemSubtotalCentavos: number;
  adjustmentsTotalCentavos: number;
  computedTotalCentavos: number;
  // null when the bill has no detected/entered receipt total to reconcile
  // against (spec 10.8) — the receipt-total row and match/mismatch message
  // are only shown when this is present.
  detectedReceiptTotalCentavos: number | null;
  // `reconcileBillTotals`'s already-signed difference (detected - computed);
  // only read when `matches` is false.
  differenceCentavos: number | null;
  matches: boolean;
  // Only rendered when a mismatch exists (`!matches`) — omit both when there
  // is nothing to resolve.
  onAddDifference?: () => void;
  onReviewItems?: () => void;
};

// Spec 13.15 + F-015's reconciliation display, folding adjustments into the
// same item/receipt totals block receipt-review.tsx already shows inline for
// items alone. All inputs are already-computed centavo totals from
// calculateSplit/reconcileBillTotals (src/features/splitting/) — this
// component only ever formats them for display, never recomputes money itself
// (spec 10.1).
export function ReconciliationCard({
  itemSubtotalCentavos,
  adjustmentsTotalCentavos,
  computedTotalCentavos,
  detectedReceiptTotalCentavos,
  differenceCentavos,
  matches,
  onAddDifference,
  onReviewItems,
}: Props) {
  const hasDetectedTotal = detectedReceiptTotalCentavos !== null;

  return (
    <SectionCard torn>
      <View style={styles.row}>
        <AppText color="textSecondary">{copy.adjustments.itemSubtotalLabel}</AppText>
        <AppText>{formatCentavos(itemSubtotalCentavos)}</AppText>
      </View>
      <View style={styles.row}>
        <AppText color="textSecondary">{copy.adjustments.adjustmentsTotalLabel}</AppText>
        <AppText>{formatCentavos(adjustmentsTotalCentavos)}</AppText>
      </View>
      <View style={styles.row}>
        <AppText variant="subheading">{copy.adjustments.computedTotalLabel}</AppText>
        {/* accessibilityLabel is the spoken form (spec section 17's "520
            pesos and 25 centavos" example), distinct from the visible
            formatCentavos text. */}
        <AppText
          variant="subheading"
          accessibilityLabel={formatCentavosForSpeech(computedTotalCentavos)}
        >
          {formatCentavos(computedTotalCentavos)}
        </AppText>
      </View>

      {hasDetectedTotal ? (
        <>
          <View style={styles.row}>
            <AppText color="textSecondary">{copy.adjustments.receiptTotalLabel}</AppText>
            <AppText>{formatCentavos(detectedReceiptTotalCentavos)}</AppText>
          </View>

          {/* Status is conveyed by the message text itself, not only the
              success/warning color (spec section 17). */}
          <AppText color={matches ? 'success' : 'warning'}>
            {matches
              ? copy.adjustments.matchSuccess
              : copy.adjustments.differenceWarning.replace(
                  '{difference}',
                  formatCentavos(Math.abs(differenceCentavos ?? 0)),
                )}
          </AppText>

          {!matches ? (
            <View style={styles.actions}>
              {onAddDifference ? (
                <AppButton
                  variant="secondary"
                  label={copy.adjustments.addDifferenceAction}
                  onPress={onAddDifference}
                />
              ) : null}
              {onReviewItems ? (
                <AppButton
                  variant="text"
                  label={copy.adjustments.reviewItemsAction}
                  onPress={onReviewItems}
                />
              ) : null}
            </View>
          ) : null}
        </>
      ) : null}
    </SectionCard>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  actions: {
    gap: spacing.sm,
  },
});
