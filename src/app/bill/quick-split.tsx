import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AmountInput } from '@/components/ui/AmountInput';
import { AppButton } from '@/components/ui/AppButton';
import { AppText } from '@/components/ui/AppText';
import { AppTextInput } from '@/components/ui/AppTextInput';
import { BottomActionBar } from '@/components/ui/BottomActionBar';
import { InlineError } from '@/components/ui/InlineError';
import { Screen } from '@/components/ui/Screen';
import { copy } from '@/constants/copy';
import { isValidAdjustmentAmount } from '@/features/adjustments/validateAdjustmentAmount';
import { createQuickSplitBill } from '@/features/bills/bill.service';
import { spacing } from '@/theme/tokens';

// Not from the spec — post-MVP "split evenly" quick-entry path (see
// PLAN.md): a lightweight alternative to receipt scanning/manual itemization
// that just asks for a title and a total, then hands off to
// createQuickSplitBill (bill.service.ts) to create an already-EQUAL-split
// draft. From there this screen replaces straight into the Participants
// screen, matching every other bill-creation entry point in this codebase
// (useBillSourceActions.ts's startManual) — a fresh draft is never worth
// keeping in the back stack, since there is nothing meaningful to "go back"
// to.
export default function QuickSplitScreen() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [totalCentavos, setTotalCentavos] = useState(0);
  const [amountError, setAmountError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleContinue() {
    // Reuses validateAdjustmentAmount's isValidAdjustmentAmount rather than
    // duplicating its "positive, safe, non-zero" check — an amount entered
    // here is exactly the same shape of value (a positive magnitude in
    // centavos) that rule already exists to validate.
    if (!isValidAdjustmentAmount(totalCentavos)) {
      setAmountError(copy.quickSplit.invalidAmountError);
      return;
    }
    setAmountError(null);
    setActionError(null);
    setSubmitting(true);
    try {
      // createQuickSplitBill (bill.service.ts) already falls back to the
      // usual untitled-bill copy when the trimmed title is empty, so an
      // empty/whitespace-only title here is a perfectly valid submission,
      // not a validation error.
      const bill = createQuickSplitBill({ title, totalCentavos });
      router.replace(`/bill/${bill.id}/participants`);
    } catch {
      setActionError(copy.global.storageFailure);
      setSubmitting(false);
    }
  }

  return (
    <Screen
      scroll
      footer={
        <BottomActionBar>
          {actionError ? <InlineError message={actionError} /> : null}
          <AppButton
            label={copy.quickSplit.continueButton}
            onPress={handleContinue}
            loading={submitting}
          />
        </BottomActionBar>
      }
    >
      <View style={styles.body}>
        <AppText variant="heading">{copy.quickSplit.heading}</AppText>
        <AppText variant="body" color="textSecondary">
          {copy.quickSplit.body}
        </AppText>

        <AppTextInput
          label={copy.quickSplit.titleLabel}
          placeholder={copy.quickSplit.titlePlaceholder}
          value={title}
          onChangeText={setTitle}
        />

        <AmountInput
          label={copy.quickSplit.totalLabel}
          valueCentavos={totalCentavos}
          onChangeCentavos={(value) => {
            setTotalCentavos(value);
            if (amountError) setAmountError(null);
          }}
          error={amountError ?? undefined}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: spacing.md,
  },
});
