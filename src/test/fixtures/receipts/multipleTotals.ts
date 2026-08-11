// Two lines match a strong-total keyword ("TOTAL DUE" and "TOTAL") — the
// parser should warn about multiple totals and prefer the last one (spec
// section 11.10 / 20.1 case 6).
export const multipleTotalsLines = [
  'CAFE SAMPLE',
  'COFFEE                80.00',
  'SUBTOTAL               80.00',
  'TOTAL DUE              80.00',
  'TOTAL                  80.00',
];
