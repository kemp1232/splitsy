import * as ImagePicker from 'expo-image-picker';
import { Alert } from 'react-native';

import { copy } from '@/constants/copy';
import type { Bill } from '@/db/repositories/bills.repository';
import { copyImageToAppStorage } from '@/features/receipt-capture/receiptImage.service';
import { createBillInTrip } from '@/features/trips/trip.service';

import { createDraftBill } from './bill.service';

// Gallery picks skip /bill/preview ("Check the photo") and go straight to
// processing, so the pick + copy + create steps that preview's "Use this
// photo" used to own live here instead. They're shared by
// useBillSourceActions's pickFromGallery and receipt-review's "Choose
// another". The work is split in two because those callers handle failures
// differently: a cancelled or unusable pick is a silent no-op (or an Alert
// raised here), while a failed copy/create throws so each caller can decide
// what to do (receipt-review has to keep the old bill when that happens).
// Only existing exported functions are composed here, and Metro resolves
// their .web variants, so this file needs no .web sibling of its own.

// Returns null when there is nothing to use: permission denied, picker
// cancelled, or an asset without a uri. The first and last raise the same
// Alerts that useBillSourceActions raised before this was pulled out.
export async function pickGalleryImageUri(): Promise<string | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    Alert.alert(copy.cameraPermission.heading, copy.cameraPermission.permanentDenialBody);
    return null;
  }

  const result = await ImagePicker.launchImageLibraryAsync({ quality: 1 });
  const asset = result.assets?.[0];
  if (result.canceled || !asset) return null;
  if (!asset.uri) {
    Alert.alert(copy.global.genericErrorHeading, copy.global.unsupportedImage);
    return null;
  }
  return asset.uri;
}

// Same steps as preview.tsx's handleUseThisPhoto: copy the picked image into
// app storage first, so the bill never points at a picker/cache uri that
// the OS may clear, then create the draft (inside the trip when there is
// one). Throws on failure; nothing is created when the copy fails.
export async function createGalleryBill(imageUri: string, tripId?: string | null): Promise<Bill> {
  const appUri = await copyImageToAppStorage(imageUri);
  const draftInput = {
    entryMethod: 'GALLERY' as const,
    receiptImageUri: appUri,
    originalReceiptImageUri: appUri,
  };
  return tripId ? createBillInTrip(tripId, draftInput) : createDraftBill(draftInput);
}
