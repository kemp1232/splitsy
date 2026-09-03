import Feather from '@expo/vector-icons/Feather';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { AppButton } from '@/components/ui/AppButton';
import { AppText } from '@/components/ui/AppText';
import { TAB_BAR_CONTENT_CLEARANCE } from '@/components/ui/BottomTabBar';
import { ReceiptTornEdge } from '@/components/ui/ReceiptTornEdge';
import { Screen } from '@/components/ui/Screen';
import { copy } from '@/constants/copy';
import type { NewBill } from '@/db/repositories/bills.repository';
import { createDraftBill } from '@/features/bills/bill.service';
import { copyImageToAppStorage } from '@/features/receipt-capture/receiptImage.service';
import { createBillInTrip } from '@/features/trips/trip.service';
import type { ColorTokens } from '@/theme/tokens';
import { radius, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

type PreviewParams = {
  imageUri: string;
  entryMethod: NewBill['entryMethod'];
  // Trip feature addition (not from the numbered MVP spec): forwarded here by
  // useBillSourceActions.ts's pickFromGallery (and, for the camera path, by
  // /bill/capture) the same way imageUri/entryMethod already are. When
  // present, "Use this photo" below creates the bill inside this trip
  // instead of as a standalone draft.
  tripId?: string;
};

async function rotate90(uri: string): Promise<string> {
  const context = ImageManipulator.manipulate(uri).rotate(90);
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({ format: SaveFormat.JPEG });
  return saved.uri;
}

export default function PreviewScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const params = useLocalSearchParams<PreviewParams>();
  const [uri, setUri] = useState(params.imageUri);
  const [busy, setBusy] = useState(false);

  async function handleRotate() {
    setUri(await rotate90(uri));
  }

  async function handleChooseAnother() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({ quality: 1 });
    const asset = result.assets?.[0];
    if (!result.canceled && asset?.uri) {
      setUri(asset.uri);
    }
  }

  async function handleUseThisPhoto() {
    setBusy(true);
    try {
      const appUri = await copyImageToAppStorage(uri);
      const draftInput = {
        entryMethod: params.entryMethod,
        receiptImageUri: appUri,
        originalReceiptImageUri: appUri,
      };
      const bill = params.tripId
        ? await createBillInTrip(params.tripId, draftInput)
        : await createDraftBill(draftInput);
      router.replace({ pathname: '/bill/processing', params: { billId: bill.id } });
    } catch {
      Alert.alert(copy.global.genericErrorHeading, copy.global.imageCopyFailure);
      setBusy(false);
    }
  }

  return (
    <Screen scroll padded={false}>
      <View style={styles.body}>
        <View style={styles.headingGroup}>
          <AppText variant="heading">{copy.preview.heading}</AppText>
          <AppText variant="body" color="textSecondary">
            {copy.preview.body}
          </AppText>
        </View>

        <View style={styles.imageGroup}>
          {/* Signature torn-receipt-edge treatment (theme direction: used
              sparingly, on receipt-related surfaces) — this is the photo of
              the actual receipt, the most literal place for it in the app. */}
          <View style={styles.imageCard}>
            <Image source={{ uri }} style={styles.image} contentFit="contain" />
          </View>
          <ReceiptTornEdge color={colors.surfaceMuted} borderColor={colors.border} />
        </View>

        {/* Was a sticky BottomActionBar footer — moved inline, per the
            user's own explicit request (2026-08-27) to drop sticky nav
            footers in favor of plain in-flow buttons. */}
        <View style={styles.actionsGroup}>
          <View style={styles.row}>
            {params.entryMethod === 'CAMERA' ? (
              <AppButton
                variant="secondary"
                label={copy.preview.retakeAction}
                onPress={() => router.back()}
                icon={(color) => <Feather name="camera" size={18} color={color} />}
              />
            ) : (
              <AppButton
                variant="secondary"
                label={copy.preview.chooseAnotherAction}
                onPress={handleChooseAnother}
                icon={(color) => <Feather name="image" size={18} color={color} />}
              />
            )}
            <AppButton
              variant="secondary"
              label={copy.preview.rotateAction}
              onPress={handleRotate}
              icon={(color) => <Feather name="rotate-cw" size={18} color={color} />}
            />
          </View>
          <AppButton
            label={copy.preview.primaryButton}
            onPress={handleUseThisPhoto}
            loading={busy}
          />
        </View>
      </View>
    </Screen>
  );
}

function createStyles(colors: ColorTokens) {
  return StyleSheet.create({
    body: {
      padding: spacing.lg,
      // The action buttons used to sit in a sticky footer, which Screen.tsx
      // pads above the global nav bar automatically — now that they're plain
      // in-flow content, this screen reserves that space itself.
      paddingBottom: spacing.lg + TAB_BAR_CONTENT_CLEARANCE,
      // Section-to-section rhythm: heading block, image block, actions block.
      gap: spacing.xl,
    },
    headingGroup: {
      gap: spacing.xs,
    },
    imageGroup: {
      gap: spacing.sm,
    },
    imageCard: {
      borderTopLeftRadius: radius.lg,
      borderTopRightRadius: radius.lg,
      borderCurve: 'continuous',
      overflow: 'hidden',
      backgroundColor: colors.surfaceMuted,
    },
    image: {
      width: '100%',
      aspectRatio: 3 / 4,
    },
    actionsGroup: {
      gap: spacing.sm,
    },
    row: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
  });
}
