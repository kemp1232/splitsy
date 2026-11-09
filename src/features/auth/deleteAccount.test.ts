jest.mock('@/lib/authClient', () => ({
  authClient: { deleteUser: jest.fn(), $store: { notify: jest.fn() } },
}));
jest.mock('@/features/bills/bill.service', () => ({
  resetAllLocalData: jest.fn(),
}));

import { resetAllLocalData } from '@/features/bills/bill.service';
import { authClient } from '@/lib/authClient';

import { deleteAccount } from './deleteAccount';

const deleteUser = authClient.deleteUser as unknown as jest.Mock;
const resetLocal = resetAllLocalData as unknown as jest.Mock;
const notify = authClient.$store.notify as unknown as jest.Mock;

describe('deleteAccount', () => {
  beforeEach(() => {
    deleteUser.mockReset();
    resetLocal.mockReset();
    notify.mockReset();
  });

  it('deletes the server account (session signal suppressed), resets local data, then signals the session refresh', async () => {
    const calls: string[] = [];
    notify.mockImplementation(() => {
      calls.push('sessionSignal');
    });
    deleteUser.mockImplementation(async () => {
      calls.push('deleteUser');
      return { data: { success: true }, error: null };
    });
    resetLocal.mockImplementation(() => {
      calls.push('resetAllLocalData');
    });

    await expect(deleteAccount('password1234')).resolves.toEqual({ ok: true });

    expect(deleteUser).toHaveBeenCalledWith({
      password: 'password1234',
      fetchOptions: { disableSignal: true },
    });
    expect(calls).toEqual(['deleteUser', 'resetAllLocalData', 'sessionSignal']);
    expect(notify).toHaveBeenCalledWith('$sessionSignal');
  });

  it('reports wrong_password and keeps local data when the password is rejected', async () => {
    deleteUser.mockResolvedValue({
      data: null,
      error: { status: 400, code: 'INVALID_PASSWORD', message: 'Invalid password' },
    });

    await expect(deleteAccount('nope')).resolves.toEqual({ ok: false, reason: 'wrong_password' });
    expect(resetLocal).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it('reports network and keeps local data when the request throws', async () => {
    deleteUser.mockRejectedValue(new TypeError('Network request failed'));

    await expect(deleteAccount('password1234')).resolves.toEqual({
      ok: false,
      reason: 'network',
    });
    expect(resetLocal).not.toHaveBeenCalled();
  });

  it('reports failed and keeps local data for any other server error', async () => {
    deleteUser.mockResolvedValue({ data: null, error: { status: 500, message: 'boom' } });

    await expect(deleteAccount('password1234')).resolves.toEqual({ ok: false, reason: 'failed' });
    expect(resetLocal).not.toHaveBeenCalled();
  });

  it('reports local_reset_failed without signalling the session refresh when the local wipe fails', async () => {
    deleteUser.mockResolvedValue({ data: { success: true }, error: null });
    resetLocal.mockImplementation(() => {
      throw new Error('db locked');
    });

    await expect(deleteAccount('password1234')).resolves.toEqual({
      ok: false,
      reason: 'local_reset_failed',
    });
    // Settings stays mounted to show the error (no SessionGate swap yet).
    expect(notify).not.toHaveBeenCalled();
  });
});
