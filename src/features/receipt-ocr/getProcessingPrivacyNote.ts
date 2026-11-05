import { copy } from '@/constants/copy';

const HTTPS_URL = /^https:\/\//i;

// Picks processing.tsx's privacy note from the same OCR_BACKEND_URL the OCR
// engine itself uses (BackendReceiptOcrService throws when it's empty, so an
// empty URL means the scan can only ever run on-device). "Securely" is only
// claimed for an https:// backend — a plain http:// one (local dev, LAN) still
// sends the photo, just not encrypted. Takes the URL as a parameter rather
// than importing config so it stays directly unit-testable.
export function getProcessingPrivacyNote(backendUrl: string): string {
  if (!backendUrl) return copy.processing.privacyNoteOnDevice;
  return HTTPS_URL.test(backendUrl)
    ? copy.processing.privacyNoteBackend
    : copy.processing.privacyNoteBackendUnencrypted;
}
