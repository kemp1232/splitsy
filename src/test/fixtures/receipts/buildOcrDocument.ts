import type { OcrDocument } from '@/features/receipt-ocr/ocr.types';

export type FixtureLine = {
  text: string;
  confidence?: number;
  frame?: { x: number; y: number; width: number; height: number };
};

// Turns a plain array of lines (in reading order) into an OcrDocument, one
// block per line. Geometry is optional — normalizeOcr falls back to input
// order when a frame is absent, which is exactly what most fixtures want.
export function buildOcrDocument(lines: (string | FixtureLine)[]): OcrDocument {
  const normalized = lines.map((line) => (typeof line === 'string' ? { text: line } : line));
  return {
    text: normalized.map((line) => line.text).join('\n'),
    blocks: normalized.map((line) => ({
      text: line.text,
      lines: [{ text: line.text, confidence: line.confidence, frame: line.frame }],
    })),
  };
}

// The frameless-transcription counterpart to buildOcrDocument above — turns
// one newline-joined text blob (a real-device VLM transcription, byte-for-
// byte, in the several `*ReceiptText` fixtures below) into a single-block
// OcrDocument, exactly the flattened shape the on-device parser's
// row-reconstruction (normalizeOcr.ts's mergeFramelessLabelContinuations) is
// built to handle. Previously lived on BackendReceiptOcrService itself, back
// when that service produced raw transcribed text; relocated here once its
// Groq backend started returning already-structured items/totals instead
// (see PLAN.md's "Groq performs full receipt extraction" entry) — this
// remains useful purely as a test-fixture builder for parseReceipt.test.ts's
// real-device regressions.
export function textToOcrDocument(text: string): OcrDocument {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  return {
    text,
    blocks: [{ text, lines: lines.map((lineText) => ({ text: lineText })) }],
  };
}
