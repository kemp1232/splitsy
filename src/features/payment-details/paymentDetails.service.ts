import { appSettingsRepository } from '@/db/repositories/appSettings.repository';
import {
  copyImageToAppStorage,
  deleteStoredImage,
} from '@/features/receipt-capture/receiptImage.service';

import { normalizePhMobileNumber } from './phMobileNumber';

// The user's own payment details (spec Amendment 2026-11-12), stored on this
// device only in app_settings. Numbers are stored normalized (09XXXXXXXXX);
// a missing row means "not set".
//
// The QR image is copied into the same app-owned image storage as receipt
// photos (receiptImage.service.ts / .web.ts) on purpose: that storage is
// removed in full by both "Delete all local data" (resetAllLocalData) and the
// account wipe (wipeAllLocalData), together with the app_settings rows, so
// this personal data needs no separate cleanup path. Nothing else deletes
// files there except by their exact uri (deleteBill).
export const PAYMENT_SETTINGS_KEYS = {
  gcashNumber: 'payment.gcash_number',
  mayaNumber: 'payment.maya_number',
  qrImageUri: 'payment.qr_image_uri',
} as const;

export type PaymentDetails = {
  gcashNumber: string | null;
  mayaNumber: string | null;
  qrImageUri: string | null;
};

export type PaymentNumberField = 'gcash' | 'maya';

export async function getPaymentDetails(): Promise<PaymentDetails> {
  const values = await appSettingsRepository.getMany(Object.values(PAYMENT_SETTINGS_KEYS));
  return {
    gcashNumber: values.get(PAYMENT_SETTINGS_KEYS.gcashNumber) ?? null,
    mayaNumber: values.get(PAYMENT_SETTINGS_KEYS.mayaNumber) ?? null,
    qrImageUri: values.get(PAYMENT_SETTINGS_KEYS.qrImageUri) ?? null,
  };
}

async function saveNumber(key: string, normalized: string | null): Promise<void> {
  if (normalized === null) {
    await appSettingsRepository.remove(key);
  } else {
    await appSettingsRepository.set(key, normalized);
  }
}

// Validates both numbers again (never trusts the caller) and writes nothing
// at all if either is invalid. An empty field removes that number.
export async function savePaymentNumbers(input: {
  gcash: string;
  maya: string;
}): Promise<{ ok: true } | { ok: false; invalid: PaymentNumberField[] }> {
  const gcash = normalizePhMobileNumber(input.gcash);
  const maya = normalizePhMobileNumber(input.maya);
  if (!gcash.ok || !maya.ok) {
    const invalid: PaymentNumberField[] = [];
    if (!gcash.ok) invalid.push('gcash');
    if (!maya.ok) invalid.push('maya');
    return { ok: false, invalid };
  }

  await saveNumber(PAYMENT_SETTINGS_KEYS.gcashNumber, gcash.value);
  await saveNumber(PAYMENT_SETTINGS_KEYS.mayaNumber, maya.value);
  return { ok: true };
}

async function deleteImageQuietly(uri: string | null): Promise<void> {
  if (!uri) return;
  try {
    await deleteStoredImage(uri);
  } catch {
    // Best effort: an orphaned file is still removed by the next local wipe.
  }
}

// Copies a picked image into app storage (a picker uri may not survive a
// restart), points the setting at the copy, then deletes the previous copy.
export async function saveQrImage(pickedUri: string): Promise<string> {
  const previous = (await getPaymentDetails()).qrImageUri;
  const storedUri = await copyImageToAppStorage(pickedUri);
  await appSettingsRepository.set(PAYMENT_SETTINGS_KEYS.qrImageUri, storedUri);
  if (previous !== storedUri) await deleteImageQuietly(previous);
  return storedUri;
}

export async function removeQrImage(): Promise<void> {
  const previous = (await getPaymentDetails()).qrImageUri;
  await appSettingsRepository.remove(PAYMENT_SETTINGS_KEYS.qrImageUri);
  await deleteImageQuietly(previous);
}
