import TextRecognition, {
  type CornerPoints,
  type Frame,
  type TextBlock,
  type TextLine,
} from '@react-native-ml-kit/text-recognition';

import { parseReceipt } from '@/features/receipt-parser/parseReceipt';

import type { OcrRecognitionResult, ReceiptOcrService } from './ReceiptOcrService';
import type { OcrBlock, OcrDocument, OcrLine, Rect } from './ocr.types';

// @react-native-ml-kit/text-recognition (v2.0.0) does not expose per-line/block
// confidence or line rotation — those OcrLine/OcrBlock fields stay undefined here.
// See PLAN.md Milestone 0 log for the full spike write-up.
//
// On real devices `frame` has been observed missing on lines that do have
// `cornerPoints` — and geometry is what the parser's row-reconstruction
// (normalizeOcr's mergeIntoRows) depends on, so falling back to a bounding
// box computed from the four corner points recovers usable position data
// instead of silently losing it.
function rectFromCornerPoints(points: CornerPoints | undefined): Rect | undefined {
  if (!points) return undefined;
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

// Exported (not just used internally) so the frame -> Rect mapping is unit-testable
// without touching the native module.
export function toRect(frame: Frame | undefined, cornerPoints?: CornerPoints): Rect | undefined {
  if (frame) return { x: frame.left, y: frame.top, width: frame.width, height: frame.height };
  return rectFromCornerPoints(cornerPoints);
}

export function toLine(line: TextLine): OcrLine {
  return { text: line.text, frame: toRect(line.frame, line.cornerPoints) };
}

export function toBlock(block: TextBlock): OcrBlock {
  return {
    text: block.text,
    frame: toRect(block.frame, block.cornerPoints),
    lines: block.lines.map(toLine),
  };
}

export class MlKitReceiptOcrService implements ReceiptOcrService {
  async recognize(imageUri: string): Promise<OcrRecognitionResult> {
    const result = await TextRecognition.recognize(imageUri);
    const document: OcrDocument = {
      text: result.text,
      blocks: result.blocks.map(toBlock),
      source: 'on-device',
    };
    // ML Kit only ever produces raw text — it has no reasoning of its own,
    // so unlike the Groq backend this path still needs the deterministic
    // classifier to turn OCR lines into items/totals/adjustments.
    return { receipt: parseReceipt(document), source: 'on-device' };
  }
}
