import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { AppButton } from '@/components/ui/AppButton';
import { AppText } from '@/components/ui/AppText';
import { Screen } from '@/components/ui/Screen';
import { copy } from '@/constants/copy';
import { billsRepository } from '@/db/repositories/bills.repository';
import { saveParsedReceiptDraft } from '@/features/bills/bill.service';
import { createOcrDerivative } from '@/features/receipt-capture/receiptImage.service';
import { BackendReceiptOcrService } from '@/features/receipt-ocr/BackendReceiptOcrService';
import { FallbackReceiptOcrService } from '@/features/receipt-ocr/FallbackReceiptOcrService';
import { MlKitReceiptOcrService } from '@/features/receipt-ocr/MlKitReceiptOcrService';
import { radius, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

type Stage = 'preparing' | 'reading' | 'organizing' | 'error';

// Tries the VLM backend first (better accuracy, especially on messy/
// handwritten receipts), falls back to on-device ML Kit on any error, timeout,
// or when the backend isn't configured — see PLAN.md's VLM-backed OCR entry.
// This is the one mandatory offline guarantee (spec Amendment/§4): scanning
// must keep working with no network at all.
const ocrService = new FallbackReceiptOcrService(
  new BackendReceiptOcrService(),
  new MlKitReceiptOcrService(),
);

export default function ProcessingScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { billId } = useLocalSearchParams<{ billId: string }>();
  const [stage, setStage] = useState<Stage>('preparing');
  const [rawText, setRawText] = useState<string | null>(null);
  const [showRawText, setShowRawText] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // Shown as a dimmed backdrop behind the spinner (see the render below) —
  // purely a visual anchor for "this is the receipt being read," never fed
  // back into OCR/parsing logic (that uses `ocrReadyUri` below, not this).
  const [receiptImageUri, setReceiptImageUri] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setStage('preparing');
      setRawText(null);
      try {
        const bill = await billsRepository.getById(billId);
        if (!bill?.receiptImageUri) throw new Error('Missing receipt image for this bill.');
        setReceiptImageUri(bill.receiptImageUri);

        const ocrReadyUri = await createOcrDerivative(bill.receiptImageUri);

        setStage('reading');
        const { receipt, source, fallbackReason } = await ocrService.recognize(ocrReadyUri);
        setRawText(receipt.rawText);

        setStage('organizing');
        saveParsedReceiptDraft(billId, receipt);

        // ocrSource/fallbackReason are one-time UI hints for the review
        // screen ("read online" vs "read on-device", and why), not persisted
        // bill data — they simply won't be present if the user reopens this
        // draft later, which is fine.
        router.replace({
          pathname: '/bill/[billId]/receipt-review',
          params: fallbackReason
            ? { billId, ocrSource: source, fallbackReason }
            : { billId, ocrSource: source },
        });
      } catch (error) {
        // Development-only diagnostic (spec §18: dev logging must be gated
        // and easy to disable) — never shown to the end user, unlike the
        // removed DEBUG-text banner this screen used to render here.
        if (__DEV__) console.error('[ProcessingScreen] OCR failed:', error);
        setStage('error');
      }
    })();
    // `attempt` isn't read above — it's a deliberate counter so the retry
    // button can force this effect to run again with the same billId.
  }, [billId, router, attempt]);

  if (stage === 'error') {
    return (
      <Screen scroll>
        <View style={styles.failureBody}>
          {/* Spec §17: announce processing completion/failure — matches
              ErrorState's own live-region treatment used everywhere else in
              the app; this screen can't use ErrorState directly since it
              needs four distinct actions, not ErrorState's single retry
              button. */}
          <View style={styles.headingGroup} accessibilityLiveRegion="assertive">
            <AppText variant="heading">{copy.ocrFailure.heading}</AppText>
            <AppText variant="body" color="textSecondary">
              {copy.ocrFailure.body}
            </AppText>
            {/* copy.global.ocrUnavailable, not copy.ocrFailure.body's own
                retry-oriented framing: this catch only ever fires once
                `ocrService` (FallbackReceiptOcrService) has already
                exhausted both the backend and the on-device ML Kit path, so
                "scanning isn't available on this device right now" is an
                accurate description of what just happened, not a guess —
                it's shown alongside spec 13.8's own required heading/body,
                not in place of it, since that pair is an exact copy
                contract of its own. */}
            <AppText variant="body" color="textSecondary">
              {copy.global.ocrUnavailable}
            </AppText>
          </View>

          <View style={styles.actions}>
            <AppButton
              label={copy.ocrFailure.retryButton}
              onPress={() => setAttempt((a) => a + 1)}
              icon={(color) => <Feather name="refresh-cw" size={18} color={color} />}
            />
            <AppButton
              variant="secondary"
              label={copy.ocrFailure.anotherPhotoButton}
              onPress={() => router.back()}
              icon={(color) => <Feather name="camera" size={18} color={color} />}
            />
            <AppButton
              variant="secondary"
              label={copy.ocrFailure.manualButton}
              onPress={() => router.replace(`/bill/${billId}/receipt-review`)}
              icon={(color) => <Feather name="edit" size={18} color={color} />}
            />
            <AppButton
              variant="text"
              label={copy.ocrFailure.technicalDetailsAction}
              onPress={() => setShowRawText((value) => !value)}
            />
          </View>
        </View>

        {showRawText ? (
          <AppText variant="caption" color="textSecondary" style={styles.rawText}>
            {rawText && rawText.trim().length > 0 ? rawText : copy.ocrFailure.noTextDetail}
          </AppText>
        ) : null}
      </Screen>
    );
  }

  const stageLabel = {
    preparing: copy.processing.stagePreparing,
    reading: copy.processing.stageReading,
    organizing: copy.processing.stageOrganizing,
  }[stage];

  return (
    <Screen>
      <View style={styles.centered}>
        {/* Dimmed backdrop of the receipt actually being read — a visual
            anchor for "this is what's being processed," not a functional
            part of the OCR pipeline itself. */}
        {receiptImageUri ? (
          <View style={styles.imageCard}>
            <Image source={{ uri: receiptImageUri }} style={styles.image} contentFit="cover" />
            <View style={[StyleSheet.absoluteFill, styles.imageScrim]} pointerEvents="none" />
          </View>
        ) : null}
        <ActivityIndicator size="large" color={colors.primary} />
        <AppText variant="heading" style={styles.centerText}>
          {copy.processing.heading}
        </AppText>
        <AppText variant="body" color="textSecondary" style={styles.centerText}>
          {copy.processing.body}
        </AppText>
        <AppText variant="subheading" style={styles.centerText}>
          {stageLabel}
        </AppText>
        <AppText variant="caption" color="textSecondary" style={styles.centerText}>
          {copy.processing.privacyNote}
        </AppText>
        <AppButton
          variant="text"
          label={copy.processing.cancelAction}
          onPress={() => router.replace('/')}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  centerText: { textAlign: 'center' },
  // Section-to-section rhythm: the failure heading/body group vs. the
  // actions group below it.
  failureBody: { gap: spacing.xl },
  headingGroup: { gap: spacing.sm },
  rawText: { marginTop: spacing.md },
  actions: { gap: spacing.sm },
  imageCard: {
    width: '70%',
    aspectRatio: 3 / 4,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    overflow: 'hidden',
    marginBottom: spacing.md,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  imageScrim: {
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
});
