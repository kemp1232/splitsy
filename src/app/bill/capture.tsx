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

// The camera viewfinder's own chrome (close/flash controls, guide frame,
// instructions, shutter) always sits on top of a live camera feed behind a
// fixed dark scrim — that backdrop has nothing to do with the app's light/dark
// theme (there's no "light camera overlay"), so this chrome intentionally
// uses fixed white-on-dark colors instead of theme tokens, which would
// otherwise resolve to dark ink in dark mode and disappear against the same
// dark scrim.
const overlay = {
  text: '#FFFFFF',
  scrim: 'rgba(0,0,0,0.4)',
  frame: '#FFFFFF',
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
    <View style={styles.flex}>
      <CameraView ref={cameraRef} style={styles.flex} facing="back" flash={flash}>
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

        <View style={styles.guideFrame} pointerEvents="none" />

        <View style={styles.bottomBar}>
          <AppText style={[styles.overlayText, styles.centerText]}>
            {copy.cameraCapture.instruction}
          </AppText>
          <AppText variant="caption" style={[styles.overlayText, styles.centerText]}>
            {copy.cameraCapture.tip}
          </AppText>
          <View style={styles.controls}>
            <AppButton
              variant="secondary"
              label={copy.cameraCapture.galleryAction}
              onPress={pickFromGallery}
            />
            <Pressable
              onPress={handleCapture}
              accessibilityRole="button"
              accessibilityLabel={copy.cameraCapture.captureAccessibilityLabel}
              style={styles.shutter}
            />
          </View>
        </View>
      </CameraView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
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
  guideFrame: {
    flex: 1,
    marginHorizontal: spacing.xxl,
    marginBottom: spacing.lg,
    borderWidth: 2,
    borderColor: overlay.frame,
    borderRadius: radius.md,
    borderStyle: 'dashed',
  },
  bottomBar: {
    padding: spacing.lg,
    gap: spacing.sm,
    backgroundColor: overlay.scrim,
  },
  centerText: { textAlign: 'center' },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  shutter: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: overlay.text,
    borderWidth: 4,
    borderColor: overlay.frame,
  },
});
