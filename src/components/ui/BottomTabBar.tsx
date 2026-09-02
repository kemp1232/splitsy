import { Feather } from '@expo/vector-icons';
import { usePathname, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { type LayoutChangeEvent, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { AppText } from '@/components/ui/AppText';
import { copy } from '@/constants/copy';
import type { ColorTokens } from '@/theme/tokens';
import { radius, spacing, touchTarget } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

// ---- Tunable constants -----------------------------------------------------
// The flat portion of the bar (excludes the safe-area inset padding added
// below it at render time).
const BAR_HEIGHT = 64;
// LOCKED — must match the "+" button's own diameter (see its style block
// below, which this constant does not otherwise touch). Only used here to
// derive the cutout's gap math; never applied to the button itself.
const BUTTON_SIZE = 56;
const BUTTON_RADIUS = BUTTON_SIZE / 2;
// Empty space between the button's circumference and the cutout's edge, held
// UNIFORM at every angle around the button — not just directly underneath
// it. This is now the one knob that controls clearance: the cutout is a true
// circle concentric with the button (same center, radius = BUTTON_RADIUS +
// this), so raising/lowering it widens/narrows the gap evenly all the way
// around rather than only at the bottom.
const BUTTON_GAP = 8;
// The cutout's radius — same center as the button, just BUTTON_GAP larger.
// This single number is what actually defines the cutout's shape now; no
// separate width/depth is tuned independently of it.
const CUTOUT_RADIUS = BUTTON_RADIUS + BUTTON_GAP;
// Degrees of the true circle, measured in from its horizontal (3-o'clock/
// 9-o'clock) points, left out of the perfectly-circular part and handed to a
// short tangent-matched Bézier blend into the flat bar edge instead. A full
// circle's tangent is *vertical* exactly at those horizontal points, which
// would be a visible kink against the flat (horizontal-tangent) bar edge —
// this reserves that last stretch on each side for a smooth transition. It's
// comfortably outside the button's own footprint either way (see
// buildBarPath's own comment), so it never affects the gap around the button.
const ARC_TRIM_DEGREES = 25;
// Horizontal run of each flat-to-arc transition blend.
const TRANSITION_RUN = 20;
// Bottom-left/bottom-right corner radius (the reference's own "generous"
// rounded lower corners) — unrelated to the cutout.
const BOTTOM_RADIUS = 32;
// ----------------------------------------------------------------------------

// Exported so every screen can pad its own scrollable content by roughly
// this much, keeping the last row from sitting underneath this bar — this
// used to be needed only by Home/Settings (back when this bar was scoped to
// a (tabs) route group covering just those two), but now that it's a global
// overlay (2026-08-27 "show the nav bar on all views"), any screen without
// its own sticky footer to stack above it (see Screen.tsx's own header note
// on why that stacking mechanism was later removed entirely) needs this same
// clearance. A generous approximation, not pixel-exact.
export const TAB_BAR_CONTENT_CLEARANCE = BAR_HEIGHT + spacing.lg + spacing.md;

// Fixed set of destinations this bar links to — no longer read from a real
// Tabs navigator's route list (see this component's own header comment for
// why it isn't one anymore), so this is now the one place that defines them.
// One Feather icon per tab (app-wide standardization on Feather for every
// icon, 2026-08-27) rather than an outline/filled pair — Feather is a
// single-weight line-icon set with no filled variants, so the icon no longer
// changes *shape* on selection the way the previous Ionicons pair did.
// Selection still isn't color alone, though: `tint` below recolors it and
// the label's own `labelActive` style bolds the text at the same time.
const TABS: {
  path: '/' | '/settings';
  icon: keyof typeof Feather.glyphMap;
  label: string;
}[] = [
  { path: '/', icon: 'home', label: copy.nav.homeTab },
  { path: '/settings', icon: 'settings', label: copy.nav.settingsTab },
];

// One point on the cutout circle — center (cx, 0), the exact same center the
// (locked) "+" button is drawn around — at angle `theta` (radians, standard
// convention: 0 = 3 o'clock, increasing clockwise on screen since y is
// down; 90° is straight down, the circle's bottom).
function cutoutPoint(cx: number, theta: number): { x: number; y: number } {
  return { x: cx + CUTOUT_RADIUS * Math.cos(theta), y: CUTOUT_RADIUS * Math.sin(theta) };
}

// Unit tangent for travel in the direction of *decreasing* theta — the
// left-to-right direction this path is built in (e.g. at the circle's
// bottom, theta=90°, this is exactly (1,0): momentarily flat, moving right).
function cutoutTangent(theta: number): { x: number; y: number } {
  return { x: Math.sin(theta), y: -Math.cos(theta) };
}

// One cubic Bézier approximating the true circular arc from `theta0` down to
// `theta1` (theta0 > theta1), using the standard "4/3 * tan(Δ/4)" control-
// point distance for a close approximation of a real circle — not an
// arbitrary curve shape independently tuned for width/depth. Accurate to a
// fraction of a pixel at the ~55–65° spans this file calls it with.
function circularArcSegment(cx: number, theta0: number, theta1: number): string {
  const p0 = cutoutPoint(cx, theta0);
  const p1 = cutoutPoint(cx, theta1);
  const t0 = cutoutTangent(theta0);
  const t1 = cutoutTangent(theta1);
  const handle = CUTOUT_RADIUS * (4 / 3) * Math.tan((theta0 - theta1) / 4);
  const c1 = { x: p0.x + t0.x * handle, y: p0.y + t0.y * handle };
  const c2 = { x: p1.x - t1.x * handle, y: p1.y - t1.y * handle };
  return `C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${p1.x} ${p1.y}`;
}

// Builds the bar's fill path: a flat top edge that blends smoothly into a
// TRUE circular cutout concentric with the (locked) "+" button — radius
// CUTOUT_RADIUS around the same center the button itself is drawn around —
// rather than an independently-shaped width/depth curve. Because both
// circles share one center, the radial gap between them is exactly
// BUTTON_GAP at every angle by construction, not just directly underneath
// the button. Sharp top-left/top-right corners, generously rounded
// bottom-left/bottom-right corners. Every coordinate is already
// non-negative (the cutout only ever moves further *into* the bar's own
// body, never above its top edge), so this needs no coordinate shift or
// repositioning of the <Svg> element itself.
function buildBarPath(width: number, height: number): string {
  const cx = width / 2;
  const r = BOTTOM_RADIUS;
  const trim = (ARC_TRIM_DEGREES * Math.PI) / 180;
  const thetaLeft = Math.PI - trim; // left shoulder of the true-circle arc
  const thetaMid = Math.PI / 2; // straight down — the circle's bottom
  const thetaRight = trim; // right shoulder

  const leftShoulder = cutoutPoint(cx, thetaLeft);
  const rightShoulder = cutoutPoint(cx, thetaRight);
  const leftTangent = cutoutTangent(thetaLeft);
  const rightTangent = cutoutTangent(thetaRight);

  // Both shoulders sit at |x - cx| = CUTOUT_RADIUS*cos(trim), already
  // outside the button's own footprint (BUTTON_RADIUS < CUTOUT_RADIUS), and
  // the transition below only moves further outside from there — so this
  // blend never runs anywhere near the button, only the true-circle arc
  // above does, which is what actually guarantees the uniform gap around it.
  const leftFlatEnd = { x: leftShoulder.x - TRANSITION_RUN, y: 0 };
  const leftC1 = { x: leftFlatEnd.x + TRANSITION_RUN * 0.5, y: 0 };
  const leftC2 = {
    x: leftShoulder.x - leftTangent.x * TRANSITION_RUN * 0.5,
    y: leftShoulder.y - leftTangent.y * TRANSITION_RUN * 0.5,
  };
  const rightFlatStart = { x: rightShoulder.x + TRANSITION_RUN, y: 0 };
  const rightC1 = {
    x: rightShoulder.x + rightTangent.x * TRANSITION_RUN * 0.5,
    y: rightShoulder.y + rightTangent.y * TRANSITION_RUN * 0.5,
  };
  const rightC2 = { x: rightFlatStart.x - TRANSITION_RUN * 0.5, y: 0 };

  return [
    'M 0 0',
    `L ${leftFlatEnd.x} 0`,
    // Flat edge -> true circle: control points chosen so the tangent at the
    // flat point stays horizontal and the tangent at the shoulder matches
    // the circle's own — a smooth (no-kink) join in both directions.
    `C ${leftC1.x} ${leftC1.y}, ${leftC2.x} ${leftC2.y}, ${leftShoulder.x} ${leftShoulder.y}`,
    // The true circular arc itself, split at the bottom into two segments
    // for an accurate approximation.
    circularArcSegment(cx, thetaLeft, thetaMid),
    circularArcSegment(cx, thetaMid, thetaRight),
    // True circle -> flat edge (mirror of the entry blend above).
    `C ${rightC1.x} ${rightC1.y}, ${rightC2.x} ${rightC2.y}, ${rightFlatStart.x} 0`,
    `L ${width} 0`,
    `L ${width} ${height - r}`,
    // Rounded bottom-right corner.
    `A ${r} ${r} 0 0 1 ${width - r} ${height}`,
    `L ${r} ${height}`,
    // Rounded bottom-left corner.
    `A ${r} ${r} 0 0 1 0 ${height - r}`,
    'L 0 0',
    'Z',
  ].join(' ');
}

// Global nav bar, rendered once from the root layout (_layout.tsx) as a
// persistent overlay above every authenticated screen — not a real Tabs
// navigator's `tabBar` render prop anymore (it used to be, scoped to a
// (tabs) route group covering only Home/Settings; see the 2026-08-27 "show
// the nav bar on all views" change). Home/Settings are still its only two
// real destinations, tracked via `usePathname()` rather than a navigator's
// own route list — every other screen (bill/**, trip/**) shows this bar too,
// just with neither tab highlighted, and stacks its own footer (if any)
// above it (Screen.tsx). Renders a real SVG background (not a plain
// rectangle with a button floating over it) so the concave cutout around the
// center "+" reads as one continuous shape, cradling the button with a
// visible gap rather than the bar touching it. The curve is built from the
// bar's *measured* width (`onLayout`, never `Dimensions.get('window')`,
// since the bar's own rendered width — not the raw screen width — is what
// the curve and button must center on), so it stays exactly centered on
// every device size without any hardcoded coordinate. The "+" pushes
// straight to `/bill/new` (this app's existing New-Bill/Start-a-Trip
// chooser) — the same single floating action the now-retired
// FloatingActionButton.tsx used to own on Home alone. This app keeps to that
// one floating action and to its existing two real destinations (Home,
// Settings) rather than adding more tabs.
export function BottomTabBar() {
  const router = useRouter();
  const pathname = usePathname();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [barWidth, setBarWidth] = useState(0);
  const styles = useMemo(() => createStyles(colors), [colors]);

  function handleLayout(event: LayoutChangeEvent) {
    setBarWidth(event.nativeEvent.layout.width);
  }

  return (
    <View style={styles.wrapper} onLayout={handleLayout}>
      {barWidth > 0 ? (
        <Svg
          width={barWidth}
          height={BAR_HEIGHT + insets.bottom}
          viewBox={`0 0 ${barWidth} ${BAR_HEIGHT + insets.bottom}`}
          style={styles.svg}
        >
          <Path
            // The path itself is built for the flat-bar height only; the
            // extra `insets.bottom` is added as a plain rectangle underneath
            // by extending `height` here without changing buildBarPath's own
            // math, so the safe-area padding at the very bottom is still
            // covered by the same fill/border without needing the curve or
            // corner-radius logic to know about insets at all.
            d={buildBarPath(barWidth, BAR_HEIGHT + insets.bottom)}
            fill={colors.surface}
            stroke={colors.border}
            strokeWidth={1}
          />
        </Svg>
      ) : null}

      <View style={[styles.content, { paddingBottom: insets.bottom }]}>
        {TABS.map((tab) => {
          const isFocused = pathname === tab.path;
          const tint = isFocused ? colors.primary : colors.textSecondary;

          function handlePress() {
            // `navigate` (not `push`): reconciles against the existing stack
            // instead of piling on another Home/Settings screen every time
            // it's tapped from deep inside a bill/trip flow.
            if (!isFocused) router.navigate(tab.path);
          }

          return (
            <Pressable
              key={tab.path}
              accessibilityRole="tab"
              accessibilityState={{ selected: isFocused }}
              accessibilityLabel={tab.label}
              onPress={handlePress}
              style={({ pressed }) => [styles.tabButton, pressed && styles.tabButtonPressed]}
            >
              <Feather name={tab.icon} size={22} color={tint} />
              <AppText
                variant="caption"
                style={[styles.label, { color: tint }, isFocused && styles.labelActive]}
              >
                {tab.label}
              </AppText>
            </Pressable>
          );
        })}
      </View>

      {/* Centered via `left: '50%'` + a `translateX` of half its own width,
          not a pixel value derived from `barWidth` — percentage positioning
          is already exactly 50% of this wrapper's real rendered width on any
          device, so the button needs no measurement of its own (only the SVG
          path's control points need `barWidth` as a concrete number). */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={copy.home.primaryAction}
        hitSlop={10}
        onPress={() => router.push('/bill/new')}
        style={({ pressed }) => [styles.centerButton, pressed && styles.centerButtonPressed]}
      >
        {/* LOCKED — `plus-square`, specifically, per the user's own explicit
            standing instruction: keep this exact icon on this exact button
            even through future "change all icons/all plus icons" sweeps
            elsewhere in the app, unless a future request calls this button
            out by name again. */}
        <Feather name="plus-square" size={26} color={colors.onPrimary} />
      </Pressable>
    </View>
  );
}

function createStyles(colors: ColorTokens) {
  return StyleSheet.create({
    // Flush with both edges and the screen's bottom — no floating side/
    // bottom margins.
    wrapper: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      alignItems: 'center',
    },
    svg: {
      position: 'absolute',
      left: 0,
      // No vertical shift needed — the cutout only ever dips down into the
      // bar's own body (never rises above it), so this <Svg>'s top already
      // coincides with the wrapper's y = 0 flat edge.
      top: 0,
    },
    content: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      width: '100%',
      minHeight: BAR_HEIGHT,
      paddingHorizontal: spacing.xl,
      paddingTop: spacing.sm,
    },
    tabButton: {
      minWidth: touchTarget.min,
      minHeight: touchTarget.min,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 2,
    },
    tabButtonPressed: {
      opacity: 0.7,
    },
    label: {
      fontSize: 12,
    },
    labelActive: {
      fontWeight: '700',
    },
    centerButton: {
      position: 'absolute',
      // The button's center sits exactly on the bar's normal (flat) top
      // edge — half the button above it, half inside the bar's own cutout
      // region — never higher than that.
      top: -BUTTON_RADIUS,
      left: '50%',
      transform: [{ translateX: -BUTTON_RADIUS }],
      width: BUTTON_SIZE,
      height: BUTTON_SIZE,
      borderRadius: radius.pill,
      borderCurve: 'continuous',
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      // CSS box-shadow syntax (vercel-react-native-skills' ui-styling rule)
      // in place of the old shadowColor/shadowOffset/shadowOpacity/
      // shadowRadius/elevation quintet — one string renders on both iOS and
      // Android on the New Architecture (this app's default on Expo SDK 57),
      // so nothing here is Android-only elevation lost in the conversion.
      boxShadow: '0 6px 12px rgba(0, 0, 0, 0.28)',
    },
    centerButtonPressed: {
      backgroundColor: colors.primaryPressed,
      opacity: 0.9,
    },
  });
}
