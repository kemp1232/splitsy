import { wipeAllLocalData } from '@/features/bills/bill.service';

import { ensureLocalDataOwner } from './ensureLocalDataOwner';
import { getLocalDataOwner, setLocalDataOwner } from './localDataOwner';
import { clearPendingLocalWipe, setPendingLocalWipe } from './pendingLocalWipe';

jest.mock('@/features/bills/bill.service', () => ({
  wipeAllLocalData: jest.fn(),
}));
jest.mock('./localDataOwner', () => ({
  getLocalDataOwner: jest.fn(),
  setLocalDataOwner: jest.fn(),
}));
jest.mock('./pendingLocalWipe', () => ({
  setPendingLocalWipe: jest.fn(),
  clearPendingLocalWipe: jest.fn(),
}));

const wipeLocal = wipeAllLocalData as unknown as jest.Mock;
const getOwner = getLocalDataOwner as unknown as jest.Mock;
const setOwner = setLocalDataOwner as unknown as jest.Mock;
const setMarker = setPendingLocalWipe as unknown as jest.Mock;
const clearMarker = clearPendingLocalWipe as unknown as jest.Mock;

describe('ensureLocalDataOwner', () => {
  const calls: string[] = [];

  beforeEach(() => {
    calls.length = 0;
    getOwner.mockReset();
    wipeLocal.mockReset().mockImplementation(() => {
      calls.push('wipeAllLocalData');
    });
    setOwner.mockReset().mockImplementation(async (id: string) => {
      calls.push(`setOwner:${id}`);
    });
    setMarker.mockReset().mockImplementation(async () => {
      calls.push('setMarker');
    });
    clearMarker.mockReset().mockImplementation(async () => {
      calls.push('clearMarker');
    });
  });

  it('records the signed-in user as owner without wiping when no owner is recorded yet', async () => {
    getOwner.mockResolvedValue(null);

    await expect(ensureLocalDataOwner('user-a')).resolves.toBe('recorded');
    expect(calls).toEqual(['setOwner:user-a']);
  });

  it('keeps local data when the same user signs in again', async () => {
    getOwner.mockResolvedValue('user-a');

    await expect(ensureLocalDataOwner('user-a')).resolves.toBe('kept');
    expect(calls).toEqual([]);
  });

  it('sets the wipe marker, wipes all local data, clears the marker, then records the new owner when a different user signs in', async () => {
    getOwner.mockResolvedValue('user-a');

    await expect(ensureLocalDataOwner('user-b')).resolves.toBe('wiped');
    expect(calls).toEqual(['setMarker', 'wipeAllLocalData', 'clearMarker', 'setOwner:user-b']);
  });

  it('returns failed, keeps the marker and does not record the new owner when the wipe fails', async () => {
    getOwner.mockResolvedValue('user-a');
    wipeLocal.mockImplementation(() => {
      throw new Error('db locked');
    });

    await expect(ensureLocalDataOwner('user-b')).resolves.toBe('failed');
    expect(calls).toEqual(['setMarker']);
    expect(clearMarker).not.toHaveBeenCalled();
    expect(setOwner).not.toHaveBeenCalled();
  });

  it('returns failed without wiping when the recorded owner cannot be read', async () => {
    getOwner.mockRejectedValue(new Error('storage unavailable'));

    await expect(ensureLocalDataOwner('user-b')).resolves.toBe('failed');
    expect(wipeLocal).not.toHaveBeenCalled();
    expect(setOwner).not.toHaveBeenCalled();
  });

  it('returns failed without wiping when the marker cannot be persisted', async () => {
    getOwner.mockResolvedValue('user-a');
    setMarker.mockRejectedValue(new Error('storage unavailable'));

    await expect(ensureLocalDataOwner('user-b')).resolves.toBe('failed');
    expect(wipeLocal).not.toHaveBeenCalled();
    expect(setOwner).not.toHaveBeenCalled();
  });
});
