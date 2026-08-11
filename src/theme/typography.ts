import type { TextStyle } from 'react-native';

export const typography = {
  heading: { fontSize: 22, fontWeight: '700', lineHeight: 28 },
  subheading: { fontSize: 17, fontWeight: '600', lineHeight: 22 },
  body: { fontSize: 15, fontWeight: '400', lineHeight: 21 },
  caption: { fontSize: 13, fontWeight: '400', lineHeight: 18 },
  amount: { fontSize: 28, fontWeight: '700', lineHeight: 34 },
} as const satisfies Record<string, TextStyle>;

export type TypographyVariant = keyof typeof typography;
