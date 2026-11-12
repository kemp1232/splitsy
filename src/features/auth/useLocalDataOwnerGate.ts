import { useCallback, useEffect, useState } from 'react';

import { ensureLocalDataOwner } from './ensureLocalDataOwner';

export type LocalDataOwnerGate = {
  // True only once ensureLocalDataOwner has succeeded for the current user
  // id — the root layout's `hasSession`, so no data screen renders before it.
  verified: boolean;
  // The check failed for the current user id (and has not been retried).
  ownerCheckFailed: boolean;
  // Nothing left to wait for: signed out, verified, or failed.
  ownerResolved: boolean;
  retry: () => void;
};

/**
 * Account switch on one device (ensureLocalDataOwner.ts), for the root
 * layout's SessionGate: before any signed-in screen is shown for a user id,
 * that id is checked against the device's recorded data owner and, for a
 * different account, all local data is wiped first. Runs only after the
 * database is migrated (and any pending wipe finished — see RootNavigator).
 * Same-id refetches skip the check.
 */
export function useLocalDataOwnerGate({
  userId,
  migrationsReady,
}: {
  userId: string | null;
  migrationsReady: boolean;
}): LocalDataOwnerGate {
  const [verifiedUserId, setVerifiedUserId] = useState<string | null>(null);
  // The user id whose check last failed — kept per id, so a failure for one
  // account never shows up as an error for the next one to sign in.
  const [failedUserId, setFailedUserId] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!migrationsReady || userId === null || userId === verifiedUserId) return;
    let cancelled = false;
    void ensureLocalDataOwner(userId).then((outcome) => {
      if (cancelled) return;
      if (outcome === 'failed') {
        setFailedUserId(userId);
      } else {
        setVerifiedUserId(userId);
        // A success ends any earlier failure, so a stale one can't flash the
        // error screen while a later check for that id is still running.
        setFailedUserId(null);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [migrationsReady, userId, verifiedUserId, attempt]);

  const retry = useCallback(() => {
    setFailedUserId(null);
    setAttempt((previous) => previous + 1);
  }, []);

  const verified = userId !== null && userId === verifiedUserId;
  const ownerCheckFailed = userId !== null && userId === failedUserId && !verified;
  const ownerResolved = userId === null || verified || ownerCheckFailed;
  return { verified, ownerCheckFailed, ownerResolved, retry };
}
