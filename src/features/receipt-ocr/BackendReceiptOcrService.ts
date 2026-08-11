import { File } from 'expo-file-system';

import { OCR_BACKEND_URL } from '@/constants/config';

import type { ReceiptOcrService } from './ReceiptOcrService';
import type { OcrDocument } from './ocr.types';

// The backend deliberately returns plain text, not geometry (VLMs don't
// reliably give bounding boxes) — it's prompted to already transcribe rows in
// correct reading order, so no per-line frame is needed. normalizeOcr and
// mergeIntoRows already handle frame-less lines correctly (they just pass
// through in given order), which is exactly what every existing geometry-free
// parser fixture already exercises.
export function textToOcrDocument(text: string): OcrDocument {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  return {
    text,
    blocks: [{ text, lines: lines.map((lineText) => ({ text: lineText })) }],
    source: 'backend',
  };
}

export class BackendReceiptOcrService implements ReceiptOcrService {
  async recognize(imageUri: string): Promise<OcrDocument> {
    if (!OCR_BACKEND_URL) {
      throw new Error('OCR backend is not configured (EXPO_PUBLIC_OCR_BACKEND_URL unset).');
    }
    // Development-only diagnostic (spec §18: dev logging must be gated and
    // easy to disable) — just the request URL, never receipt content.
    if (__DEV__) console.log(`[BackendReceiptOcrService] requesting ${OCR_BACKEND_URL}/api/ocr`);

    const formData = new FormData();
    // Expo SDK 57's fetch/FormData implementation only accepts a real Blob
    // (or Blob-like object exposing `bytes()`) for file parts — the classic
    // React Native `{uri, name, type}` object idiom throws "Unsupported
    // FormDataPart implementation" here. expo-file-system's `File` implements
    // the Blob interface and satisfies this directly.
    formData.append('image', new File(imageUri));

    const response = await fetch(`${OCR_BACKEND_URL}/api/ocr`, { method: 'POST', body: formData });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`OCR backend request failed (${response.status}): ${detail}`);
    }

    const data = (await response.json()) as { text?: string; error?: string };
    if (typeof data.text !== 'string') {
      throw new Error(data.error ?? 'OCR backend did not return transcribed text.');
    }

    return textToOcrDocument(data.text);
  }
}
