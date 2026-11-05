import { copy } from '@/constants/copy';

import { getProcessingPrivacyNote } from './getProcessingPrivacyNote';

describe('getProcessingPrivacyNote', () => {
  it('says the photo is sent securely for an https OCR backend', () => {
    expect(getProcessingPrivacyNote('https://ocr.example.com')).toBe(
      'Your photo is sent securely to be read.',
    );
  });

  it('does not claim "securely" for a plain http OCR backend', () => {
    expect(getProcessingPrivacyNote('http://localhost:8787')).toBe(
      'Your photo is sent to be read.',
    );
    expect(getProcessingPrivacyNote('http://192.168.1.10:8787')).toBe(
      copy.processing.privacyNoteBackendUnencrypted,
    );
  });

  it('keeps the on-device note when no OCR backend is configured', () => {
    expect(getProcessingPrivacyNote('')).toBe(copy.processing.privacyNoteOnDevice);
  });
});
