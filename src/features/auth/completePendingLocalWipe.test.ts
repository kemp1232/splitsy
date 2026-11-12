import { resetAllLocalData, wipeAllLocalData } from '@/features/bills/bill.service';

import { completePendingLocalWipe } from './completePendingLocalWipe';
import { clearPendingLocalWipe, hasPendingLocalWipe } from './pendingLocalWipe';

jest.mock('@/features/bills/bill.service', () => ({
  resetAllLocalData: jest.fn(),
  wipeAllLocalData: jest.fn(),
}));
jest.mock('./pendingLocalWipe', () => ({
  hasPendingLocalWipe: jest.fn(),
  clearPendingLocalWipe: jest.fn(),
}));

const wipeLocal = wipeAllLocalData as unknown as jest.Mock;
const billsOnlyReset = resetAllLocalData as unknown as jest.Mock;
const hasMarker = hasPendingLocalWipe as unknown as jest.Mock;
const clearMarker = clearPendingLocalWipe as unknown as jest.Mock;

describe('completePendingLocalWipe', () => {
  beforeEach(() => {
    wipeLocal.mockReset();
    billsOnlyReset.mockReset();
    hasMarker.mockReset();
    clearMarker.mockReset().mockResolvedValue(undefined);
  });

  it('does nothing when no wipe is pending', async () => {
    hasMarker.mockResolvedValue(false);

    await expect(completePendingLocalWipe()).resolves.toBe('none');
    expect(wipeLocal).not.toHaveBeenCalled();
    expect(clearMarker).not.toHaveBeenCalled();
  });

  it('wipes local data and then clears the marker when a wipe is pending', async () => {
    const calls: string[] = [];
    hasMarker.mockResolvedValue(true);
    wipeLocal.mockImplementation(() => {
      calls.push('wipeAllLocalData');
    });
    clearMarker.mockImplementation(async () => {
      calls.push('clearMarker');
    });

    await expect(completePendingLocalWipe()).resolves.toBe('wiped');
    expect(calls).toEqual(['wipeAllLocalData', 'clearMarker']);
    // The full wipe (trips included), never Settings' bills-only reset.
    expect(billsOnlyReset).not.toHaveBeenCalled();
  });

  it('keeps the marker (for the next start) and never throws when the wipe fails again', async () => {
    hasMarker.mockResolvedValue(true);
    wipeLocal.mockImplementation(() => {
      throw new Error('db locked');
    });

    await expect(completePendingLocalWipe()).resolves.toBe('failed');
    expect(clearMarker).not.toHaveBeenCalled();
  });
});
