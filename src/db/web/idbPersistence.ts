// Web-only stopgap persistence for client.web.ts's in-memory SQLite database
// (see that file's own header comment for why it's in-memory in the first
// place — every OPFS/worker-based approach hit a Metro-web-bundling dead
// end). This saves/restores the *entire database file* as one binary blob in
// IndexedDB — not `localStorage`, which only stores strings (forcing a
// ~33% size-inflating base64 round trip for binary data) and has a much
// lower per-origin size ceiling (usually 5-10MB) than IndexedDB.
const DB_NAME = 'splitsy-web-sqlite';
const STORE_NAME = 'sqlite';
const RECORD_KEY = 'database';

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB'));
  });
}

// Returns `null` on first run, or if IndexedDB is unavailable/fails for any
// reason — the caller falls back to a fresh empty database either way, the
// same behavior this app had before this file existed.
export async function loadPersistedDatabase(): Promise<Uint8Array | null> {
  try {
    const idb = await openIdb();
    return await new Promise((resolve, reject) => {
      const tx = idb.transaction(STORE_NAME, 'readonly');
      const request = tx.objectStore(STORE_NAME).get(RECORD_KEY);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error ?? new Error('Failed to read saved database'));
    });
  } catch {
    return null;
  }
}

// Best-effort — a failed save just means the next reload starts fresh again,
// same as this app's pre-persistence behavior, rather than something worth
// surfacing to the user.
export async function savePersistedDatabase(bytes: Uint8Array): Promise<void> {
  try {
    const idb = await openIdb();
    await new Promise<void>((resolve, reject) => {
      const tx = idb.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(bytes, RECORD_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Failed to save database'));
    });
  } catch {
    // Swallowed — see header comment.
  }
}
