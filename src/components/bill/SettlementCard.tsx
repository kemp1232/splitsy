import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { SectionCard } from '@/components/ui/SectionCard';
import { copy } from '@/constants/copy';
import type { SettlementTransaction } from '@/features/splitting/settlement.types';
import { formatCentavos, formatCentavosForSpeech } from '@/lib/money';
import { spacing } from '@/theme/tokens';

type Props = {
  transactions: SettlementTransaction[];
  // `computeSettlement`'s own signed difference: positive when the bill isn't
  // fully covered by contributions yet, negative when more was contributed
  // than the bill required, zero when every centavo is accounted for.
  unaccountedCentavos: number;
  nameByParticipantId: Map<string, string>;
};

// Post-MVP scope expansion (see settlement.ts's header comment) — the
// summary and saved-bill-detail screens' "who owes whom" display, built from
// computeSettlement's output. Rendered once per screen, alongside (not in
// place of) the existing per-participant PersonTotalCard breakdown.
export function SettlementCard({ transactions, unaccountedCentavos, nameByParticipantId }: Props) {
  const allSettled = transactions.length === 0 && unaccountedCentavos === 0;

  return (
    <SectionCard>
      <AppText variant="subheading">{copy.settlement.heading}</AppText>

      {transactions.length > 0 ? (
        <View style={styles.list}>
          {transactions.map((transaction, index) => {
            const debtorName = nameByParticipantId.get(transaction.fromParticipantId) ?? '';
            const creditorName = nameByParticipantId.get(transaction.toParticipantId) ?? '';
            const label = copy.settlement.owesLabel
              .replace('{debtor}', debtorName)
              .replace('{creditor}', creditorName);

            return (
              <View
                key={`${transaction.fromParticipantId}-${transaction.toParticipantId}-${index}`}
                style={styles.row}
              >
                <AppText variant="body" numberOfLines={1} style={styles.rowLabel}>
                  {label}
                </AppText>
                {/* accessibilityLabel is the spoken form (spec section 17's
                    "520 pesos and 25 centavos" example), distinct from the
                    visible formatCentavos text. */}
                <AppText
                  variant="body"
                  accessibilityLabel={formatCentavosForSpeech(transaction.amountCentavos)}
                >
                  {formatCentavos(transaction.amountCentavos)}
                </AppText>
              </View>
            );
          })}
        </View>
      ) : null}

      {/* Status is conveyed by the message text itself, not only the success
          color (spec section 17). */}
      {allSettled ? <AppText color="success">{copy.settlement.allSettled}</AppText> : null}

      {unaccountedCentavos !== 0 ? (
        <AppText color="warning">
          {unaccountedCentavos > 0
            ? copy.payments.unaccountedNote.replace('{amount}', formatCentavos(unaccountedCentavos))
            : copy.payments.overCollectedNote.replace(
                '{amount}',
                formatCentavos(Math.abs(unaccountedCentavos)),
              )}
        </AppText>
      ) : null}
    </SectionCard>
  );
}

const styles = StyleSheet.create({
  list: {
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
});
