import type { PropsWithChildren } from 'react';
import { useMemo } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { ColorTokens } from '@/theme/tokens';
import { spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

type Props = PropsWithChildren<{
  scroll?: boolean;
  padded?: boolean;
}>;

// Used to have a `footer` prop for a sticky bottom action bar
// (BottomActionBar.tsx) rendered outside the scrollable content. Removed
// 2026-08-27 per the user's own explicit request to drop sticky nav footers
// everywhere in favor of plain in-flow buttons — every screen that used to
// pass one now renders its action button(s) as regular scrollable content
// instead, reserving space for the global BottomTabBar itself via
// TAB_BAR_CONTENT_CLEARANCE where needed.
export function Screen({ scroll = false, padded = true, children }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
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
          <ScrollView contentContainerStyle={[styles.grow, padded && styles.padded]}>
            {children}
          </ScrollView>
        ) : (
          <View style={[styles.flex, padded && styles.padded]}>{children}</View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function createStyles(colors: ColorTokens) {
  return StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: colors.background },
    flex: { flex: 1 },
    grow: { flexGrow: 1 },
    padded: { padding: spacing.lg },
  });
}
