import * as Clipboard from 'expo-clipboard';

import type { ShareImageResult, ShareResult } from './share';

// react-native-web has no `Share` implementation at all. This uses the
// browser's own Web Share API where available (mobile Safari/Chrome),
// falling back to copying the text to the clipboard on browsers that don't
// have it (most desktop browsers) — the caller shows a different
// confirmation for each (see the 5 call sites of this function).
//
// A user canceling the native share sheet throws an `AbortError` — treated
// as a silent no-op here, the same as canceling a native OS share sheet
// already is; it deliberately does *not* fall through to the clipboard
// fallback below (that would surprise a user who explicitly canceled into
// still copying something to their clipboard).
export async function shareText(message: string): Promise<ShareResult> {
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ text: message });
      return 'shared';
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return 'shared';
      // Any other failure (e.g. a browser exposing navigator.share but
      // rejecting this particular payload) falls through to the clipboard
      // fallback below instead of surfacing as an error.
    }
  }
  await Clipboard.setStringAsync(message);
  return 'copied';
}

// File extension for the shared image's name, by its MIME type (jpg when
// the type is missing or not listed).
const IMAGE_EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

// Web counterpart to share.ts's shareImage (no expo-sharing here: its web
// build only shares URLs, not files). `uri` must already be loadable (a
// `blob:`/`data:` URL — resolve a stored `splitsy-idb-image:` reference with
// resolveImageUri first). Shares the image as a file through the Web Share
// API where the browser supports file sharing; otherwise downloads it, so
// the user can still attach it themselves. Canceling the share sheet is a
// silent no-op, same as shareText.
export async function shareImage(uri: string): Promise<ShareImageResult> {
  const blob = await (await fetch(uri)).blob();
  const extension = IMAGE_EXTENSIONS[blob.type] ?? 'jpg';
  const fileName = `payment-qr.${extension}`;
  const file = new File([blob], fileName, { type: blob.type || 'image/jpeg' });

  if (
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function' &&
    typeof navigator.canShare === 'function' &&
    navigator.canShare({ files: [file] })
  ) {
    try {
      await navigator.share({ files: [file] });
      return 'shared';
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return 'shared';
      // Any other failure falls through to the download fallback below.
    }
  }

  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoked a moment later: some browsers start the download asynchronously.
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  return 'downloaded';
}
