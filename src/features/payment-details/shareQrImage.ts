import { resolveImageUri } from '@/features/receipt-capture/receiptImage.service';
import { shareImage, type ShareImageResult } from '@/lib/share';

// Shares the user's saved payment QR image (spec Amendment 2026-11-12). The
// stored uri is resolved first: on web it is a `splitsy-idb-image:` reference
// that resolveImageUri turns into a fresh `blob:` object URL on every call
// (revoked here once sharing is done); on native it passes through.
export async function shareQrImage(storedUri: string): Promise<ShareImageResult> {
  const resolvedUri = await resolveImageUri(storedUri);
  try {
    return await shareImage(resolvedUri);
  } finally {
    if (resolvedUri !== storedUri && resolvedUri.startsWith('blob:')) {
      URL.revokeObjectURL(resolvedUri);
    }
  }
}
