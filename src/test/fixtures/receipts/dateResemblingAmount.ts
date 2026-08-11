// A transaction/date-ish header full of digits sits right next to the real
// item lines — none of it should be mistaken for a price or an item (spec
// 20.1 case 11). Slashes/colons in dates and times never match the
// exactly-2-decimal-digit amount pattern (spec section 11.5).
export const dateResemblingAmountLines = [
  'CORNER STORE',
  'TXN NO: 01.15.26.0042',
  'DATE: 01/15/2026  TIME: 19:32',
  'WATER BOTTLE          25.00',
  'TOTAL                 25.00',
];
