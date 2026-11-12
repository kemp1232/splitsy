import * as Sharing from 'expo-sharing';
import { Share } from 'react-native';

// Whether the OS's native share sheet was actually used, or (web-only)
// silently fell back to copying to the clipboard instead — see share.web.ts.
// Native always resolves 'shared' (or throws, same as `Share.share` always
// has) — react-native-web has no `Share` implementation at all.
export type ShareResult = 'shared' | 'copied';

export async function shareText(message: string): Promise<ShareResult> {
  await Share.share({ message });
  return 'shared';
}

// Whether an image went to a share sheet, or (web-only, on browsers that
// can't share files) was downloaded instead — see share.web.ts.
export type ShareImageResult = 'shared' | 'downloaded';

// Shares one stored image file (the user's own payment QR, spec Amendment
// 2026-11-12). React Native's own `Share` only takes a file `url` on iOS, so
// this uses expo-sharing, which also shares files on Android (through its
// own FileProvider). Throws, like shareText, when sharing isn't possible.
export async function shareImage(uri: string): Promise<ShareImageResult> {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('shareImage: sharing is not available on this device');
  }
  await Sharing.shareAsync(uri, { mimeType: 'image/*', UTI: 'public.image' });
  return 'shared';
}
