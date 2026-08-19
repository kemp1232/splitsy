import { CameraView, useCameraPermissions, type FlashMode } from 'expo-camera';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { AppButton } from '@/components/ui/AppButton';
import { AppText } from '@/components/ui/AppText';
import { IconButton } from '@/components/ui/IconButton';
import { LoadingState } from '@/components/ui/LoadingState';
import { Screen } from '@/components/ui/Screen';
import { copy } from '@/constants/copy';
import { useBillSourceActions } from '@/features/bills/useBillSourceActions';
import { radius, spacing, touchTarget } from '@/theme/tokens';

const FLASH_CYCLE: FlashMode[] = ['auto', 'on', 'off'];
const FLASH_LABEL: Record<FlashMode, string> = {
  auto: copy.cameraCapture.flashAuto,
  on: copy.cameraCapture.flashOn,
  off: copy.cameraCapture.flashOff,
  screen: copy.cameraCapture.flashAuto,
};

// The camera viewfinder's own chrome (close/flash controls, instruction text,
// the camera card's corner brackets, shutter) always sits on top of or around
// a live camera feed — that backdrop has nothing to do with the app's
// light/dark theme (there's no "light camera overlay"), so this chrome
// intentionally uses fixed white-on-dark colors instead of theme tokens,
// which would otherwise resolve to dark ink in dark mode and disappear
// against this same fixed dark chrome.
const overlay = {
  text: '#FFFFFF',
  scrim: 'rgba(0,0,0,0.4)',
  frame: '#FFFFFF',
  background: '#0B0D12',
};

export default function CaptureScreen() {
  const router = useRouter();
  const { pickFromGallery, startManual } = useBillSourceActions();
  const [permission, requestPermission] = useCameraPermissions();
  const [flash, setFlash] = useState<FlashMode>('auto');
  const cameraRef = useRef<CameraView>(null);

  if (!permission) {
    return (
      <Screen>
        <LoadingState />
      </Screen>
    );
  }

  if (!permission.granted) {
    return (
      <Screen>
        <AppText variant="heading">{copy.cameraPermission.heading}</AppText>
        <AppText variant="body" color="textSecondary" style={styles.spacedBelow}>
          {copy.cameraPermission.body}
        </AppText>

        {permission.canAskAgain ? (
          <AppButton label={copy.cameraPermission.primaryButton} onPress={requestPermission} />
        ) : (
          <View style={styles.spacedBelow}>
            <AppText variant="body" color="danger">
              {copy.cameraPermission.permanentDenialBody}
            </AppText>
            <AppButton
              label={copy.cameraPermission.settingsButton}
              onPress={() => Linking.openSettings()}
            />
          </View>
        )}

        <View style={styles.fallbacks}>
          <AppButton
            variant="text"
            label={copy.cameraPermission.galleryAlternative}
            onPress={pickFromGallery}
          />
          <AppButton
            variant="text"
            label={copy.cameraPermission.manualAlternative}
            onPress={startManual}
          />
        </View>
      </Screen>
    );
  }

  async function handleCapture() {
    const photo = await cameraRef.current?.takePictureAsync({ quality: 1 });
    if (!photo) return;
    router.push({
      pathname: '/bill/preview',
      params: { imageUri: photo.uri, entryMethod: 'CAMERA' },
    });
  }

  return (
    <View style={styles.screen}>
      <View style={styles.topBar}>
        <IconButton
          accessibilityLabel={copy.cameraCapture.closeAccessibilityLabel}
          onPress={() => router.back()}
          icon={<AppText style={styles.overlayText}>✕</AppText>}
        />
        <Pressable
          onPress={() =>
            setFlash(FLASH_CYCLE[(FLASH_CYCLE.indexOf(flash) + 1) % FLASH_CYCLE.length]!)
          }
          accessibilityRole="button"
          hitSlop={8}
          style={styles.flashButton}
        >
          <AppText style={styles.overlayText}>{FLASH_LABEL[flash]}</AppText>
        </Pressable>
      </View>

      {/* Reference UI's short instructional heading + one-sentence
          description, above the camera view rather than overlaid on top of
          it (spec section 17: camera guidance must have text, not only a
          visual frame — this is that text, just repositioned). */}
      <View style={styles.instructionBlock}>
        <AppText variant="heading" style={styles.overlayText}>
          {copy.cameraCapture.instruction}
        </AppText>
        <AppText variant="body" style={[styles.overlayText, styles.instructionBody]}>
          {copy.cameraCapture.tip}
        </AppText>
      </View>

      {/* The reference's large rounded camera card with viewfinder-style
          corner brackets (an aiming-reticle look) and a subtle scan-line
          accent — deliberately simple decoration, not a document-edge
          detector (spec F-007 explicitly rules that out for the MVP). */}
      <View style={styles.cameraCard}>
        <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" flash={flash} />
        <View style={styles.scanLine} pointerEvents="none" />
        <View style={[styles.bracket, styles.bracketTopLeft]} pointerEvents="none" />
        <View style={[styles.bracket, styles.bracketTopRight]} pointerEvents="none" />
        <View style={[styles.bracket, styles.bracketBottomLeft]} pointerEvents="none" />
        <View style={[styles.bracket, styles.bracketBottomRight]} pointerEvents="none" />
      </View>

      <View style={styles.bottomBar}>
        <View style={styles.bottomBarSide}>
          <AppButton
            variant="secondary"
            label={copy.cameraCapture.galleryAction}
            onPress={pickFromGallery}
          />
        </View>
        {/* The reference's large circular shutter button. */}
        <Pressable
          onPress={handleCapture}
          accessibilityRole="button"
          accessibilityLabel={copy.cameraCapture.captureAccessibilityLabel}
          style={styles.shutterOuter}
        >
          <View style={styles.shutterInner} />
        </Pressable>
        <View style={styles.bottomBarSide} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: overlay.background },
  spacedBelow: { marginTop: spacing.sm, marginBottom: spacing.lg, gap: spacing.sm },
  fallbacks: { marginTop: spacing.xl, gap: spacing.xs },
  overlayText: { color: overlay.text },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: spacing.lg,
    paddingTop: spacing.xxl,
  },
  flashButton: {
    minHeight: touchTarget.min,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: overlay.scrim,
  },
  instructionBlock: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.xs,
  },
  instructionBody: {
    opacity: 0.85,
  },
  cameraCard: {
    flex: 1,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    borderRadius: radius.xl,
    overflow: 'hidden',
    backgroundColor: '#000000',
  },
  scanLine: {
    position: 'absolute',
    left: spacing.xl,
    right: spacing.xl,
    top: '45%',
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.5)',
    borderRadius: radius.pill,
  },
  bracket: {
    position: 'absolute',
    width: 32,
    height: 32,
    borderColor: overlay.frame,
  },
  bracketTopLeft: {
    top: spacing.lg,
    left: spacing.lg,
    borderTopWidth: 3,
    borderLeftWidth: 3,
    borderTopLeftRadius: radius.sm,
  },
  bracketTopRight: {
    top: spacing.lg,
    right: spacing.lg,
    borderTopWidth: 3,
    borderRightWidth: 3,
    borderTopRightRadius: radius.sm,
  },
  bracketBottomLeft: {
    bottom: spacing.lg,
    left: spacing.lg,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    borderBottomLeftRadius: radius.sm,
  },
  bracketBottomRight: {
    bottom: spacing.lg,
    right: spacing.lg,
    borderBottomWidth: 3,
    borderRightWidth: 3,
    borderBottomRightRadius: radius.sm,
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  bottomBarSide: {
    flex: 1,
  },
  shutterOuter: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 4,
    borderColor: overlay.frame,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: overlay.text,
  },
});
