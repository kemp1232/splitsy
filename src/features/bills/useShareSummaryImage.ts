import { type RefObject, useRef, useState } from 'react';
import { Platform, type View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

import { copy } from '@/constants/copy';
import { shareImage } from '@/lib/share';

// Captures the offscreen SummaryShareCard (attach `cardRef` to it) as a PNG
// and shares it, the same way shareQrImage shares the payment QR. Native
// captures to a temp file for expo-sharing; web has no temp files, so it
// captures a `data:` URI that share.web.ts turns into a File (or a download).
// The temp file is not released after sharing: on Android the receiving app
// may still be reading it, and it lives in the cache directory anyway.
// One share at a time: a second call while one is running returns at once
// (a second share sheet on iOS would fail and show a false error). `busy`
// lets the button show that.
export function useShareSummaryImage(): {
  cardRef: RefObject<View | null>;
  error: string | null;
  busy: boolean;
  share: (onDownloaded: () => void) => Promise<void>;
} {
  const cardRef = useRef<View | null>(null);
  const inFlightRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function share(onDownloaded: () => void) {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setBusy(true);
    setError(null);
    try {
      if (!cardRef.current) throw new Error('useShareSummaryImage: card is not mounted');
      const uri = await captureRef(cardRef, {
        format: 'png',
        quality: 1,
        result: Platform.OS === 'web' ? 'data-uri' : 'tmpfile',
      });
      const result = await shareImage(uri, 'bill-summary');
      // Web-only: this browser can't share files, so the image was downloaded.
      if (result === 'downloaded') onDownloaded();
    } catch {
      setError(copy.summary.shareImageFailure);
    } finally {
      inFlightRef.current = false;
      setBusy(false);
    }
  }

  return { cardRef, error, busy, share };
}
