import { Image } from 'expo-image';
import type { ComponentProps, ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Animated, StyleSheet } from 'react-native';

import type { ColorTokens } from '@/theme/tokens';
import { spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

import { AppText } from './AppText';

// Same fade duration/mechanism as SplashLoadingScreen.tsx (kept as a
// separate constant rather than importing that file's — this component is
// laid out in-flow as a screen's own content, not as an absolute overlay on
// top of other screens, so the two aren't sharing more than the motion
// itself). Kept identical on purpose: this is the "copy the fading in
// fading out" from the splash screen the user asked for.
const FADE_DURATION_MS = 350;

type Props = {
  // Whether this panel should be showing right now. Like
  // SplashLoadingScreen, this component fades itself out over
  // FADE_DURATION_MS rather than vanishing instantly — the caller is
  // expected to keep rendering it (`visible={false}`) until
  // onFadeOutComplete fires, then unmount it, exactly the same
  // `showX`/`onFadeOutComplete` pattern _layout.tsx's SessionGate already
  // uses for the splash screen itself.
  visible: boolean;
  // Same type expo-image's own `source` prop accepts — a static
  // require('...') resolves to Metro's opaque numeric module id, not the
  // object-shaped ImageSource, so typing this any narrower would reject the
  // exact require(...) calls this component exists to take.
  image: ComponentProps<typeof Image>['source'];
  heading: string;
  body: string;
  onFadeOutComplete?: () => void;
  // Extra content below the body text (e.g. processing.tsx's stage label,
  // or its "Check Receipt" button) — kept a slot rather than more string
  // props since it varies more than heading/body do between callers.
  children?: ReactNode;
};

// The "image + spinner + message" visual treatment SplashLoadingScreen.tsx
// established for the app-boot splash, factored out so processing.tsx's
// scanning/queued panels can reuse the same look and the same fade-in/out
// motion instead of a from-scratch layout — per the user's own "make a
// similar UI ... copy the fading in fading out" request. Deliberately not
// absolutely positioned/full-screen like SplashLoadingScreen (which overlays
// other already-mounted screens while it fades out) — this renders in-flow
// as a screen's own primary content instead.
export function FadeImageStatus({ visible, image, heading, body, onFadeOutComplete, children }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  // Lazy useState initializer, not useRef(...).current — see
  // SplashLoadingScreen.tsx/useSlideUpAnimation.ts's own identical comment
  // on why (satisfies the react-hooks/refs lint rule).
  const [opacity] = useState(() => new Animated.Value(visible ? 1 : 0));

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
    // onFadeOutComplete intentionally excluded — see SplashLoadingScreen.tsx's
    // identical comment: this should only re-run when `visible` itself
    // changes, not when the caller's own inline callback identity does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, opacity]);

  return (
    <Animated.View
      style={[styles.container, { opacity }]}
      pointerEvents={visible ? 'auto' : 'none'}
      accessibilityViewIsModal={visible}
    >
      <Image
        source={image}
        style={styles.image}
        contentFit="contain"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
      <ActivityIndicator size="large" color={colors.primary} />
      <AppText variant="heading" style={styles.centerText} accessibilityLiveRegion="polite">
        {heading}
      </AppText>
      <AppText variant="body" color="textSecondary" style={styles.centerText}>
        {body}
      </AppText>
      {children}
    </Animated.View>
  );
}

function createStyles(colors: ColorTokens) {
  return StyleSheet.create({
    container: { alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
    centerText: { textAlign: 'center' },
    image: { width: 240, height: 160 },
  });
}
