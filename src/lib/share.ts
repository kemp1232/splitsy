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
