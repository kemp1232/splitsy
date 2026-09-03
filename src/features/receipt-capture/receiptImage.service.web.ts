import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { createId } from '@/lib/ids';

import { deleteAllImages, deleteImage, loadImage, storeImage } from './web/imageStore';

const OCR_DERIVATIVE_MAX_WIDTH = 1600;

// Web counterpart to receiptImage.service.ts. expo-file-system's
// Directory/File/Paths API (native's own app-owned storage mechanism) has no
// concept of a persistent filesystem on web, so this stores raw image bytes
// in IndexedDB instead (./web/imageStore.ts) and identifies a stored image
// with a custom `splitsy-idb-image:<id>` URI rather than a real file path —
// a plain `blob:` object URL doesn't survive a page reload (the browser
// revokes every outstanding one), but the id lets the bytes be reloaded and
// a *fresh* blob: URL minted any time the image needs to actually be
// displayed (see resolveImageUri, and the shared
// src/components/ui/ReceiptImage.tsx that calls it — every screen displaying
// a stored receipt image goes through that component instead of handing
// `bill.receiptImageUri` straight to `expo-image`'s `<Image>`, so it isn't
// this file's job to keep a live blob: URL freshly minted at all times).
const SCHEME = 'splitsy-idb-image:';

export async function copyImageToAppStorage(sourceUri: string): Promise<string> {
  const blob = await (await fetch(sourceUri)).blob();
  const id = createId();
  await storeImage(id, blob);
  return `${SCHEME}${id}`;
}

// A resized, disposable derivative for OCR (mirrors the native file's own
// "cache-directory-only, regenerated any time OCR re-runs, never stored on
// the bill row" contract) — `expo-image-manipulator` has real web support
// (canvas-based) and returns its own fresh, already-valid `blob:` URL
// (`saveAsync`'s `uri`), used exactly once immediately after this resolves,
// so there's nothing here to persist to `imageStore.ts` at all. Needs
// `sourceUri` resolved to a real loadable URL first, though — the manipulator
// draws it into a `<canvas>`/`<img>`, which can't resolve this file's own
// `splitsy-idb-image:` scheme any more than `expo-image`'s `<Image>` can.
export async function createOcrDerivative(sourceUri: string): Promise<string> {
  const resolvedUri = await resolveImageUri(sourceUri);
  const context = ImageManipulator.manipulate(resolvedUri).resize({
    width: OCR_DERIVATIVE_MAX_WIDTH,
  });
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.9 });
  return saved.uri;
}

// Spec 11.3/F-020 "Delete all local data". Kept `(): void`, matching the
// native file's own synchronous signature (every caller already treats this
// as fire-and-forget), even though IndexedDB itself is inherently
// asynchronous — same best-effort convention as db/web/idbPersistence.ts.
export function deleteReceiptsDirectory(): void {
  void deleteAllImages();
}

// Not present on the native file — that side never needs to turn a stored
// reference back into something displayable, since a native file:// path is
// already directly loadable. Exported here (and as a native no-op passthrough
// on receiptImage.service.ts) so shared display code (ReceiptImage.tsx) can
// import one name regardless of platform. Non-`splitsy-idb-image:` input
// (e.g. a raw blob:/data: URI straight from the camera/picker, still live
// from the current session and never round-tripped through storage) passes
// through unchanged.
export async function resolveImageUri(uri: string): Promise<string> {
  if (!uri.startsWith(SCHEME)) return uri;
  const id = uri.slice(SCHEME.length);
  const blob = await loadImage(id);
  if (!blob) throw new Error(`Stored receipt image not found: ${id}`);
  return URL.createObjectURL(blob);
}

// Used by bill.service.web.ts's own deleteBill in place of native's
// `new File(uri).delete()` — parses this file's own `splitsy-idb-image:`
// scheme back out to the id `imageStore.ts` keyed it under. A non-matching
// uri (shouldn't normally happen — every receiptImageUri on web is one this
// file produced — but matches the native deleteBill's own
// catch-and-ignore-anything-unexpected posture) is silently skipped rather
// than thrown.
export async function deleteStoredImage(uri: string): Promise<void> {
  if (!uri.startsWith(SCHEME)) return;
  await deleteImage(uri.slice(SCHEME.length));
}
