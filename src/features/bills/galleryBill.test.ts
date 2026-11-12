import * as ImagePicker from 'expo-image-picker';

import { copy } from '@/constants/copy';
import { copyImageToAppStorage } from '@/features/receipt-capture/receiptImage.service';
import { createBillInTrip } from '@/features/trips/trip.service';
import { showAlert } from '@/lib/alert';

import { createDraftBill } from './bill.service';
import { createGalleryBill, pickGalleryImageUri } from './galleryBill';

// The services are mocked at module level so expo-sqlite / expo-file-system
// (native modules with no Jest implementation) are never loaded. These tests
// only cover what galleryBill.ts itself decides.
jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));
jest.mock('@/features/receipt-capture/receiptImage.service', () => ({
  copyImageToAppStorage: jest.fn(),
}));
jest.mock('@/features/trips/trip.service', () => ({ createBillInTrip: jest.fn() }));
jest.mock('./bill.service', () => ({ createDraftBill: jest.fn() }));
jest.mock('@/lib/alert', () => ({ showAlert: jest.fn() }));

const requestPermission = ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock;
const launchLibrary = ImagePicker.launchImageLibraryAsync as jest.Mock;
const copyImage = copyImageToAppStorage as jest.Mock;
const createInTrip = createBillInTrip as jest.Mock;
const createDraft = createDraftBill as jest.Mock;

const alertSpy = showAlert as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('pickGalleryImageUri', () => {
  it('returns null and alerts when media-library permission is denied', async () => {
    requestPermission.mockResolvedValue({ granted: false });

    await expect(pickGalleryImageUri()).resolves.toBeNull();
    expect(launchLibrary).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledWith(
      copy.cameraPermission.heading,
      copy.cameraPermission.permanentDenialBody,
    );
  });

  it('returns null without alerting when the picker is cancelled', async () => {
    requestPermission.mockResolvedValue({ granted: true });
    launchLibrary.mockResolvedValue({ canceled: true, assets: null });

    await expect(pickGalleryImageUri()).resolves.toBeNull();
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('returns null and alerts when the picked asset has no uri', async () => {
    requestPermission.mockResolvedValue({ granted: true });
    launchLibrary.mockResolvedValue({ canceled: false, assets: [{ uri: '' }] });

    await expect(pickGalleryImageUri()).resolves.toBeNull();
    expect(alertSpy).toHaveBeenCalledWith(
      copy.global.genericErrorHeading,
      copy.global.unsupportedImage,
    );
  });

  it('returns null and alerts instead of throwing when the picker rejects a non-image file', async () => {
    requestPermission.mockResolvedValue({ granted: true });
    launchLibrary.mockRejectedValue(new Error('Unsupported file type'));

    await expect(pickGalleryImageUri()).resolves.toBeNull();
    expect(alertSpy).toHaveBeenCalledWith(
      copy.global.genericErrorHeading,
      copy.global.unsupportedImage,
    );
  });

  it('returns null and shows the generic error when the picker fails for another reason', async () => {
    requestPermission.mockResolvedValue({ granted: true });
    launchLibrary.mockRejectedValue(new Error('Picker crashed'));

    await expect(pickGalleryImageUri()).resolves.toBeNull();
    expect(alertSpy).toHaveBeenCalledWith(
      copy.global.genericErrorHeading,
      copy.global.genericErrorBody,
    );
  });

  it('returns the picked asset uri', async () => {
    requestPermission.mockResolvedValue({ granted: true });
    launchLibrary.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///picked.jpg' }] });

    await expect(pickGalleryImageUri()).resolves.toBe('file:///picked.jpg');
    expect(alertSpy).not.toHaveBeenCalled();
  });
});

describe('createGalleryBill', () => {
  const expectedInput = {
    entryMethod: 'GALLERY',
    receiptImageUri: 'file:///app/receipts/copy.jpg',
    originalReceiptImageUri: 'file:///app/receipts/copy.jpg',
  };

  beforeEach(() => {
    copyImage.mockResolvedValue('file:///app/receipts/copy.jpg');
  });

  it('creates a standalone GALLERY draft from the app-storage copy when there is no trip', async () => {
    createDraft.mockResolvedValue({ id: 'bill-1' });

    await expect(createGalleryBill('file:///picked.jpg')).resolves.toEqual({ id: 'bill-1' });
    expect(copyImage).toHaveBeenCalledWith('file:///picked.jpg');
    expect(createDraft).toHaveBeenCalledWith(expectedInput);
    expect(createInTrip).not.toHaveBeenCalled();
  });

  it('treats a null tripId as no trip', async () => {
    createDraft.mockResolvedValue({ id: 'bill-1' });

    await createGalleryBill('file:///picked.jpg', null);
    expect(createDraft).toHaveBeenCalledWith(expectedInput);
    expect(createInTrip).not.toHaveBeenCalled();
  });

  it('creates the GALLERY bill inside the trip when a tripId is given', async () => {
    createInTrip.mockResolvedValue({ id: 'bill-2' });

    await expect(createGalleryBill('file:///picked.jpg', 'trip-1')).resolves.toEqual({
      id: 'bill-2',
    });
    expect(createInTrip).toHaveBeenCalledWith('trip-1', expectedInput);
    expect(createDraft).not.toHaveBeenCalled();
  });

  it('rejects and creates no bill when copying the image fails', async () => {
    copyImage.mockRejectedValue(new Error('copy failed'));

    await expect(createGalleryBill('file:///picked.jpg', 'trip-1')).rejects.toThrow('copy failed');
    expect(createDraft).not.toHaveBeenCalled();
    expect(createInTrip).not.toHaveBeenCalled();
  });
});
