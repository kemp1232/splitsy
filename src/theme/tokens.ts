// Semantic color tokens (spec section 16), light and dark. Every pairing below
// was checked against WCAG AA (4.5:1 for normal text) for the surfaces it's
// meant to sit on — accessibility takes priority over the exact hue. See
// ThemeProvider.tsx for how one of these two palettes gets resolved into the
// live `colors` object every screen reads via useTheme().
//
// A deliberate asymmetry worth calling out: `onPrimary` is near-white in the
// light palette but near-black in the dark one. A single mid-tone accent
// cannot clear 4.5:1 against both a near-black background (as plain text)
// *and* against a near-white label on top of it (as a button fill) at the
// same time — the math doesn't allow it. Rather than let the dark palette's
// buttons or its "primary"-colored text fall short of AA, the dark palette
// flips the usual light-text-on-colored-fill pattern: `primary`/`danger` are
// bright enough to read as text straight on the dark background, and
// `onPrimary` is dark ink laid on top of them instead of white.
export type ColorTokens = {
  background: string;
  surface: string;
  surfaceMuted: string;
  textPrimary: string;
  textSecondary: string;
  border: string;
  primary: string;
  primaryPressed: string;
  onPrimary: string;
  success: string;
  warning: string;
  danger: string;
  focus: string;
};

// Paper-white background, pure-white cards, ink-navy text, and one deliberate
// cobalt-indigo accent (not Bootstrap blue, not iOS system blue).
export const lightColors: ColorTokens = {
  background: '#F5F6FA',
  surface: '#FFFFFF',
  surfaceMuted: '#EAECF3',
  textPrimary: '#10141C',
  textSecondary: '#545C6E',
  border: '#DDE1EA',
  primary: '#2F3EA6',
  primaryPressed: '#232F82',
  onPrimary: '#FFFFFF',
  success: '#1E7A4C',
  warning: '#8A5300',
  danger: '#C13327',
  focus: '#2F3EA6',
} as const;

// Near-black (not pure #000) surfaces, off-white text, the same accent hue
// brightened so it clears AA both as plain text on the dark background and as
// a button fill (see the file header comment for why `onPrimary` flips dark).
export const darkColors: ColorTokens = {
  background: '#0B0D12',
  surface: '#12151C',
  surfaceMuted: '#1B1F29',
  textPrimary: '#F2F3F7',
  textSecondary: '#A9B0C0',
  border: '#262B36',
  primary: '#8B93FF',
  primaryPressed: '#A6ACFF',
  onPrimary: '#0B0D12',
  success: '#7FE0A8',
  warning: '#F3B94D',
  danger: '#FF8A80',
  focus: '#8B93FF',
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
