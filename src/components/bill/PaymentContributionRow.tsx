import Feather from '@expo/vector-icons/Feather';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { AmountInput } from '@/components/ui/AmountInput';
import { AppButton } from '@/components/ui/AppButton';
import { AppText } from '@/components/ui/AppText';
import { copy } from '@/constants/copy';
import type { ColorTokens } from '@/theme/tokens';
import { spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

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
// "paid in full" shortcut. Borderless: the Payments screen's GroupedCard
// draws the card and the hairline separators between rows.
export function PaymentContributionRow({
  name,
  valueCentavos,
  onChangeCentavos,
  onFullAmount,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.container}>
      {/* Same circular person-icon treatment as participants.tsx's own
          roster row — decorative here too, the name text already identifies
          the person. */}
      <View style={styles.nameRow}>
        <View style={styles.avatarCircle} accessibilityElementsHidden>
          <Feather name="user" size={18} color={colors.primary} />
        </View>
        <AppText variant="subheading" numberOfLines={1} style={styles.nameText}>
          {name}
        </AppText>
      </View>
      <View style={styles.row}>
        <View style={styles.amountField}>
          {/* No label here — the row's own name text above already
              identifies this field; passing `name` too showed it twice. */}
          <AmountInput valueCentavos={valueCentavos} onChangeCentavos={onChangeCentavos} />
        </View>
        <AppButton
          variant="secondary"
          label={copy.payments.fullAmountAction}
          onPress={onFullAmount}
        />
      </View>
    </View>
  );
}

function createStyles(colors: ColorTokens) {
  return StyleSheet.create({
    container: {
      padding: spacing.md,
      gap: spacing.sm,
    },
    nameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    // Uniform 14/19 row text, as on participants.tsx.
    nameText: {
      flex: 1,
      fontSize: 14,
      lineHeight: 19,
    },
    // Same treatment as participants.tsx's own avatarCircle.
    avatarCircle: {
      width: 36,
      height: 36,
      borderRadius: 18,
      borderCurve: 'continuous',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceMuted,
      borderWidth: 1,
      borderColor: colors.border,
    },
    row: {
      flexDirection: 'row',
      // The amount field has no label above it any more, but stays
      // flex-end (rather than center) so the "Paid in full" button lines up
      // with the bottom of the input even if the field ever grows taller
      // (e.g. a validation error appearing beneath it).
      alignItems: 'flex-end',
      gap: spacing.sm,
    },
    amountField: {
      flex: 1,
    },
  });
}
