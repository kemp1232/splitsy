// Web-only receipt image storage — the counterpart to expo-file-system's
// Directory/File/Paths on native (see ../receiptImage.service.web.ts's own
// header comment for the full picture). Stores raw image Blobs in IndexedDB,
// keyed by id, since a blob: object URL alone doesn't survive a page reload
// (the browser revokes every outstanding one) but the underlying bytes need
// to.
const DB_NAME = 'splitsy-web-images';
const STORE_NAME = 'images';

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

export async function storeImage(id: string, blob: Blob): Promise<void> {
  const idb = await openIdb();
  await new Promise<void>((resolve, reject) => {
    const tx = idb.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(blob, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Failed to store image'));
  });
}

export async function loadImage(id: string): Promise<Blob | null> {
  const idb = await openIdb();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).get(id);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error ?? new Error('Failed to load image'));
  });
}

export async function deleteImage(id: string): Promise<void> {
  const idb = await openIdb();
  await new Promise<void>((resolve, reject) => {
    const tx = idb.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Failed to delete image'));
  });
}

// Spec F-020 "Delete all local data"'s web counterpart to
// deleteReceiptsDirectory — clears every stored image in one shot rather than
// requiring the caller to know every id.
export async function deleteAllImages(): Promise<void> {
  const idb = await openIdb();
  await new Promise<void>((resolve, reject) => {
    const tx = idb.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Failed to clear images'));
  });
}
