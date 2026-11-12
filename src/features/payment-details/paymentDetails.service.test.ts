import { appSettingsRepository } from '@/db/repositories/appSettings.repository';
import {
  copyImageToAppStorage,
  deleteStoredImage,
} from '@/features/receipt-capture/receiptImage.service';

import {
  getPaymentDetails,
  PAYMENT_SETTINGS_KEYS,
  removeQrImage,
  saveQrImage,
  savePaymentNumbers,
} from './paymentDetails.service';

jest.mock('@/db/repositories/appSettings.repository', () => ({
  appSettingsRepository: { getMany: jest.fn(), set: jest.fn(), remove: jest.fn() },
}));
jest.mock('@/features/receipt-capture/receiptImage.service', () => ({
  copyImageToAppStorage: jest.fn(),
  deleteStoredImage: jest.fn(),
}));

const getMany = appSettingsRepository.getMany as jest.Mock;
const set = appSettingsRepository.set as jest.Mock;
const remove = appSettingsRepository.remove as jest.Mock;
const copyImage = copyImageToAppStorage as jest.Mock;
const deleteImage = deleteStoredImage as jest.Mock;

describe('paymentDetails.service', () => {
  const calls: string[] = [];

  beforeEach(() => {
    jest.clearAllMocks();
    calls.length = 0;
    getMany.mockResolvedValue(new Map());
    set.mockImplementation(async (key: string, value: string) => {
      calls.push(`set ${key}=${value}`);
    });
    remove.mockImplementation(async (key: string) => {
      calls.push(`remove ${key}`);
    });
    copyImage.mockImplementation(async (uri: string) => {
      calls.push(`copy ${uri}`);
      return 'file:///receipts/new-qr.png';
    });
    deleteImage.mockImplementation(async (uri: string) => {
      calls.push(`delete ${uri}`);
    });
  });

  it('reads saved values from app_settings, null when missing', async () => {
    getMany.mockResolvedValue(new Map([[PAYMENT_SETTINGS_KEYS.gcashNumber, '09171234567']]));

    await expect(getPaymentDetails()).resolves.toEqual({
      gcashNumber: '09171234567',
      mayaNumber: null,
      qrImageUri: null,
    });
  });

  it('saves normalized numbers and removes a cleared one', async () => {
    await expect(savePaymentNumbers({ gcash: '+63 917 123 4567', maya: '  ' })).resolves.toEqual({
      ok: true,
    });

    expect(calls).toEqual([
      `set ${PAYMENT_SETTINGS_KEYS.gcashNumber}=09171234567`,
      `remove ${PAYMENT_SETTINGS_KEYS.mayaNumber}`,
    ]);
  });

  it('never writes anything when a number is invalid', async () => {
    await expect(savePaymentNumbers({ gcash: '09171234567', maya: '0917abc' })).resolves.toEqual({
      ok: false,
      invalid: ['maya'],
    });

    expect(set).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

  it('replacing the QR copies the new image, saves it, then deletes the old copy', async () => {
    getMany.mockResolvedValue(
      new Map([[PAYMENT_SETTINGS_KEYS.qrImageUri, 'file:///receipts/old-qr.png']]),
    );

    await expect(saveQrImage('file:///cache/picked.png')).resolves.toBe(
      'file:///receipts/new-qr.png',
    );

    expect(calls).toEqual([
      'copy file:///cache/picked.png',
      `set ${PAYMENT_SETTINGS_KEYS.qrImageUri}=file:///receipts/new-qr.png`,
      'delete file:///receipts/old-qr.png',
    ]);
  });

  it('saving the first QR deletes nothing', async () => {
    await saveQrImage('file:///cache/picked.png');

    expect(deleteImage).not.toHaveBeenCalled();
  });

  it('removing the QR removes the setting and the stored file', async () => {
    getMany.mockResolvedValue(
      new Map([[PAYMENT_SETTINGS_KEYS.qrImageUri, 'file:///receipts/old-qr.png']]),
    );

    await removeQrImage();

    expect(calls).toEqual([
      `remove ${PAYMENT_SETTINGS_KEYS.qrImageUri}`,
      'delete file:///receipts/old-qr.png',
    ]);
  });

  it('still clears the setting when the stored file cannot be deleted', async () => {
    getMany.mockResolvedValue(
      new Map([[PAYMENT_SETTINGS_KEYS.qrImageUri, 'file:///receipts/old-qr.png']]),
    );
    deleteImage.mockRejectedValue(new Error('io'));

    await expect(removeQrImage()).resolves.toBeUndefined();
    expect(remove).toHaveBeenCalledWith(PAYMENT_SETTINGS_KEYS.qrImageUri);
  });
});
