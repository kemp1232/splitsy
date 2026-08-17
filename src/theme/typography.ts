import type { TextStyle } from 'react-native';

export const typography = {
  heading: { fontSize: 22, fontWeight: '700', lineHeight: 28 },
  subheading: { fontSize: 17, fontWeight: '600', lineHeight: 22 },
  body: { fontSize: 15, fontWeight: '400', lineHeight: 21 },
  caption: { fontSize: 13, fontWeight: '400', lineHeight: 18 },
  // The one deliberate, subject-true signature typography choice (see the
  // theme direction notes): every money figure renders with tabular
  // (monospaced) numerals, so digits line up in a column the way they do on a
  // printed receipt — functional for scanning a list of amounts, not
  // decoration for its own sake.
  amount: {
    fontSize: 28,
    fontWeight: '700',
    lineHeight: 34,
    fontVariant: ['tabular-nums'],
  },
} as const satisfies Record<string, TextStyle>;

export type TypographyVariant = keyof typeof typography;
