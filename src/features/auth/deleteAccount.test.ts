import { resetAllLocalData, wipeAllLocalData } from '@/features/bills/bill.service';
import { authClient } from '@/lib/authClient';

import { deleteAccount } from './deleteAccount';
import { clearPendingLocalWipe, setPendingLocalWipe } from './pendingLocalWipe';

jest.mock('@/lib/authClient', () => ({
  authClient: { deleteUser: jest.fn(), $store: { notify: jest.fn() } },
}));
jest.mock('@/features/bills/bill.service', () => ({
  resetAllLocalData: jest.fn(),
  wipeAllLocalData: jest.fn(),
}));
jest.mock('./pendingLocalWipe', () => ({
  setPendingLocalWipe: jest.fn(),
  clearPendingLocalWipe: jest.fn(),
}));

const deleteUser = authClient.deleteUser as unknown as jest.Mock;
const wipeLocal = wipeAllLocalData as unknown as jest.Mock;
const billsOnlyReset = resetAllLocalData as unknown as jest.Mock;
const notify = authClient.$store.notify as unknown as jest.Mock;
const setMarker = setPendingLocalWipe as unknown as jest.Mock;
const clearMarker = clearPendingLocalWipe as unknown as jest.Mock;

describe('deleteAccount', () => {
  const calls: string[] = [];

  beforeEach(() => {
    calls.length = 0;
    deleteUser.mockReset();
    wipeLocal.mockReset();
    billsOnlyReset.mockReset();
    notify.mockReset().mockImplementation(() => {
      calls.push('sessionSignal');
    });
    setMarker.mockReset().mockImplementation(async () => {
      calls.push('setMarker');
    });
    clearMarker.mockReset().mockImplementation(async () => {
      calls.push('clearMarker');
    });
  });

  it('persists the wipe marker, deletes the server account (signal suppressed), resets local data, clears the marker, then signals the session refresh', async () => {
    deleteUser.mockImplementation(async () => {
      calls.push('deleteUser');
      return { data: { success: true }, error: null };
    });
    wipeLocal.mockImplementation(() => {
      calls.push('wipeAllLocalData');
    });

    await expect(deleteAccount('password1234')).resolves.toEqual({ ok: true });

    expect(deleteUser).toHaveBeenCalledWith({
      password: 'password1234',
      fetchOptions: { disableSignal: true },
    });
    expect(calls).toEqual([
      'setMarker',
      'deleteUser',
      'wipeAllLocalData',
      'clearMarker',
      'sessionSignal',
    ]);
    expect(notify).toHaveBeenCalledWith('$sessionSignal');
    // The full wipe (trips included), never Settings' bills-only reset.
    expect(billsOnlyReset).not.toHaveBeenCalled();
  });

  it('reports wrong_password, keeps local data and clears the marker when the password is rejected', async () => {
    deleteUser.mockResolvedValue({
      data: null,
      error: { status: 400, code: 'INVALID_PASSWORD', message: 'Invalid password' },
    });

    await expect(deleteAccount('nope')).resolves.toEqual({ ok: false, reason: 'wrong_password' });
    expect(wipeLocal).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
    expect(calls).toEqual(['setMarker', 'clearMarker']);
  });

  it('reports network, keeps local data and clears the marker when the request throws', async () => {
    deleteUser.mockRejectedValue(new TypeError('Network request failed'));

    await expect(deleteAccount('password1234')).resolves.toEqual({
      ok: false,
      reason: 'network',
    });
    expect(wipeLocal).not.toHaveBeenCalled();
    expect(calls).toEqual(['setMarker', 'clearMarker']);
  });

  it('reports failed and keeps local data for any other server error', async () => {
    deleteUser.mockResolvedValue({ data: null, error: { status: 500, message: 'boom' } });

    await expect(deleteAccount('password1234')).resolves.toEqual({ ok: false, reason: 'failed' });
    expect(wipeLocal).not.toHaveBeenCalled();
    expect(clearMarker).toHaveBeenCalled();
  });

  it('does not delete the server account when the wipe marker cannot be persisted', async () => {
    setMarker.mockRejectedValue(new Error('storage unavailable'));

    await expect(deleteAccount('password1234')).resolves.toEqual({ ok: false, reason: 'failed' });
    expect(deleteUser).not.toHaveBeenCalled();
    expect(wipeLocal).not.toHaveBeenCalled();
  });

  it('reports local_reset_failed, keeps the marker for the startup retry, and does not signal the session refresh', async () => {
    deleteUser.mockResolvedValue({ data: { success: true }, error: null });
    wipeLocal.mockImplementation(() => {
      throw new Error('db locked');
    });

    await expect(deleteAccount('password1234')).resolves.toEqual({
      ok: false,
      reason: 'local_reset_failed',
    });
    // Settings stays mounted to show the error (no SessionGate swap yet).
    expect(notify).not.toHaveBeenCalled();
    expect(clearMarker).not.toHaveBeenCalled();
  });
});
