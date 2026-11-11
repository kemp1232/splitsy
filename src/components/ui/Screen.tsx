import type { PropsWithChildren } from 'react';
import { useMemo } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  type ScrollViewProps,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import type { ColorTokens } from '@/theme/tokens';
import { CONTENT_MAX_WIDTH, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

import { AppBackground, type AppBackgroundVariant } from './AppBackground';

type Props = PropsWithChildren<{
  scroll?: boolean;
  padded?: boolean;
  // Set by every /bill/** screen, where the global BottomTabBar is hidden
  // (tabBarVisibility.ts) — see the edges note below. An explicit,
  // route-local prop rather than reading the global pathname here, so a
  // screen lower in the stack never re-renders or flips its inset just
  // because a bill screen is pushed on top of it.
  tabBarHidden?: boolean;
  // Forwarded to the `scroll` ScrollView — e.g. "handled" so a tap on a
  // button with the keyboard open presses it instead of only dismissing
  // the keyboard. Unset keeps ScrollView's own default.
  keyboardShouldPersistTaps?: ScrollViewProps['keyboardShouldPersistTaps'];
  // Which AppBackground ambient composition sits behind this screen
  // (2026-11 redesign). Defaults to 'default'; 'none' renders only the flat
  // background color.
  background?: AppBackgroundVariant | 'none';
}>;

// Used to have a `footer` prop for a sticky bottom action bar
// (BottomActionBar.tsx) rendered outside the scrollable content. Removed
// 2026-08-27 per the user's own explicit request to drop sticky nav footers
// everywhere in favor of plain in-flow buttons — every screen that used to
// pass one now renders its action button(s) as regular scrollable content
// instead, reserving space for the global BottomTabBar itself via
// TAB_BAR_CONTENT_CLEARANCE where needed.
//
// The bottom safe-area edge is normally left to the BottomTabBar (which pads
// itself by insets.bottom); on /bill/** the bar is hidden, so `tabBarHidden`
// makes this apply the bottom edge itself there instead.
const EDGES_WITH_TAB_BAR: Edge[] = ['top', 'left', 'right'];
const EDGES_WITHOUT_TAB_BAR: Edge[] = ['top', 'left', 'right', 'bottom'];

export function Screen({
  scroll = false,
  padded = true,
  tabBarHidden = false,
  keyboardShouldPersistTaps,
  background = 'default',
  children,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const edges = tabBarHidden ? EDGES_WITHOUT_TAB_BAR : EDGES_WITH_TAB_BAR;

  return (
    <SafeAreaView style={styles.safeArea} edges={edges}>
      {/* Absolute-fill and style.pointerEvents 'none' — sits behind everything
          below (including the ScrollView, so it never scrolls with the
          content), spans the full window width even when the content
          column below is capped on desktop web, and ignores the safe-area
          padding so it reaches under the status bar too. */}
      {background === 'none' ? null : <AppBackground variant={background} />}
      {/* Web desktop widening (see theme/tokens.ts's own CONTENT_MAX_WIDTH
          comment) — a plain flex child of `safeArea`, centered via
          `alignSelf` rather than any absolute-positioning trick, so it's
          ordinary, unambiguous RN flexbox with no CSS-specific escape
          hatch needed. `safeArea`'s own background keeps filling the full
          browser width behind it, letterboxing the sides once this caps
          out. Inert everywhere else (every native screen, and any web
          viewport narrower than the cap) — this wrapper's width already
          equals 100% of its parent there, same as before this existed. */}
      <View style={styles.desktopCenterWrap}>
        <KeyboardAvoidingView
          style={styles.flex}
          // Keeps focused form fields reachable above the keyboard instead of
          // letting it cover them (spec section 17). iOS never resizes the
          // window for the keyboard, so the content has to be pushed up by its
          // height ("padding"). Android is deliberately left alone
          // (`undefined`, i.e. no extra behavior): this is an Expo-managed app,
          // and Expo's generated AndroidManifest sets
          // `android:windowSoftInputMode="adjustResize"` by default, which
          // already resizes this screen's own window for the keyboard — adding
          // a second, JS-driven resize on top of that (behavior="height") would
          // double-compensate and produce janky, over-shrunk layouts instead of
          // fixing anything.
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {scroll ? (
            <ScrollView
              contentContainerStyle={[styles.grow, padded && styles.padded]}
              keyboardShouldPersistTaps={keyboardShouldPersistTaps}
            >
              {children}
            </ScrollView>
          ) : (
            <View style={[styles.flex, padded && styles.padded]}>{children}</View>
          )}
        </KeyboardAvoidingView>
      </View>
    </SafeAreaView>
  );
}

function createStyles(colors: ColorTokens) {
  return StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: colors.background },
    desktopCenterWrap: {
      flex: 1,
      width: '100%',
      maxWidth: Platform.OS === 'web' ? CONTENT_MAX_WIDTH : undefined,
      alignSelf: 'center',
    },
    flex: { flex: 1 },
    grow: { flexGrow: 1 },
    padded: { padding: spacing.lg },
  });
}
