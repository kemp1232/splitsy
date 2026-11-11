import Feather from '@expo/vector-icons/Feather';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AmountInput } from '@/components/ui/AmountInput';
import { AppButton } from '@/components/ui/AppButton';
import { AppText } from '@/components/ui/AppText';
import { AppTextInput } from '@/components/ui/AppTextInput';
import { IconButton } from '@/components/ui/IconButton';
import { InlineError } from '@/components/ui/InlineError';
import { Screen } from '@/components/ui/Screen';
import { copy } from '@/constants/copy';
import { isValidAdjustmentAmount } from '@/features/adjustments/validateAdjustmentAmount';
import { createQuickSplitBill } from '@/features/bills/bill.service';
import { spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

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
  const { colors } = useTheme();
  const [title, setTitle] = useState('');
  const [totalCentavos, setTotalCentavos] = useState(0);
  const [amountError, setAmountError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Nothing is created until Continue, so going back just leaves. Falls back
  // to Home when there's no screen behind this one (e.g. a reloaded web tab).
  function handleBack() {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.dismissTo('/');
    }
  }

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
      const bill = await createQuickSplitBill({ title, totalCentavos });
      router.replace(`/bill/${bill.id}/participants`);
    } catch {
      setActionError(copy.global.storageFailure);
      setSubmitting(false);
    }
  }

  return (
    <Screen tabBarHidden scroll>
      <View style={styles.body}>
        <View style={styles.headingGroup}>
          <View style={styles.headingRow}>
            <IconButton
              accessibilityLabel={copy.quickSplit.backAccessibilityLabel}
              onPress={handleBack}
              icon={<Feather name="arrow-left" size={22} color={colors.textPrimary} />}
            />
            <AppText variant="heading" style={styles.headingText} accessibilityRole="header">
              {copy.quickSplit.heading}
            </AppText>
          </View>
          <AppText variant="body" color="textSecondary">
            {copy.quickSplit.body}
          </AppText>
        </View>

        <View style={styles.fieldGroup}>
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

        {/* Was a sticky BottomActionBar footer — moved inline, per the
            user's own explicit request (2026-08-27) to drop sticky nav
            footers in favor of plain in-flow buttons. */}
        <View style={styles.actionsGroup}>
          {actionError ? <InlineError message={actionError} /> : null}
          <AppButton
            label={copy.quickSplit.continueButton}
            onPress={handleContinue}
            loading={submitting}
            icon={(color) => <Feather name="arrow-right-circle" size={18} color={color} />}
            iconPosition="trailing"
          />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: {
    // Section-to-section rhythm: heading, field group, actions.
    gap: spacing.xl,
    // No tab-bar clearance: the global BottomTabBar is hidden on /bill/**
    // (Screen's own padding already spaces the last button from the edge).
  },
  headingGroup: {
    gap: spacing.xs,
  },
  // Same back-button row as receipt-review.tsx's header.
  headingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    // Pulls the back button's own touch-target padding flush with the
    // content edge so the arrow lines up with the fields below.
    marginLeft: -spacing.md,
  },
  headingText: {
    flexShrink: 1,
  },
  fieldGroup: {
    gap: spacing.md,
  },
  actionsGroup: {
    gap: spacing.sm,
  },
});
