// Web counterpart to pendingLocalWipe.ts — same marker, kept in localStorage
// (expo-secure-store has no web implementation). Survives a reload, which is
// all the startup retry in completePendingLocalWipe.ts needs.
const KEY = 'splitsy_pending_local_wipe';

export async function setPendingLocalWipe(): Promise<void> {
  window.localStorage.setItem(KEY, '1');
}

export async function clearPendingLocalWipe(): Promise<void> {
  window.localStorage.removeItem(KEY);
}

export async function hasPendingLocalWipe(): Promise<boolean> {
  return window.localStorage.getItem(KEY) === '1';
}
