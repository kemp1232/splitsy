import { wipeAllLocalData } from '@/features/bills/bill.service';
import { authClient } from '@/lib/authClient';

import { clearPendingLocalWipe, setPendingLocalWipe } from './pendingLocalWipe';

export type DeleteAccountFailure = 'wrong_password' | 'network' | 'failed' | 'local_reset_failed';

export type DeleteAccountResult = { ok: true } | { ok: false; reason: DeleteAccountFailure };

/**
 * Settings > Delete account (2026-11-09 spec Amendment, decision D3): deletes
 * the server account first (Better Auth's /delete-user, password-verified
 * server-side), and only then wipes ALL of this device's local data, trips
 * and their member lists included, via wipeAllLocalData (Settings' "Delete
 * all local data" uses resetAllLocalData, which keeps trips). Nothing local is touched if
 * the server delete fails, so a wrong password or a network error leaves
 * everything as it was.
 *
 * The wipe is durable: a "pending local wipe" marker (pendingLocalWipe.ts) is
 * persisted BEFORE the server delete, cleared again if that delete fails, and
 * cleared after wipeAllLocalData succeeds. If the wipe fails — or the app is
 * closed in between — the root layout retries it on the next start
 * (completePendingLocalWipe.ts) before any screen can read bills.
 *
 * The signed-out transition is deferred until the local wipe has finished:
 * Better Auth's client would normally refresh its session right after
 * /delete-user (it's in the client's session-signal path list), letting the
 * root SessionGate unmount Settings mid-wipe. `disableSignal` suppresses that,
 * and the session signal is fired explicitly only after wipeAllLocalData
 * succeeds — SessionGate then swaps to the (auth) screens, same as sign-out.
 * If the wipe fails, the signal is not fired, so Settings stays mounted to
 * show the error; any later session refresh signs the user out, since the
 * server cleared the session cookie. Native caveat: the Expo plugin itself
 * also notifies when the stored session cookie changes, so on native the
 * error may only show briefly — the persisted marker is what guarantees the
 * wipe still happens.
 *
 * The password is only ever passed to authClient — never logged or stored.
 */
export async function deleteAccount(password: string): Promise<DeleteAccountResult> {
  try {
    await setPendingLocalWipe();
  } catch {
    // Without the marker the wipe wouldn't be durable — don't delete yet.
    return { ok: false, reason: 'failed' };
  }

  // The server account still exists on every failure path below, so the
  // marker must not trigger a wipe on the next start.
  const abandonWipe = () => clearPendingLocalWipe().catch(() => {});
  try {
    const { error } = await authClient.deleteUser({
      password,
      fetchOptions: { disableSignal: true },
    });
    if (error) {
      await abandonWipe();
      if (error.code === 'INVALID_PASSWORD') return { ok: false, reason: 'wrong_password' };
      // better-fetch reports a request that never got a response as status 0.
      if (!error.status) return { ok: false, reason: 'network' };
      return { ok: false, reason: 'failed' };
    }
  } catch {
    await abandonWipe();
    return { ok: false, reason: 'network' };
  }

  try {
    await wipeAllLocalData();
  } catch {
    // Marker stays set: retried on the next app start.
    return { ok: false, reason: 'local_reset_failed' };
  }
  // Best effort: if clearing fails (a storage write error), the next start
  // wipes local data once more — anything saved on this device before that
  // restart would be lost, which is preferred over a wipe that never happens.
  await clearPendingLocalWipe().catch(() => {});
  authClient.$store.notify('$sessionSignal');
  return { ok: true };
}
