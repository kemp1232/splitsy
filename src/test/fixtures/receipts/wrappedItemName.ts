import type { FixtureLine } from './buildOcrDocument';

// A long item name wraps onto its own line with no amount, immediately above
// the line carrying the price — close vertical gap, same left edge, so the
// wrap heuristic (spec section 11.8) should join them into one item named
// "Grilled Chicken Caesar Salad".
export const wrappedItemNameLines: FixtureLine[] = [
  { text: 'SAMPLE DINER', frame: { x: 0, y: 0, width: 100, height: 20 } },
  { text: 'Grilled Chicken Caesar', frame: { x: 10, y: 100, width: 150, height: 20 } },
  { text: 'Salad                280.00', frame: { x: 10, y: 122, width: 150, height: 20 } },
  { text: 'SUBTOTAL             280.00', frame: { x: 10, y: 150, width: 150, height: 20 } },
  { text: 'TOTAL                280.00', frame: { x: 10, y: 172, width: 150, height: 20 } },
];
