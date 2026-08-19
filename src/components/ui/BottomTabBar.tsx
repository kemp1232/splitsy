import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import type { BottomTabBarProps } from 'expo-router/tabs';
import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { copy } from '@/constants/copy';
import type { ColorTokens } from '@/theme/tokens';
import { radius, spacing, touchTarget } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

// Same bigger-tap-target sizing the retired FloatingActionButton used for its
// single home-screen action — carried over rather than re-derived, since this
// button is that same "start a new bill/trip" action, just relocated from
// bottom-right-of-Home into the center of this bar.
const CENTER_BUTTON_SIZE = touchTarget.preferred + 16;
// A full circle, per the reference's own center button shape.
const CENTER_BUTTON_RADIUS = radius.pill;
// The background-colored "notch" the button appears to sit inside, cut into
// the bar's top edge — see the render tree's own comment below for how this
// is built (a same-color-as-the-screen disc behind the button, not real path
// clipping) and why that's a deliberately simpler stand-in for the
// reference's true concave-cradle cutout.
const NOTCH_SIZE = CENTER_BUTTON_SIZE + 16;
const BAR_HEIGHT = 64;

// Exported so the two screens this bar floats over (Home/Settings) can pad
// their own scrollable content by roughly this much, keeping the last row
// from sitting underneath the bar.
export const TAB_BAR_CONTENT_CLEARANCE = BAR_HEIGHT + spacing.lg + spacing.md;

// Outline icon when inactive, filled icon when active (Ionicons ships both
// variants for these) — per the user's own direction, selection is conveyed
// by icon *shape*, not by swapping a background badge color behind it.
const TAB_ICON: Record<
  string,
  { outline: keyof typeof Ionicons.glyphMap; filled: keyof typeof Ionicons.glyphMap }
> = {
  index: { outline: 'home-outline', filled: 'home' },
  settings: { outline: 'settings-outline', filled: 'settings' },
};

const TAB_LABEL: Record<string, string> = {
  index: copy.nav.homeTab,
  settings: copy.nav.settingsTab,
};

// Custom tab bar for the (tabs) group — a full-width, square-cornered bar
// (Home left, Settings right, flush with the screen edges and with no radius
// at all — no floating side/bottom margins, no oval corners, per the
// reference) with a circular "+" nested into a notch cut into its top edge,
// sitting exactly half in / half out of the bar. The "+" is deliberately not a
// `Tabs.Screen` of its own: it's a plain button that pushes straight to
// `/bill/new`, the same single floating action the now-retired
// FloatingActionButton.tsx used to own on Home alone. This app deliberately
// keeps to that one floating action rather than adding a fifth destination.
export function BottomTabBar({ state, navigation }: BottomTabBarProps) {
  const router = useRouter();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.wrapper}>
      {/* The bar itself — a normal theme surface (colors.surface), not the
          fixed-dark "inverted chip" this component used to hard-code: that
          made the bar render as a *light* pill even in dark mode, since
          `textPrimary` (its old fill) flips to near-white there. Using
          `surface` (and `textSecondary`/`primary` for icon/label color below)
          is what actually makes this bar track light/dark correctly. */}
      <View style={[styles.bar, { paddingBottom: insets.bottom }]}>
        {state.routes.map((route, index) => {
          const isFocused = state.index === index;
          const icons = TAB_ICON[route.name];
          const label = TAB_LABEL[route.name] ?? route.name;
          const tint = isFocused ? colors.primary : colors.textSecondary;

          function handlePress() {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          }

          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: isFocused }}
              accessibilityLabel={label}
              onPress={handlePress}
              style={({ pressed }) => [styles.tabButton, pressed && styles.tabButtonPressed]}
            >
              {icons ? (
                <Ionicons name={isFocused ? icons.filled : icons.outline} size={22} color={tint} />
              ) : null}
              <AppText
                variant="caption"
                style={[styles.label, { color: tint }, isFocused && styles.labelActive]}
              >
                {label}
              </AppText>
            </Pressable>
          );
        })}
      </View>

      {/* The background-colored disc behind the button, sized larger than
          it, is what makes the button read as sitting inside a notch cut
          into the bar's top edge rather than just floating in front of a
          flat edge — a same-color-as-the-page-background circle, not a real
          concave cutout in the bar's own path. A true cradle-shaped notch
          (concave arcs merging into the bar's rectangle) would need an SVG
          path for the bar itself; this is the simpler stand-in that reads
          the same at this size. */}
      <View pointerEvents="none" style={styles.notch} />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={copy.home.primaryAction}
        onPress={() => router.push('/bill/new')}
        style={({ pressed }) => [styles.centerButton, pressed && styles.centerButtonPressed]}
      >
        <Ionicons name="add-outline" size={28} color={colors.onPrimary} />
      </Pressable>
    </View>
  );
}

function createStyles(colors: ColorTokens) {
  return StyleSheet.create({
    // Flush with both edges and the screen's bottom — no floating side/
    // bottom margins (the reference's own nav bar spans edge to edge).
    wrapper: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      alignItems: 'center',
    },
    bar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      width: '100%',
      minHeight: BAR_HEIGHT,
      // No corner radius at all — a plain rectangle flush with both screen
      // edges and the bottom, matching the reference's own square-cornered
      // bar (not an oval/pill shape).
      paddingHorizontal: spacing.xl,
      paddingTop: spacing.sm,
      backgroundColor: colors.surface,
      borderTopWidth: 1,
      borderColor: colors.border,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: -2 },
      shadowOpacity: 0.08,
      shadowRadius: 8,
      elevation: 8,
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
    notch: {
      position: 'absolute',
      // Straddles the bar's own top edge (y=0 in this wrapper) exactly in
      // half — not offset by any portion of the bar's height, which is what
      // makes this always a true 50/50 split regardless of how tall the bar
      // ends up being once safe-area insets are added to it.
      top: -(NOTCH_SIZE / 2),
      left: '50%',
      marginLeft: -(NOTCH_SIZE / 2),
      width: NOTCH_SIZE,
      height: NOTCH_SIZE,
      borderRadius: NOTCH_SIZE / 2,
      backgroundColor: colors.background,
    },
    centerButton: {
      position: 'absolute',
      // Same 50/50 straddle as the notch above, sized to its own diameter.
      top: -(CENTER_BUTTON_SIZE / 2),
      left: '50%',
      marginLeft: -(CENTER_BUTTON_SIZE / 2),
      width: CENTER_BUTTON_SIZE,
      height: CENTER_BUTTON_SIZE,
      borderRadius: CENTER_BUTTON_RADIUS,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.28,
      shadowRadius: 12,
      elevation: 10,
    },
    centerButtonPressed: {
      backgroundColor: colors.primaryPressed,
    },
  });
}
