import { resetAllLocalData } from '@/features/bills/bill.service';

import { clearPendingLocalWipe, hasPendingLocalWipe } from './pendingLocalWipe';

export type PendingLocalWipeOutcome = 'none' | 'wiped' | 'failed';

/**
 * Startup retry for an account deletion whose local wipe didn't finish (see
 * deleteAccount.ts and pendingLocalWipe.ts). Run by the root layout once the
 * local database is migrated, before any screen can read bills. Never throws:
 * on failure the marker stays set and the wipe is retried on the next start.
 */
export async function completePendingLocalWipe(): Promise<PendingLocalWipeOutcome> {
  try {
    if (!(await hasPendingLocalWipe())) return 'none';
    await resetAllLocalData();
    await clearPendingLocalWipe();
    return 'wiped';
  } catch {
    return 'failed';
  }
}
