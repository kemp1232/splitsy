import Feather from '@expo/vector-icons/Feather';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppButton } from '@/components/ui/AppButton';
import { AppText } from '@/components/ui/AppText';
import { Divider } from '@/components/ui/Divider';
import { SectionCard } from '@/components/ui/SectionCard';
import { copy } from '@/constants/copy';
import { formatCentavos, formatCentavosForSpeech } from '@/lib/money';
import { tint } from '@/theme/tint';
import type { ColorTokens } from '@/theme/tokens';
import { radius, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

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
// (spec 10.1). Styled like receipt-review.tsx's own totals card (plain, not
// torn) so the two reconciliation views read as one design.
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
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const hasDetectedTotal = detectedReceiptTotalCentavos !== null;

  return (
    <SectionCard>
      <View style={styles.row}>
        <AppText color="textSecondary" style={styles.uniformText}>
          {copy.adjustments.itemSubtotalLabel}
        </AppText>
        <AppText style={styles.uniformText}>{formatCentavos(itemSubtotalCentavos)}</AppText>
      </View>
      <View style={styles.row}>
        <AppText color="textSecondary" style={styles.uniformText}>
          {copy.adjustments.adjustmentsTotalLabel}
        </AppText>
        <AppText style={styles.uniformText}>{formatCentavos(adjustmentsTotalCentavos)}</AppText>
      </View>
      {hasDetectedTotal ? (
        <View style={styles.row}>
          <AppText color="textSecondary" style={styles.uniformText}>
            {copy.adjustments.receiptTotalLabel}
          </AppText>
          <AppText style={styles.uniformText}>
            {formatCentavos(detectedReceiptTotalCentavos)}
          </AppText>
        </View>
      ) : null}
      <Divider />
      <View style={styles.row}>
        <AppText variant="subheading">{copy.adjustments.computedTotalLabel}</AppText>
        {/* accessibilityLabel is the spoken form (spec section 17's "520
            pesos and 25 centavos" example), distinct from the visible
            formatCentavos text. */}
        <AppText
          variant="amount"
          style={styles.totalAmount}
          accessibilityLabel={formatCentavosForSpeech(computedTotalCentavos)}
        >
          {formatCentavos(computedTotalCentavos)}
        </AppText>
      </View>

      {hasDetectedTotal ? (
        <>
          {/* Status is conveyed by the message text itself, not only the
              success/warning color (spec section 17). */}
          <View style={[styles.statusRow, matches ? styles.success : styles.warning]}>
            <Feather
              name={matches ? 'check-circle' : 'alert-triangle'}
              size={18}
              color={matches ? colors.success : colors.warning}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            />
            <AppText variant="caption" style={styles.statusText}>
              {matches
                ? copy.adjustments.matchSuccess
                : copy.adjustments.differenceWarning.replace(
                    '{difference}',
                    formatCentavos(Math.abs(differenceCentavos ?? 0)),
                  )}
            </AppText>
          </View>

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

function createStyles(colors: ColorTokens) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: spacing.sm,
    },
    uniformText: {
      fontSize: 14,
      lineHeight: 19,
    },
    totalAmount: {
      fontSize: 20,
      lineHeight: 26,
    },
    statusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginTop: spacing.xs,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radius.md,
      borderCurve: 'continuous',
      borderWidth: 1,
    },
    statusText: {
      flex: 1,
    },
    success: { backgroundColor: tint(colors.success), borderColor: colors.success },
    warning: { backgroundColor: tint(colors.warning), borderColor: colors.warning },
    actions: {
      gap: spacing.sm,
    },
  });
}
