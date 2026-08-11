import type { OcrDocument, Rect } from '@/features/receipt-ocr/ocr.types';

import { detectAmounts } from './detectAmounts';
import type { NormalizedLine } from './receiptParser.types';

// Flattens every block's lines into one list and sorts primarily by vertical
// position, secondarily by horizontal (spec section 11.4). Lines within the
// same row band (or with no geometry at all, e.g. in tests) keep their
// original relative order — Array.prototype.sort is stable, so two lines with
// equal sort keys never get reordered relative to each other.
const SAME_ROW_TOLERANCE_PX = 8;

export function normalizeOcr(document: OcrDocument): NormalizedLine[] {
  const lines: NormalizedLine[] = document.blocks.flatMap((block) =>
    block.lines.map((line) => ({
      text: line.text,
      frame: line.frame,
      confidence: line.confidence,
      rotationDegrees: line.rotationDegrees,
    })),
  );

  return lines.sort((a, b) => {
    const ay = a.frame?.y ?? 0;
    const by = b.frame?.y ?? 0;
    if (Math.abs(ay - by) > SAME_ROW_TOLERANCE_PX) return ay - by;

    const ax = a.frame?.x ?? 0;
    const bx = b.frame?.x ?? 0;
    return ax - bx;
  });
}

// Real devices have been observed grouping a receipt's text by column rather
// than by row — e.g. every item name in one OCR block, every price in
// another — because ML Kit's block/line clustering follows spatial proximity,
// not a receipt's logical table structure. A "line" as OCR reports it is not
// reliably a full printed line. This merges normalizeOcr's sorted lines back
// into true rows by unioning lines whose vertical extents substantially
// overlap, concatenating their text left-to-right. Lines with no geometry
// (e.g. fixtures without frame data) never merge with anything, so existing
// single-column behavior is unchanged when there's nothing to merge.
const ROW_OVERLAP_RATIO_THRESHOLD = 0.5;

function verticalOverlapRatio(a: Rect, b: Rect): number {
  const overlap = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  if (overlap <= 0) return 0;
  const smallerHeight = Math.min(a.height, b.height);
  return smallerHeight > 0 ? overlap / smallerHeight : 0;
}

function unionRect(rects: Rect[]): Rect {
  const minX = Math.min(...rects.map((r) => r.x));
  const minY = Math.min(...rects.map((r) => r.y));
  const maxX = Math.max(...rects.map((r) => r.x + r.width));
  const maxY = Math.max(...rects.map((r) => r.y + r.height));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function mergeRow(row: NormalizedLine[]): NormalizedLine {
  if (row.length === 1) return row[0]!;
  const frames = row
    .map((line) => line.frame)
    .filter((frame): frame is Rect => frame !== undefined);
  return {
    text: row.map((line) => line.text).join(' '),
    frame: frames.length > 0 ? unionRect(frames) : undefined,
    confidence: row.find((line) => typeof line.confidence === 'number')?.confidence,
  };
}

export function mergeIntoRows(lines: NormalizedLine[]): NormalizedLine[] {
  const rows: NormalizedLine[][] = [];
  let currentRowBounds: Rect | undefined;

  for (const line of lines) {
    const currentRow = rows.at(-1);
    const overlaps =
      currentRow !== undefined &&
      currentRowBounds !== undefined &&
      line.frame !== undefined &&
      verticalOverlapRatio(currentRowBounds, line.frame) >= ROW_OVERLAP_RATIO_THRESHOLD;

    if (overlaps) {
      currentRow.push(line);
      currentRowBounds = unionRect([currentRowBounds!, line.frame!]);
    } else {
      rows.push([line]);
      currentRowBounds = line.frame;
    }
  }

  return rows.map(mergeRow);
}

// Real VLM-backend finding (Ollama/qwen3-vl transcription of a ramen
// restaurant receipt): some printed receipts lay out each item's fields on
// separate physical lines rather than one row per item —
//   AJI TAMAGO
//   2@
//   85.00v
//   170.00
// (name, then a bare quantity marker, then a VAT-inclusive-marked unit price,
// then the actual line total) — and the same shape recurs for label-only
// total/subtotal/adjustment lines printed with their amount on the very next
// line ("Total Due" / "1,655.71"). The VLM transcribes this exactly as
// printed, in correct top-to-bottom order; the backend never attaches a
// `frame` to any line (textToOcrDocument), so this reaches classifyReceiptLines
// completely unmerged and each fragment is judged in total isolation — the
// name has no amount (not an item candidate), the bare marker has no letters
// and no amount (OTHER, ignored), the marked unit price has both an amount
// and a letter (becomes a bogus item named after the marker letter), and the
// bare line total has no letters (dropped as "just an amount").
//
// mergeIntoRows above already reconstructs the geometry-based version of this
// same problem (columns split across separate OCR blocks) but explicitly does
// nothing for frameless lines — there is no geometry to reconstruct from. This
// is the frameless-specific counterpart: a content-only heuristic that only
// ever touches lines with no `frame` at all (guarded on every predicate
// below), so the existing geometry-based path for on-device OCR is completely
// untouched.
//
// The shape recognized: a "label line" (has letters, no amount on it at all)
// immediately followed by a run of one or more "continuation lines", where a
// continuation line is either a bare quantity marker ("2@", "1@", "2x", "x2" —
// no other text) or an amount-bearing line whose only non-amount content is
// empty or a single stray letter (the "v" VAT-inclusive marker above, or
// whatever other single-letter marker the next receipt turns out to use). The
// run stops as soon as a line fails both shapes (a fresh label line, a normal
// complete name+amount line, or anything blank/unrelated) — the whole matched
// run is then space-joined into one line, in original order, and handed to
// the exact same single-line classification/extraction logic every other
// receipt already goes through unchanged (rightmostAmount already correctly
// picks the line *total*, not the unit price, since the total is always the
// rightmost amount once every fragment is reunited onto one line).
const BARE_QUANTITY_MARKER_PATTERN = /^(?:\d{1,2}\s*[@x]|x\s*\d{1,2})$/i;

function isBareQuantityMarker(text: string): boolean {
  return BARE_QUANTITY_MARKER_PATTERN.test(text.trim());
}

// "Amount plus at most one stray letter" — covers both a bare line total
// ("170.00", zero stray characters) and a VAT-inclusive-marked unit price
// ("85.00v", one stray letter). Deliberately generic about *which* letter
// (not hardcoded to "v") since a different receipt's marker letter is just as
// plausible; deliberately requiring exactly one amount (not "at least one")
// so a line that already carries two amounts — a genuine, already-complete
// "name ... unitPrice total" row — is never mistaken for a bare continuation
// fragment.
function isAmountPlusAtMostOneStrayLetter(text: string): boolean {
  const amounts = detectAmounts(text);
  if (amounts.length !== 1) return false;
  const amount = amounts[0]!;
  const withoutAmount = (
    text.slice(0, amount.index) + text.slice(amount.index + amount.raw.length)
  ).trim();
  return withoutAmount.length === 0 || /^[A-Za-z]$/.test(withoutAmount);
}

function isFramelessContinuationLine(line: NormalizedLine): boolean {
  if (line.frame !== undefined) return false;
  const trimmed = line.text.trim();
  if (!trimmed) return false;
  return isBareQuantityMarker(trimmed) || isAmountPlusAtMostOneStrayLetter(trimmed);
}

function isFramelessLabelLine(line: NormalizedLine): boolean {
  if (line.frame !== undefined) return false;
  const trimmed = line.text.trim();
  if (!trimmed || !/[A-Za-z]/.test(trimmed)) return false;
  return detectAmounts(trimmed).length === 0;
}

export function mergeFramelessLabelContinuations(lines: NormalizedLine[]): NormalizedLine[] {
  const result: NormalizedLine[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index]!;
    if (!isFramelessLabelLine(line)) {
      result.push(line);
      index++;
      continue;
    }

    const run: NormalizedLine[] = [line];
    let next = index + 1;
    while (next < lines.length && isFramelessContinuationLine(lines[next]!)) {
      run.push(lines[next]!);
      next++;
    }

    result.push(run.length > 1 ? mergeRow(run) : line);
    index = next;
  }

  return result;
}
