import { useLocalSearchParams, useRouter } from 'expo-router';
import { Alert } from 'react-native';

import { copy } from '@/constants/copy';
import { createBillInTrip } from '@/features/trips/trip.service';

import { createDraftBill } from './bill.service';
import { createGalleryBill, pickGalleryImageUri } from './galleryBill';

type BillSourceActionsParams = {
  // Trip feature addition (not from the numbered MVP spec): when this hook
  // is reached from a trip's "add bill" entry point, /bill/new and
  // /bill/capture (this hook's two callers) both forward their own
  // `tripId` route param down to here unchanged, so a gallery pick or
  // manual start creates its bill inside that trip.
  tripId?: string;
};

// Shared by /bill/new (primary entry points) and /bill/capture (fallbacks off
// the camera-permission screen) so the gallery-pick and manual-start logic
// only exists once.
export function useBillSourceActions() {
  const router = useRouter();
  const { tripId } = useLocalSearchParams<BillSourceActionsParams>();

  // Gallery picks skip /bill/preview ("Check the photo") and go straight to
  // processing; rotating and re-picking there were the only things preview
  // offered, and receipt-review now has its own "Choose another" instead.
  // router.push (not replace) keeps the caller under processing, so its
  // "Use another photo" (router.back()) still lands back here, the same
  // place it did when preview replaced itself with processing.
  async function pickFromGallery() {
    const imageUri = await pickGalleryImageUri();
    if (!imageUri) return;

    try {
      const bill = await createGalleryBill(imageUri, tripId);
      router.push({ pathname: '/bill/processing', params: { billId: bill.id } });
    } catch {
      // Same failure Alert preview.tsx's "Use this photo" shows for this
      // exact copy-then-create step.
      Alert.alert(copy.global.genericErrorHeading, copy.global.imageCopyFailure);
    }
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
