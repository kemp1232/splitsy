import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Alert } from 'react-native';

import { copy } from '@/constants/copy';
import { createBillInTrip } from '@/features/trips/trip.service';

import { createDraftBill } from './bill.service';

type BillSourceActionsParams = {
  // Trip feature addition (not from the numbered MVP spec): when this hook
  // is reached from a trip's "add bill" entry point, /bill/new and
  // /bill/capture (this hook's two callers) both forward their own
  // `tripId` route param down to here unchanged, the same way
  // /bill/preview already threads `imageUri`/`entryMethod` through
  // router.push/useLocalSearchParams.
  tripId?: string;
};

// Shared by /bill/new (primary entry points) and /bill/capture (fallbacks off
// the camera-permission screen) so the gallery-pick and manual-start logic
// only exists once.
export function useBillSourceActions() {
  const router = useRouter();
  const { tripId } = useLocalSearchParams<BillSourceActionsParams>();

  async function pickFromGallery() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(copy.cameraPermission.heading, copy.cameraPermission.permanentDenialBody);
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({ quality: 1 });
    const asset = result.assets?.[0];
    if (result.canceled || !asset) return;
    if (!asset.uri) {
      Alert.alert(copy.global.genericErrorHeading, copy.global.unsupportedImage);
      return;
    }

    router.push({
      pathname: '/bill/preview',
      // Forwards tripId (if any) on to /bill/preview so its own
      // "Use this photo" action can create the bill inside the same trip.
      params: { imageUri: asset.uri, entryMethod: 'GALLERY', ...(tripId ? { tripId } : {}) },
    });
  }

  async function startManual() {
    try {
      const bill = tripId
        ? await createBillInTrip(tripId, { entryMethod: 'MANUAL' })
        : await createDraftBill({ entryMethod: 'MANUAL' });
      router.replace(`/bill/${bill.id}/receipt-review`);
    } catch {
      // Matches this hook's own two other failure paths above (permission
      // denial, an unsupported gallery asset): neither /bill/new nor
      // /bill/capture (this hook's two callers) has an inline-error slot of
      // its own for "starting a bill" specifically, so Alert.alert is this
      // hook's established way of surfacing a failure without either caller
      // needing its own bespoke handling.
      Alert.alert(copy.global.genericErrorHeading, copy.global.storageFailure);
    }
  }

  return { pickFromGallery, startManual };
}
