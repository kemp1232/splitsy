import { Image } from 'expo-image';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Animated, StyleSheet, View } from 'react-native';

import appInfo from '@/constants/appInfo.json';
import { copy } from '@/constants/copy';
import type { ColorTokens } from '@/theme/tokens';
import { spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

import { AppText } from './AppText';

// Fade duration for both directions — kept short and identical each way so
// the transition reads as one continuous motion rather than a slow fade in
// followed by a snappier fade out (or vice versa).
const FADE_DURATION_MS = 350;

type Props = {
  // Owned by the caller (see _layout.tsx's SessionGate) — true for the
  // whole startup sequence (DB migrations, then the initial session
  // check), flips to false once there's a real screen ready to reveal
  // underneath this overlay. This component only animates in response to
  // that prop changing; it never decides on its own when "ready" is.
  visible: boolean;
  // Fires once the fade-*out* finishes (never on fade-in) — the caller's
  // cue to actually unmount this overlay, so it isn't kept around
  // (invisible but still in the tree) for the rest of the session.
  onFadeOutComplete?: () => void;
};

// The one full-screen splash shown across the app's entire startup
// sequence (see _layout.tsx) — replaces the old bare, message-only
// LoadingState that used to show separately for the DB-migration wait and
// then again (with no message at all) for the initial session check,
// which read as two different, disconnected loading moments rather than
// one continuous "the app is starting up." Plain RN `Animated` (opacity
// only, useNativeDriver), matching this codebase's established animation
// convention — Reanimated is not installed here.
export function SplashLoadingScreen({ visible, onFadeOutComplete }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  // A lazy useState initializer, not useRef(...).current — see
  // useSlideUpAnimation.ts's own identical comment on why: still a
  // single stable, mutable Animated.Value instance for this component's
  // whole lifetime, just written in the one shape the react-hooks/refs
  // lint rule doesn't flag.
  const [opacity] = useState(() => new Animated.Value(1));

  useEffect(() => {
    const animation = Animated.timing(opacity, {
      toValue: visible ? 1 : 0,
      duration: FADE_DURATION_MS,
      useNativeDriver: true,
    });
    animation.start(({ finished }) => {
      if (finished && !visible) onFadeOutComplete?.();
    });
    return () => animation.stop();
    // onFadeOutComplete intentionally excluded — this effect should only
    // ever re-run when `visible` itself changes, not when the caller's own
    // callback identity does (SessionGate's own inline arrow function is a
    // new reference every render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, opacity]);

  return (
    <Animated.View
      style={[styles.container, { opacity }]}
      pointerEvents={visible ? 'auto' : 'none'}
      // Still announced once while genuinely showing — the message text
      // below already carries this, `accessibilityViewIsModal` just keeps
      // a screen reader from also wandering into whatever's mounted (but
      // hidden) underneath while this overlay is up.
      accessibilityViewIsModal={visible}
    >
      <View style={styles.brandRow}>
        <Image
          source={require('../../../assets/images/logo.png')}
          style={styles.logo}
          contentFit="contain"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
        <AppText variant="subheading">{appInfo.name}</AppText>
      </View>
      <Image
        source={require('../../../assets/images/loading.png')}
        style={styles.image}
        contentFit="contain"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
      <ActivityIndicator size="large" color={colors.primary} />
      <AppText variant="body" color="textSecondary" accessibilityLiveRegion="polite">
        {copy.global.settingUpDatabase}
      </AppText>
    </Animated.View>
  );
}

function createStyles(colors: ColorTokens) {
  return StyleSheet.create({
    container: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: colors.background,
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.lg,
      // Sits above whatever the real app tree renders underneath while
      // this is still fading out.
      zIndex: 10,
    },
    brandRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    logo: {
      width: 48,
      height: 48,
    },
    image: {
      width: 240,
      height: 160,
    },
  });
}
