import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { SectionCard } from '@/components/ui/SectionCard';
import { copy } from '@/constants/copy';
import { formatCentavos, formatCentavosForSpeech } from '@/lib/money';
import { spacing } from '@/theme/tokens';

type Props = {
  name: string;
  fairShareCentavos: number;
  contributedCentavos: number;
};

// The trip-wide counterpart to PersonTotalCard's collapsed header +
// payment-progress bar (bill/[billId]/summary.tsx), reused for one identity's
// combined balance across every COMPLETED bill in a trip
// (computeTripSettlement.ts). Unlike PersonTotalCard, there is no itemized
// item/adjustment breakdown to expand into here — a trip's aggregation
// deliberately only sums fair shares and contributions across bills, never
// their per-item detail (see computeTripSettlement.ts's own header comment)
// — so this card has no expand/collapse affordance, and reuses
// `summary.participantOwes`/`payments.progressPaidInFull`/`progressPartial`
// as-is rather than duplicating that same generic copy under a new name.
export function TripPersonBalanceCard({ name, fairShareCentavos, contributedCentavos }: Props) {
  const fraction = fairShareCentavos > 0 ? contributedCentavos / fairShareCentavos : 0;
  const isPaidInFull = contributedCentavos >= fairShareCentavos;

  return (
    <SectionCard>
      <View style={styles.header}>
        <AppText variant="subheading">
          {copy.summary.participantOwes.replace('{name}', name)}
        </AppText>
        <AppText variant="amount" accessibilityLabel={formatCentavosForSpeech(fairShareCentavos)}>
          {formatCentavos(fairShareCentavos)}
        </AppText>
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
    </SectionCard>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
});
