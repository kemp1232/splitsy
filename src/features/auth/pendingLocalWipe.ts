import * as SecureStore from 'expo-secure-store';

// Native: a durable "this device still owes a local-data wipe" marker,
// persisted in expo-secure-store (already used for the auth session — see
// src/lib/authClient.ts). Set by deleteAccount.ts BEFORE the server account
// is deleted and cleared once resetAllLocalData has succeeded, so a wipe that
// fails (or is interrupted by the app closing) is retried on the next start by
// completePendingLocalWipe.ts. Web counterpart: pendingLocalWipe.web.ts.
const KEY = 'splitsy_pending_local_wipe';

export async function setPendingLocalWipe(): Promise<void> {
  await SecureStore.setItemAsync(KEY, '1');
}

export async function clearPendingLocalWipe(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY);
}

export async function hasPendingLocalWipe(): Promise<boolean> {
  return (await SecureStore.getItemAsync(KEY)) === '1';
}
