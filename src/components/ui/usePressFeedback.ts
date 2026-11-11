import { useState } from 'react';
import { Animated } from 'react-native';

import { useReducedMotion } from './useReducedMotion';

const PRESS_DURATION_MS = 120;
const PRESSED_SCALE = 0.97;

// Subtle press feedback (2026-11 redesign): a ~120ms scale-down on press-in
// and back on press-out — transform only (GPU-friendly, native driver), so
// it never touches layout. Wire `onPressIn`/`onPressOut` to the Pressable
// and apply `animatedStyle` to an Animated.View *inside* it, so the
// Pressable itself stays the one accessible element. Respects the OS
// reduce-motion setting (no scale at all when it's on — the caller's own
// pressed color/opacity style still gives feedback).
export function usePressFeedback() {
  const reduceMotion = useReducedMotion();
  // Lazy useState rather than useRef(...).current — same react-hooks/refs
  // reasoning as useSlideUpAnimation.ts.
  const [scale] = useState(() => new Animated.Value(1));

  function animateTo(toValue: number) {
    if (reduceMotion) {
      // No motion: never scale down, and always land back on exactly 1 (even
      // if the setting flipped on mid-press).
      scale.stopAnimation();
      scale.setValue(1);
      return;
    }
    Animated.timing(scale, {
      toValue,
      duration: PRESS_DURATION_MS,
      useNativeDriver: true,
    }).start();
  }

  return {
    onPressIn: () => animateTo(PRESSED_SCALE),
    onPressOut: () => animateTo(1),
    animatedStyle: { transform: [{ scale }] },
  };
}
