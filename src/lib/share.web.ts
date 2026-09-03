import * as Clipboard from 'expo-clipboard';

import type { ShareResult } from './share';

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
