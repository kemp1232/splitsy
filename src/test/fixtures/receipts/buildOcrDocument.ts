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
