import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { Directory, File, Paths } from 'expo-file-system';

import { createId } from '@/lib/ids';

const OCR_DERIVATIVE_MAX_WIDTH = 1600;

// App-owned receipt image storage (spec section 11.3): capture/picker URIs are
// not guaranteed to survive app restarts, so every image is copied here
// immediately once the user commits to it.

// Just the path reference, with no filesystem side effect — shared by the
// write path (which needs the directory to exist) and the delete path (which
// must not implicitly recreate a directory it's about to remove).
function receiptsDirectoryRef(): Directory {
  return new Directory(Paths.document, 'receipts');
}

function getReceiptsDirectory(): Directory {
  const directory = receiptsDirectoryRef();
  if (!directory.exists) {
    directory.create({ intermediates: true, idempotent: true });
  }
  return directory;
}

// Removes the entire receipts/ directory and everything in it in one shot
// (spec 11.3, F-020 "Delete all local data"). Guarded for the directory not
// existing at all (e.g. a fresh install that never captured a receipt photo)
// so this is safe to call unconditionally.
export function deleteReceiptsDirectory(): void {
  const directory = receiptsDirectoryRef();
  if (directory.exists) {
    directory.delete();
  }
}

export async function copyImageToAppStorage(sourceUri: string): Promise<string> {
  const sourceFile = new File(sourceUri);
  const extension = sourceFile.extension || '.jpg';
  const destination = new File(getReceiptsDirectory(), `${createId()}${extension}`);
  await sourceFile.copy(destination);
  return destination.uri;
}

// A resized, cache-directory-only copy for OCR (spec section 11.3/§19: resize
// large images before OCR while preserving enough resolution for small
// receipt text). This is intentionally not stored on the bill row — it's
// disposable and can be regenerated from the original any time OCR re-runs.
export async function createOcrDerivative(sourceUri: string): Promise<string> {
  const context = ImageManipulator.manipulate(sourceUri).resize({
    width: OCR_DERIVATIVE_MAX_WIDTH,
  });
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.9 });
  return saved.uri;
}
