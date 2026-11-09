import { resetAllLocalData } from '@/features/bills/bill.service';
import { authClient } from '@/lib/authClient';

export type DeleteAccountFailure = 'wrong_password' | 'network' | 'failed' | 'local_reset_failed';

export type DeleteAccountResult = { ok: true } | { ok: false; reason: DeleteAccountFailure };

/**
 * Settings > Delete account (2026-11-09 spec Amendment, decision D3): deletes
 * the server account first (Better Auth's /delete-user, password-verified
 * server-side), and only then wipes this device's local data via the same
 * resetAllLocalData "Delete all local data" uses. Nothing local is touched if
 * the server delete fails, so a wrong password or a network error leaves
 * everything as it was.
 *
 * The signed-out transition is deferred until the local wipe has finished:
 * Better Auth's client would normally refresh its session right after
 * /delete-user (it's in the client's session-signal path list), letting the
 * root SessionGate unmount Settings mid-wipe. `disableSignal` suppresses that,
 * and the session signal is fired explicitly only after resetAllLocalData
 * succeeds — SessionGate then swaps to the (auth) screens, same as sign-out.
 * If the wipe fails, the signal is not fired, so Settings stays mounted to
 * show the error (pointing at "Delete all local data"); any later session
 * refresh signs the user out, since the server cleared the session cookie.
 * Native caveat: the Expo plugin itself also notifies when the stored session
 * cookie changes, but native resetAllLocalData is synchronous and runs before
 * that notification's get-session round trip can complete.
 *
 * The password is only ever passed to authClient — never logged or stored.
 */
export async function deleteAccount(password: string): Promise<DeleteAccountResult> {
  try {
    const { error } = await authClient.deleteUser({
      password,
      fetchOptions: { disableSignal: true },
    });
    if (error) {
      if (error.code === 'INVALID_PASSWORD') return { ok: false, reason: 'wrong_password' };
      // better-fetch reports a request that never got a response as status 0.
      if (!error.status) return { ok: false, reason: 'network' };
      return { ok: false, reason: 'failed' };
    }
  } catch {
    return { ok: false, reason: 'network' };
  }

  try {
    await resetAllLocalData();
  } catch {
    return { ok: false, reason: 'local_reset_failed' };
  }
  authClient.$store.notify('$sessionSignal');
  return { ok: true };
}
