import { wipeAllLocalData } from '@/features/bills/bill.service';

import { getLocalDataOwner, setLocalDataOwner } from './localDataOwner';
import { clearPendingLocalWipe, setPendingLocalWipe } from './pendingLocalWipe';

export type LocalDataOwnerOutcome = 'recorded' | 'kept' | 'wiped' | 'failed';

/**
 * Run by the root layout's SessionGate for every signed-in user id before any
 * signed-in screen is shown. Local data belongs to one account per device:
 * - no owner recorded yet (first sign-in, or a build that never recorded
 *   one): this user becomes the owner, nothing is wiped;
 * - same owner (e.g. log out, then back in): everything is kept;
 * - a different owner: ALL local data is wiped (wipeAllLocalData) before the
 *   new user becomes the owner.
 *
 * The switch wipe reuses the pending-wipe marker (pendingLocalWipe.ts): set
 * before the wipe, cleared after it, so an interrupted wipe is finished by
 * completePendingLocalWipe on the next start. The new owner is recorded last,
 * so any failure leaves the old owner in place and the next attempt wipes
 * again. Never throws: 'failed' means the caller must not show local data.
 */
export async function ensureLocalDataOwner(userId: string): Promise<LocalDataOwnerOutcome> {
  try {
    const owner = await getLocalDataOwner();
    if (owner === userId) return 'kept';
    if (owner === null) {
      await setLocalDataOwner(userId);
      return 'recorded';
    }
    await setPendingLocalWipe();
    await wipeAllLocalData();
    await clearPendingLocalWipe();
    await setLocalDataOwner(userId);
    return 'wiped';
  } catch {
    return 'failed';
  }
}
