// Web counterpart to localDataOwner.ts — same record, kept in localStorage
// (expo-secure-store has no web implementation), like pendingLocalWipe.web.ts.
const KEY = 'splitsy_local_data_owner';

export async function getLocalDataOwner(): Promise<string | null> {
  return window.localStorage.getItem(KEY);
}

export async function setLocalDataOwner(userId: string): Promise<void> {
  window.localStorage.setItem(KEY, userId);
}
