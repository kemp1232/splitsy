import * as ImagePicker from 'expo-image-picker';

import { copy } from '@/constants/copy';
import type { Bill } from '@/db/repositories/bills.repository';
import { copyImageToAppStorage } from '@/features/receipt-capture/receiptImage.service';
import { createBillInTrip } from '@/features/trips/trip.service';
import { showAlert } from '@/lib/alert';

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
    showAlert(copy.cameraPermission.heading, copy.cameraPermission.permanentDenialBody);
    return null;
  }

  let result: ImagePicker.ImagePickerResult;
  try {
    result = await ImagePicker.launchImageLibraryAsync({ quality: 1 });
  } catch (error) {
    // expo-image-picker's web implementation throws "Unsupported file type"
    // when the browser's file dialog returns a non-image file — same message
    // as an unusable asset below. Any other picker failure gets the generic
    // error copy. Either way it's a message, not an uncaught rejection.
    const unsupported = error instanceof Error && error.message.includes('Unsupported file type');
    showAlert(
      copy.global.genericErrorHeading,
      unsupported ? copy.global.unsupportedImage : copy.global.genericErrorBody,
    );
    return null;
  }
  const asset = result.assets?.[0];
  if (result.canceled || !asset) return null;
  if (!asset.uri) {
    showAlert(copy.global.genericErrorHeading, copy.global.unsupportedImage);
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
