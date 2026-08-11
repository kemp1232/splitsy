// Semantic tokens (spec section 16). The initial palette leans warm cream/gold,
// but every color below was chosen to clear WCAG AA contrast against the
// surface it's meant to sit on — accessibility takes priority over the exact hue.
export const colors = {
  background: '#FFF8EC',
  surface: '#FFFFFF',
  surfaceMuted: '#F5EEDC',
  textPrimary: '#3B2B20',
  textSecondary: '#6B5A4B',
  border: '#E4D9C4',
  primary: '#8A5A12',
  primaryPressed: '#6E4710',
  onPrimary: '#FFFFFF',
  success: '#2E7D4F',
  warning: '#9A5B00',
  danger: '#B3261E',
  focus: '#1A73E8',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 16,
  pill: 999,
} as const;

// Minimums from spec section 17 (accessibility): 44x44 required, 48x48 preferred.
export const touchTarget = {
  min: 44,
  preferred: 48,
} as const;
