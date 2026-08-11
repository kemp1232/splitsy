// Items are present but nothing matches a total keyword — the parser must
// still return the items it found and warn instead of failing (spec 20.1 case 9).
export const noTotalFoundLines = [
  'CORNER STORE',
  'WATER BOTTLE          25.00',
  'CHIPS                 45.00',
];
