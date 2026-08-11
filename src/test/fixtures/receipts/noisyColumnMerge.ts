import type { FixtureLine } from './buildOcrDocument';

// Reproduces a second real-device finding on the same thermal receipt as
// columnSplitReceipt.ts: a stray garbled fragment (an OCR misread of a
// per-item quantity figure) sits at nearly the same height as the item name
// and price, so mergeIntoRows correctly pulls it into the row too — but
// without stripping every embedded amount (not just the rightmost), the
// leftover "1.00" stayed stuck in the middle of the item name.
export const noisyColumnMergeLines: FixtureLine[] = [
  { text: 'CHICKEN CHAMI', frame: { x: 0, y: 100, width: 200, height: 24 } },
  { text: 'ORD 1.00', frame: { x: 250, y: 102, width: 100, height: 22 } },
  { text: '145.00 V', frame: { x: 600, y: 101, width: 90, height: 22 } },
];
