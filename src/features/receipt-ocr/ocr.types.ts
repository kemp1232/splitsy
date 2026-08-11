// Platform-neutral OCR contract (spec section 6). Nothing outside receipt-ocr/
// should import a specific OCR bridge's native types — only these.
export type OcrDocument = {
  text: string;
  blocks: OcrBlock[];
  // Which ReceiptOcrService implementation actually produced this document —
  // set by each implementation, not derived. Lets the UI show whether a scan
  // used the VLM backend or fell back to on-device OCR (see
  // FallbackReceiptOcrService). Optional/untyped by older callers is fine;
  // it's a UI hint, never treated as bill data (spec section 7).
  source?: 'backend' | 'on-device';
};

export type OcrBlock = {
  text: string;
  frame?: Rect;
  confidence?: number;
  lines: OcrLine[];
};

export type OcrLine = {
  text: string;
  frame?: Rect;
  confidence?: number;
  rotationDegrees?: number;
};

export type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};
