import { useSyncExternalStore } from 'react';

import { getRestoringBillIds, subscribeRestoringBillIds } from './billEditSession';

// The ids of bills whose edit restore (restoreUnchangedBillEdits) is still
// running — their Edit action stays disabled until it settles, so an Edit
// can't start from a status that's about to change underneath it.
export function useRestoringBillIds(): ReadonlySet<string> {
  return useSyncExternalStore(subscribeRestoringBillIds, getRestoringBillIds, getRestoringBillIds);
}
