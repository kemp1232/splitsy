import * as SecureStore from 'expo-secure-store';

// Native: the id of the account this device's local data belongs to (the
// last user whose sign-in ensureLocalDataOwner.ts accepted), persisted in
// expo-secure-store like pendingLocalWipe.ts. The local database has no
// per-user column, so this is what lets a different account's sign-in be
// detected and the previous account's data wiped first. Web counterpart:
// localDataOwner.web.ts.
const KEY = 'splitsy_local_data_owner';

export async function getLocalDataOwner(): Promise<string | null> {
  return SecureStore.getItemAsync(KEY);
}

export async function setLocalDataOwner(userId: string): Promise<void> {
  await SecureStore.setItemAsync(KEY, userId);
}
