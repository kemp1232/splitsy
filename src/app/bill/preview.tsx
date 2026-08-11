import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Image, StyleSheet, View } from 'react-native';

import { AppButton } from '@/components/ui/AppButton';
import { AppText } from '@/components/ui/AppText';
import { BottomActionBar } from '@/components/ui/BottomActionBar';
import { Screen } from '@/components/ui/Screen';
import { copy } from '@/constants/copy';
import { createDraftBill } from '@/features/bills/bill.service';
import type { NewBill } from '@/db/repositories/bills.repository';
import { copyImageToAppStorage } from '@/features/receipt-capture/receiptImage.service';
import { spacing } from '@/theme/tokens';

type PreviewParams = {
  imageUri: string;
  entryMethod: NewBill['entryMethod'];
};

async function rotate90(uri: string): Promise<string> {
  const context = ImageManipulator.manipulate(uri).rotate(90);
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({ format: SaveFormat.JPEG });
  return saved.uri;
}

export default function PreviewScreen() {
  const router = useRouter();
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
      const bill = await createDraftBill({
        entryMethod: params.entryMethod,
        receiptImageUri: appUri,
        originalReceiptImageUri: appUri,
      });
      router.replace({ pathname: '/bill/processing', params: { billId: bill.id } });
    } catch {
      Alert.alert(copy.global.genericErrorHeading, copy.global.imageCopyFailure);
      setBusy(false);
    }
  }

  return (
    <Screen
      scroll
      padded={false}
      footer={
        <BottomActionBar>
          <View style={styles.row}>
            {params.entryMethod === 'CAMERA' ? (
              <AppButton
                variant="secondary"
                label={copy.preview.retakeAction}
                onPress={() => router.back()}
              />
            ) : (
              <AppButton
                variant="secondary"
                label={copy.preview.chooseAnotherAction}
                onPress={handleChooseAnother}
              />
            )}
            <AppButton
              variant="secondary"
              label={copy.preview.rotateAction}
              onPress={handleRotate}
            />
          </View>
          <AppButton
            label={copy.preview.primaryButton}
            onPress={handleUseThisPhoto}
            loading={busy}
          />
        </BottomActionBar>
      }
    >
      <View style={styles.body}>
        <AppText variant="heading">{copy.preview.heading}</AppText>
        <AppText variant="body" color="textSecondary">
          {copy.preview.body}
        </AppText>
        <Image source={{ uri }} style={styles.image} resizeMode="contain" />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  image: {
    width: '100%',
    aspectRatio: 3 / 4,
    backgroundColor: '#00000010',
    marginTop: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
});
