import type { FixtureLine } from './buildOcrDocument';

// Reproduces a real on-device failure: a printed thermal POS receipt where
// ML Kit returned every item name in one column-block and every price in a
// separate column-block, instead of one line per printed row. Before
// mergeIntoRows existed, none of these items were recognized at all, because
// classifyReceiptLines requires a name and an amount on the same line.
export const columnSplitReceiptLines: FixtureLine[] = [
  { text: 'SAMPLE STORE', frame: { x: 0, y: 0, width: 200, height: 24 } },

  // Name column
  { text: 'CHICKEN CHAMI', frame: { x: 0, y: 100, width: 200, height: 24 } },
  { text: 'BEEF LOMI', frame: { x: 0, y: 130, width: 200, height: 24 } },
  { text: 'LECHON CHAMI', frame: { x: 0, y: 160, width: 200, height: 24 } },

  // Price column, reported as an entirely separate block from the names above
  { text: '145.00', frame: { x: 600, y: 101, width: 80, height: 22 } },
  { text: '145.00', frame: { x: 600, y: 131, width: 80, height: 22 } },
  { text: '145.00', frame: { x: 600, y: 161, width: 80, height: 22 } },

  { text: 'SUBTOTAL', frame: { x: 0, y: 200, width: 200, height: 24 } },
  { text: '435.00', frame: { x: 600, y: 200, width: 80, height: 24 } },
  { text: 'TOTAL', frame: { x: 0, y: 230, width: 200, height: 24 } },
  { text: '435.00', frame: { x: 600, y: 230, width: 80, height: 24 } },
];
