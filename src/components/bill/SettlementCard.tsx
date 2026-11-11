import Feather from '@expo/vector-icons/Feather';
import { Fragment, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { GroupedCard, GroupedSeparator } from '@/components/ui/GroupedSection';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { copy } from '@/constants/copy';
import type { SettlementTransaction } from '@/features/splitting/settlement.types';
import { formatCentavos, formatCentavosForSpeech } from '@/lib/money';
import { tint } from '@/theme/tint';
import type { ColorTokens } from '@/theme/tokens';
import { radius, spacing, touchTarget } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

type Props = {
  transactions: SettlementTransaction[];
  // `computeSettlement`'s own signed difference: positive when the bill isn't
  // fully covered by contributions yet, negative when more was contributed
  // than the bill required, zero when every centavo is accounted for.
  unaccountedCentavos: number;
  nameByParticipantId: Map<string, string>;
  // The bill's own computed total (already available at every call site via
  // splitResult.computedTotalCentavos) — only used to draw the
  // collected-vs-total progress bar; omit it and the bar is skipped entirely
  // rather than rendered against a guessed total.
  totalCentavos?: number;
};

// Post-MVP scope expansion (see settlement.ts's header comment) — the
// summary and saved-bill-detail screens' "who owes whom" display, built from
// computeSettlement's output. Rendered once per screen, alongside (not in
// place of) the existing per-participant PersonTotalCard breakdown. Also
// rendered by trip/[tripId]/settlement.tsx, so its props stay generic over
// whose ids it shows. Grouped-card styling matches the redesigned bill
// screens (participants.tsx's People card); the torn edge was dropped with it.
export function SettlementCard({
  transactions,
  unaccountedCentavos,
  nameByParticipantId,
  totalCentavos,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const allSettled = transactions.length === 0 && unaccountedCentavos === 0;
  const collectedCentavos =
    totalCentavos !== undefined ? totalCentavos - unaccountedCentavos : null;

  return (
    <GroupedCard>
      <View style={styles.headerRow}>
        <View
          style={styles.iconTile}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <Feather name="repeat" size={18} color={colors.primary} />
        </View>
        <AppText variant="subheading" accessibilityRole="header" style={styles.headerText}>
          {copy.settlement.heading}
        </AppText>
      </View>

      {collectedCentavos !== null && totalCentavos && totalCentavos > 0 ? (
        <View style={styles.padded}>
          <ProgressBar
            fraction={collectedCentavos / totalCentavos}
            tone={collectedCentavos >= totalCentavos ? 'success' : 'primary'}
            label={copy.settlement.collectedLabel
              .replace('{collected}', formatCentavos(collectedCentavos))
              .replace('{total}', formatCentavos(totalCentavos))}
          />
        </View>
      ) : null}

      {transactions.map((transaction, index) => {
        const debtorName = nameByParticipantId.get(transaction.fromParticipantId) ?? '';
        const creditorName = nameByParticipantId.get(transaction.toParticipantId) ?? '';
        const label = copy.settlement.owesLabel
          .replace('{debtor}', debtorName)
          .replace('{creditor}', creditorName);

        return (
          <Fragment
            key={`${transaction.fromParticipantId}-${transaction.toParticipantId}-${index}`}
          >
            <GroupedSeparator />
            <View style={styles.row}>
              <AppText variant="body" numberOfLines={1} style={styles.rowLabel}>
                {label}
              </AppText>
              {/* accessibilityLabel is the spoken form (spec section 17's
                  "520 pesos and 25 centavos" example), distinct from the
                  visible formatCentavos text. */}
              <AppText
                variant="subheading"
                style={styles.uniformText}
                accessibilityLabel={formatCentavosForSpeech(transaction.amountCentavos)}
              >
                {formatCentavos(transaction.amountCentavos)}
              </AppText>
            </View>
          </Fragment>
        );
      })}

      {/* Status is conveyed by the message text itself, not only the
          success/warning color (spec section 17). */}
      {allSettled ? (
        <View style={styles.padded}>
          <View style={[styles.statusRow, styles.success]}>
            <Feather
              name="check-circle"
              size={18}
              color={colors.success}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            />
            <AppText variant="caption" style={styles.statusText}>
              {copy.settlement.allSettled}
            </AppText>
          </View>
        </View>
      ) : null}

      {unaccountedCentavos !== 0 ? (
        <View style={styles.padded}>
          <View style={[styles.statusRow, styles.warning]}>
            <Feather
              name="alert-triangle"
              size={18}
              color={colors.warning}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            />
            <AppText variant="caption" style={styles.statusText}>
              {unaccountedCentavos > 0
                ? copy.payments.unaccountedNote.replace(
                    '{amount}',
                    formatCentavos(unaccountedCentavos),
                  )
                : copy.payments.overCollectedNote.replace(
                    '{amount}',
                    formatCentavos(Math.abs(unaccountedCentavos)),
                  )}
            </AppText>
          </View>
        </View>
      ) : null}
    </GroupedCard>
  );
}

function createStyles(colors: ColorTokens) {
  return StyleSheet.create({
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      minHeight: touchTarget.preferred,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    headerText: {
      flex: 1,
    },
    iconTile: {
      width: 36,
      height: 36,
      borderRadius: radius.tile,
      borderCurve: 'continuous',
      backgroundColor: tint(colors.primary),
      alignItems: 'center',
      justifyContent: 'center',
    },
    // Progress bar / status rows sit inside the card's own edge padding;
    // the small top pad keeps them off a transaction row directly above.
    padded: {
      paddingHorizontal: spacing.md,
      paddingTop: spacing.xs,
      paddingBottom: spacing.md,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.md,
      minHeight: touchTarget.min,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    rowLabel: {
      flex: 1,
      fontSize: 14,
      lineHeight: 19,
    },
    uniformText: {
      fontSize: 14,
      lineHeight: 19,
    },
    statusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radius.button,
      borderCurve: 'continuous',
      borderWidth: 1,
    },
    statusText: {
      flex: 1,
    },
    success: { backgroundColor: tint(colors.success), borderColor: colors.success },
    warning: { backgroundColor: tint(colors.warning), borderColor: colors.warning },
  });
}
