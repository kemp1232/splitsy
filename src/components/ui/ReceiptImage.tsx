import { Image, type ImageProps } from 'expo-image';
import { useEffect, useState } from 'react';

import { resolveImageUri } from '@/features/receipt-capture/receiptImage.service';

type Props = Omit<ImageProps, 'source'> & {
  // A bill's own `receiptImageUri`/`originalReceiptImageUri` — on native this
  // is already a directly-loadable `file://` path; on web it may be a
  // `splitsy-idb-image:` reference (receiptImage.service.web.ts's own
  // storage scheme, since a raw `blob:` URL doesn't survive a page reload)
  // that needs resolving to a fresh, session-valid `blob:` URL first.
  uri: string;
};

// Every screen displaying a *stored* receipt image (as opposed to a raw
// blob:/data: URI still live from the current capture/picker session, before
// it's ever been copied into app storage — see bill/preview.tsx, which
// displays that directly) goes through this instead of handing the uri
// straight to expo-image's own `<Image>`, so the platform-specific
// resolution step in receiptImage.service.ts/.web.ts only has to be
// implemented once.
export function ReceiptImage({ uri, ...imageProps }: Props) {
  // Keyed by the uri it was resolved *for*, not just the resolved value
  // alone — lets the render below tell "still resolving this uri" apart from
  // "showing a stale resolution left over from the previous uri" without
  // needing an extra synchronous reset call at the top of the effect (which
  // `react-hooks/set-state-in-effect` flags).
  const [resolved, setResolved] = useState<{ uri: string; resolvedUri: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void resolveImageUri(uri).then((resolvedUri) => {
      if (!cancelled) setResolved({ uri, resolvedUri });
    });
    return () => {
      cancelled = true;
    };
  }, [uri]);

  if (!resolved || resolved.uri !== uri) return null;
  return <Image source={{ uri: resolved.resolvedUri }} {...imageProps} />;
}
