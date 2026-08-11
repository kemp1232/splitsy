import type { PropsWithChildren, ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, spacing } from '@/theme/tokens';

type Props = PropsWithChildren<{
  scroll?: boolean;
  padded?: boolean;
  // Rendered as a sibling after the scrollable/flex content, never inside the
  // ScrollView — this is where BottomActionBar goes so it stays fixed instead
  // of scrolling away with the rest of the screen (spec section 17).
  footer?: ReactNode;
}>;

export function Screen({ scroll = false, padded = true, footer, children }: Props) {
  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        style={styles.flex}
        // Keeps a fixed `footer` (BottomActionBar) reachable above the
        // keyboard instead of letting it get covered (spec section 17). iOS
        // never resizes the window for the keyboard, so the content has to be
        // pushed up by its height ("padding"). Android is deliberately left
        // alone (`undefined`, i.e. no extra behavior): this is an
        // Expo-managed app, and Expo's generated AndroidManifest sets
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
        {footer}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  grow: { flexGrow: 1 },
  padded: { padding: spacing.lg },
});
