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
  // Two-stop gradient for the reference-inspired "hero" cards (bill/trip
  // totals) — same hue family as `primary` (~232-236° on the hue wheel, a
  // deliberate blue/indigo, never drifting into purple's ~270-300° range),
  // not a copy of the reference screenshots' own exact hue. `onPrimary` is
  // the label color meant to sit on top of this gradient in both themes,
  // same as it already is for a flat `primary` fill — see this file's own
  // header comment on why that flips direction between light and dark.
  gradientStart: string;
  gradientEnd: string;
  // ---- "Playful Fintech Minimalism" additions (2026-11 redesign) ----
  // The deeper end of the screen background's own vertical wash
  // (AppBackground.tsx), one step past `background`.
  backgroundDeep: string;
  // The two soft purple tones AppBackground's organic corner shapes are
  // painted in — deliberately very low contrast against `background`.
  ambient: string;
  ambientStrong: string;
  // A third surface layer above `surface`/`surfaceMuted`: icon tiles, round
  // header buttons, progress-bar tracks.
  surfaceElevated: string;
  // Tertiary text (hints, meta lines). Still clears 4.5:1 on `background`
  // and `surface` (see tokens.test.ts).
  textMuted: string;
  // The violet second stop of the lavender family (gradient end, the
  // filled "recommended" icon tile).
  accent: string;
  borderStrong: string;
  // Theme-aware pressed fill for the `danger` (destructive) button.
  dangerPressed: string;
  // Dimmed backdrop behind every bottom sheet / dialog. 8-digit hex (has
  // its own alpha) — never pass this through tint().
  scrim: string;
};

// Harmonized lavender light palette (2026-11 redesign): a faintly violet
// paper background, white cards, ink text and a deep lavender-indigo accent
// dark enough to carry white labels. Every text pairing is asserted by
// tokens.test.ts rather than only by this comment.
export const lightColors: ColorTokens = {
  background: '#F6F5FB',
  surface: '#FFFFFF',
  surfaceMuted: '#EFEEF8',
  textPrimary: '#12131C',
  textSecondary: '#4E5468',
  border: '#DCDAEA',
  primary: '#4A4FC4',
  primaryPressed: '#3B3FA6',
  onPrimary: '#FFFFFF',
  success: '#1E7A4C',
  warning: '#8A5300',
  danger: '#C13327',
  focus: '#4A4FC4',
  // White (`onPrimary`) on gradientStart: 6.55:1, on gradientEnd: 5.93:1.
  gradientStart: '#4A4FC4',
  gradientEnd: '#6A4BD1',
  backgroundDeep: '#EEEDF8',
  ambient: '#E9E5FA',
  ambientStrong: '#DDD6F7',
  surfaceElevated: '#F3F2FA',
  textMuted: '#5E6478',
  accent: '#6A4BD1',
  borderStrong: '#C4C0DD',
  dangerPressed: '#8C1D17',
  scrim: '#0B0D1266',
} as const;

// Near-black (not pure #000) surfaces, off-white text, the same accent hue
// brightened so it clears AA both as plain text on the dark background and as
// a button fill (see the file header comment for why `onPrimary` flips dark).
//
// 2026-11 "Playful Fintech Minimalism": near-black navy base, layered
// charcoal surfaces, lavender primary/violet accent, mint reserved for
// verified/positive states, coral for destructive ones.
export const darkColors: ColorTokens = {
  background: '#0B0D12',
  surface: '#171A25',
  surfaceMuted: '#202335',
  textPrimary: '#F5F6FA',
  textSecondary: '#AAB0BE',
  border: '#323549',
  primary: '#9298FF',
  primaryPressed: '#7D84F2',
  onPrimary: '#0B0D12',
  success: '#65E6AE',
  warning: '#F4B66D',
  danger: '#FF8585',
  focus: '#A68BFA',
  // Dark ink (`onPrimary`) on gradientStart: 7.55:1, on gradientEnd: 7.12:1
  // — the flipped dark-ink-on-bright-fill pattern from the header comment.
  gradientStart: '#9298FF',
  gradientEnd: '#A68BFA',
  backgroundDeep: '#10101B',
  ambient: '#1B1730',
  ambientStrong: '#292044',
  surfaceElevated: '#27283D',
  textMuted: '#8A91A3',
  accent: '#A68BFA',
  borderStrong: '#44486A',
  dangerPressed: '#E56F6F',
  scrim: '#05060A99',
} as const;

// Theme-independent chrome around a live camera feed (bill/capture.tsx):
// that backdrop is always dark regardless of the app theme, so these never
// flip with light/dark.
export const cameraOverlay = {
  text: '#FFFFFF',
  frame: '#FFFFFF',
  scrim: '#00000066',
  background: '#0B0D12',
  feedBackground: '#000000',
  scanLine: '#FFFFFF80',
} as const;

// Ink for text laid over the fixed white speech bubble baked into
// assets/images/greeting.png (GreetingBubble.tsx) — the bubble never
// repaints for dark mode, so this ink never flips either.
export const illustrationInk = {
  heading: '#10141C',
  body: '#2A2E38',
} as const;

// CSS box-shadow strings (New Architecture renders them on both platforms).
export const shadows = {
  fab: '0 6px 12px rgba(0, 0, 0, 0.28)',
  card: '0 8px 24px rgba(0, 0, 0, 0.18)',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  // Between lg and xl — the redesign's card padding / screen gutter.
  xl20: 20,
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 16,
  // The reference UI's "hero panel" corner radius (gradient total cards) —
  // deliberately larger than `lg`'s general card radius so that shape reads
  // as its own distinct, more prominent surface.
  xl: 28,
  pill: 999,
  // 2026-11 redesign shapes: icon tiles, buttons/inputs, cards, hero panels.
  tile: 14,
  button: 16,
  card: 20,
  hero: 26,
} as const;

// Minimums from spec section 17 (accessibility): 44x44 required, 48x48 preferred.
export const touchTarget = {
  min: 44,
  preferred: 48,
} as const;

// Web desktop-browser widening (Phase 7 of the web port — see
// WEB_PORT_STATUS.md): this app's whole UI is designed mobile-first and
// stays that way — this is the one shared number that keeps every screen,
// the bottom nav bar, and every bottom sheet capped to a phone-width
// column instead of stretching edge-to-edge across a wide browser window,
// so they all line up with each other rather than each picking its own
// width independently. Applied via `Platform.OS === 'web' ? CONTENT_MAX_WIDTH
// : undefined` at each call site — plain `maxWidth`, so it's already an
// inert no-op below this value (every native screen, and any web viewport
// narrower than this) with no separate breakpoint/measurement needed.
// `ConfirmationDialog.tsx`'s own smaller, independently-chosen dialog width
// is deliberately not tied to this — a confirm/cancel prompt reads fine
// narrower than the main content column, unlike a bottom sheet or a
// screen's own content, which visually need to line up with each other.
export const CONTENT_MAX_WIDTH = 480;
