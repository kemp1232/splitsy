import type { OcrDocument } from './ocr.types';

// The only interface the rest of the app is allowed to depend on. Swapping the
// OCR bridge means writing a new implementation of this file — nothing else changes.
export interface ReceiptOcrService {
  recognize(imageUri: string): Promise<OcrDocument>;
}
