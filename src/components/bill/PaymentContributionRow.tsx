import { StyleSheet, View } from 'react-native';

import { AmountInput } from '@/components/ui/AmountInput';
import { AppButton } from '@/components/ui/AppButton';
import { AppText } from '@/components/ui/AppText';
import { SectionCard } from '@/components/ui/SectionCard';
import { copy } from '@/constants/copy';
import { spacing } from '@/theme/tokens';

type Props = {
  name: string;
  valueCentavos: number;
  onChangeCentavos: (centavos: number) => void;
  // "Paid in full" (spec-adjacent copy.payments.fullAmountAction) — the
  // Payments screen sets *this* participant's contribution to the bill's
  // full computed total and zeroes everyone else's in local form state; this
  // row only ever reports the press, never computes the amount itself.
  onFullAmount: () => void;
};

// Post-MVP scope expansion (see settlement.ts's header comment for the
// feature's overall rationale) — one participant's row on the Payments
// screen: their name, an editable contribution amount, and the one-tap
// "paid in full" shortcut.
export function PaymentContributionRow({
  name,
  valueCentavos,
  onChangeCentavos,
  onFullAmount,
}: Props) {
  return (
    <SectionCard>
      <AppText variant="subheading" numberOfLines={1}>
        {name}
      </AppText>
      <View style={styles.row}>
        <View style={styles.amountField}>
          <AmountInput
            label={name}
            valueCentavos={valueCentavos}
            onChangeCentavos={onChangeCentavos}
          />
        </View>
        <AppButton
          variant="secondary"
          label={copy.payments.fullAmountAction}
          onPress={onFullAmount}
        />
      </View>
    </SectionCard>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  amountField: {
    flex: 1,
  },
});
