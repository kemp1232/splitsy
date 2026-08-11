// Mirrors assets/receipts/sample-receipt.png (synthetic, no real transaction
// data). Covers: simple items + total, quantity patterns, VAT + service
// charge, discount, comma-separated total, and CASH/CHANGE appearing after
// the total (spec section 20.1 cases 1-5, 8).
export const simpleReceiptLines = [
  'SAMPLE DINER',
  '123 Fixture Street, Quezon City',
  'TIN: 000-000-000-000',
  'OR NO: 0000123456',
  'DATE: 01/15/2026  TIME: 19:32',
  '2x BURGER MEAL       240.00',
  '1  ICED TEA           60.00',
  '1  SHARED NACHOS   1,250.00',
  'SUBTOTAL           1,550.00',
  'VAT (12%)             54.00',
  'SERVICE CHARGE         22.50',
  'DISCOUNT              -20.00',
  'TOTAL              1,606.50',
  'CASH               2,000.00',
  'CHANGE               393.50',
];
