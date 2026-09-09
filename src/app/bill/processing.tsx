import Feather from '@expo/vector-icons/Feather';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Modal, Platform, StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import { AppButton } from '@/components/ui/AppButton';
import { AppText } from '@/components/ui/AppText';
import { FadeImageStatus } from '@/components/ui/FadeImageStatus';
import { ReceiptImage } from '@/components/ui/ReceiptImage';
import { Screen } from '@/components/ui/Screen';
import { copy } from '@/constants/copy';
import { billsRepository } from '@/db/repositories/bills.repository';
import { saveParsedReceiptDraft } from '@/features/bills/bill.service';
import { createOcrDerivative } from '@/features/receipt-capture/receiptImage.service';
import { BackendReceiptOcrService } from '@/features/receipt-ocr/BackendReceiptOcrService';
import { FallbackReceiptOcrService } from '@/features/receipt-ocr/FallbackReceiptOcrService';
import { MlKitReceiptOcrService } from '@/features/receipt-ocr/MlKitReceiptOcrService';
import { OcrQueuedError, type ReceiptOcrService } from '@/features/receipt-ocr/ReceiptOcrService';
import { spacing } from '@/theme/tokens';

type Stage = 'preparing' | 'reading' | 'organizing' | 'queued' | 'error';

// Tries the VLM backend first (better accuracy, especially on messy/
// handwritten receipts), falls back to on-device ML Kit on any error, timeout,
// or when the backend isn't configured — see PLAN.md's VLM-backed OCR entry.
// This is the one mandatory offline guarantee (spec Amendment/§4): scanning
// must keep working with no network at all — but that guarantee only applies
// natively. @react-native-ml-kit/text-recognition has no web implementation
// at all (bundles fine, since Metro doesn't complain about an import that's
// merely present, but throws if actually called), so on web this is
// backend-only: a network hiccup surfaces as a real error there instead of
// silently degrading to an on-device pass, since there is no on-device path
// to degrade to.
const ocrService: ReceiptOcrService =
  Platform.OS === 'web'
    ? new BackendReceiptOcrService()
    : new FallbackReceiptOcrService(new BackendReceiptOcrService(), new MlKitReceiptOcrService());

export default function ProcessingScreen() {
  const router = useRouter();
  const { billId } = useLocalSearchParams<{ billId: string }>();
  const [stage, setStage] = useState<Stage>('preparing');
  const [rawText, setRawText] = useState<string | null>(null);
  const [showRawText, setShowRawText] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // Backing image for the "Check receipt" button's full-screen preview (see
  // the Modal in the render below) — no longer shown as an always-visible
  // backdrop the way this screen used to (that's what the new
  // scanning.png/queueing.png illustrations are for instead), only on
  // request.
  const [receiptImageUri, setReceiptImageUri] = useState<string | null>(null);
  const [showReceiptImage, setShowReceiptImage] = useState(false);
  // Live countdown for the 'queued' stage — seeded from OcrQueuedError's own
  // retryAfterSeconds (the backend's authoritative answer for how long its
  // shared scan queue is busy, see scanQueue.ts), then ticked down locally
  // by the effect below so the UI doesn't need to re-ask the server every
  // second just to update a number.
  const [queuedSecondsLeft, setQueuedSecondsLeft] = useState<number | null>(null);

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
        await saveParsedReceiptDraft(billId, receipt);

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
        // The backend's shared scan queue is busy (see scanQueue.ts) — this
        // is expected under normal multi-user load, not a failure, so it
        // gets its own stage (a countdown, handled by the effect below) that
        // automatically retries instead of landing on the error screen.
        if (error instanceof OcrQueuedError) {
          setQueuedSecondsLeft(error.retryAfterSeconds);
          setStage('queued');
          return;
        }
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

  // Ticks queuedSecondsLeft down once a second while queued, then triggers
  // the same retry path the manual "Try again" button uses (`attempt`
  // incrementing re-runs the effect above from the top) right as the
  // countdown reaches 0 — the whole point of a queue is that this retry
  // should land in the now-freed slot, so this doesn't wait for the user to
  // do anything.
  useEffect(() => {
    if (stage !== 'queued' || queuedSecondsLeft === null) return;
    // Both branches' setState calls happen inside the timer callback, not
    // synchronously in the effect body itself (react-hooks/set-state-in-
    // effect) — the countdown reaching 1s is an external-clock event this
    // effect is reacting to, same as the tick itself.
    const timer = setTimeout(() => {
      if (queuedSecondsLeft <= 1) {
        setAttempt((value) => value + 1);
      } else {
        setQueuedSecondsLeft((seconds) => (seconds === null ? null : seconds - 1));
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [stage, queuedSecondsLeft]);

  const isQueued = stage === 'queued';
  // Both panels are always mounted (only `visible`/opacity toggles which one
  // is showing) and absolutely positioned on top of each other, so switching
  // between them is a true crossfade — one fades out while the other fades
  // in, in place, rather than the outgoing one shrinking away above/below
  // the incoming one in normal document flow. That absolute positioning
  // needs a real height to anchor to, which content-sized panels don't have
  // on their own; `panelHeight` supplies it, measured from each panel's own
  // natural (non-absolute) size the first time it lays out, then held at the
  // larger of the two (Math.max, never shrinks) so it comfortably fits
  // whichever panel is tallest — the scanning panel, with its extra
  // stage-label/privacy-note/button rows — without a hardcoded magic number
  // that would either clip at large system font sizes (spec §17) or leave
  // excess empty space at the default one. Before the first layout pass
  // (panelHeight still null) both panels briefly render in normal flow
  // instead — invisible-but-still-affects-layout for whichever isn't
  // current, since FadeImageStatus starts its own opacity at 0 for
  // `visible={false}` from its very first render — but that resolves within
  // the first frame or two, well before this screen shows anything the user
  // would register as a "real" transition, unlike a mid-transition glitch.
  const [panelHeight, setPanelHeight] = useState<number | null>(null);
  function handlePanelLayout(event: LayoutChangeEvent) {
    const height = event.nativeEvent.layout.height;
    setPanelHeight((current) => (current === null ? height : Math.max(current, height)));
  }

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

  const stageLabel =
    stage === 'preparing' || stage === 'reading' || stage === 'organizing'
      ? {
          preparing: copy.processing.stagePreparing,
          reading: copy.processing.stageReading,
          organizing: copy.processing.stageOrganizing,
        }[stage]
      : null;

  return (
    <Screen>
      <View style={styles.centered}>
        {/* Both panels share this positioned area and crossfade over each
            other (see panelHeight's own comment above for why) — grouped
            with the Cancel button below inside `centered`'s own
            justifyContent:'center', so the whole thing sits together in the
            middle of the screen instead of Cancel getting pushed all the
            way to the bottom edge (where it can end up crowded against the
            home indicator/browser chrome). */}
        <View style={[styles.panelStack, panelHeight !== null && { height: panelHeight }]}>
          <View
            style={[styles.panelLayer, panelHeight !== null && styles.panelLayerAbsolute]}
            onLayout={handlePanelLayout}
          >
            <FadeImageStatus
              visible={!isQueued}
              image={require('../../../assets/images/scanning.png')}
              heading={copy.processing.heading}
              body={copy.processing.body}
            >
              {stageLabel ? (
                <AppText variant="subheading" style={styles.centerText}>
                  {stageLabel}
                </AppText>
              ) : null}
              <AppText variant="caption" color="textSecondary" style={styles.centerText}>
                {copy.processing.privacyNote}
              </AppText>
              {/* Lets the user glance at the actual photo being scanned —
                  this screen no longer shows it as an always-visible
                  backdrop the way it used to (that slot is now the
                  scanning.png illustration), so this is the way to see it
                  on request instead. */}
              {receiptImageUri ? (
                <AppButton
                  variant="secondary"
                  label={copy.processing.checkReceiptAction}
                  onPress={() => setShowReceiptImage(true)}
                  icon={(color) => <Feather name="image" size={18} color={color} />}
                />
              ) : null}
            </FadeImageStatus>
          </View>
          <View
            style={[styles.panelLayer, panelHeight !== null && styles.panelLayerAbsolute]}
            onLayout={handlePanelLayout}
          >
            <FadeImageStatus
              visible={isQueued}
              image={require('../../../assets/images/queueing.png')}
              heading={copy.processing.queuedHeading}
              body={copy.processing.queuedBody.replace('{seconds}', String(queuedSecondsLeft ?? 0))}
            />
          </View>
        </View>
        {/* AppButton has no style prop of its own (this codebase's
            convention — see its own props comment), so the extra breathing
            room above Cancel (it otherwise sits right under the "Check
            receipt" button with only `centered`'s own spacing.sm gap, which
            reads as cramped) is a wrapping View's marginTop instead. */}
        <View style={styles.cancelSpacing}>
          <AppButton
            variant="text"
            label={copy.processing.cancelAction}
            onPress={() => router.replace('/')}
          />
        </View>
      </View>

      {/* Mirrors bill/[billId]/index.tsx's own receipt-image modal — same
          shape (see receipt-review.tsx's identical comment on its own copy
          of this). */}
      <Modal
        visible={showReceiptImage}
        animationType="slide"
        onRequestClose={() => setShowReceiptImage(false)}
      >
        <Screen scroll={false}>
          <AppButton
            variant="text"
            label={copy.global.closeAccessibilityLabel}
            onPress={() => setShowReceiptImage(false)}
          />
          {receiptImageUri ? (
            <ReceiptImage
              uri={receiptImageUri}
              style={styles.receiptImage}
              contentFit="contain"
              accessibilityLabel={copy.processing.checkReceiptAction}
            />
          ) : null}
        </Screen>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  centerText: { textAlign: 'center' },
  cancelSpacing: { marginTop: spacing.md },
  // Section-to-section rhythm: the failure heading/body group vs. the
  // actions group below it.
  failureBody: { gap: spacing.xl },
  headingGroup: { gap: spacing.sm },
  rawText: { marginTop: spacing.md },
  actions: { gap: spacing.sm },
  // Shared area the scanning/queued panels crossfade in — sized to
  // `panelHeight` (measured content height, see its own comment above)
  // rather than flex:1, so it doesn't consume the full remaining screen
  // height and push the Cancel button below it down to the very bottom
  // edge, crowded against the home indicator/browser chrome (2026-09-08
  // fix). Falls back to auto-height (undefined) only for the first,
  // pre-measurement frame.
  panelStack: { width: '100%', alignItems: 'center' },
  panelLayer: { width: '100%', alignItems: 'center' },
  // No StyleSheet.absoluteFillObject in this project's RN type version (see
  // SplashLoadingScreen.tsx's identical note) — written out explicitly.
  // Applied only once panelStack has a real measured height to fill (see
  // panelHeight) — before that, panelLayer stays in normal flow so its
  // onLayout can measure its natural, un-constrained size.
  panelLayerAbsolute: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  receiptImage: {
    flex: 1,
  },
});
