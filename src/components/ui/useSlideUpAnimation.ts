import { useEffect, useState } from 'react';
import { Animated } from 'react-native';

// How far below its resting position the sheet starts — large enough to
// clear any of this app's sheet heights on a typical phone screen without
// measuring it at runtime, the same "generous fixed value over runtime
// layout measurement" tradeoff BottomTabBar.tsx's own tunable constants make.
const SLIDE_DISTANCE = 600;
const SLIDE_DURATION_MS = 220;

// A Modal's own `animationType="slide"` (or "fade") transforms its ENTIRE
// rendered content as one block — backdrop and sheet together — which reads
// as the dimmed backdrop itself sliding up from the bottom along with the
// sheet, rather than appearing instantly (or fading) behind an
// already-dimmed screen with just the sheet card sliding up on top of it.
// Callers set the Modal's own `animationType` to "none" and apply this
// hook's returned value as the sheet content's own
// `transform: [{ translateY }]` (via a wrapping `Animated.View`, since a
// plain `Pressable`/`View` can't itself host an Animated.Value) instead.
export function useSlideUpAnimation(visible: boolean) {
  // A lazy useState initializer, not useRef(...).current — this Animated.Value
  // is still a single stable, mutable instance across the component's whole
  // lifetime (never replaced, only driven via .setValue()/Animated.timing()
  // below), but the newer react-hooks/refs lint rule flags reading a ref's
  // .current during render, however safe this particular usage is.
  const [translateY] = useState(() => new Animated.Value(SLIDE_DISTANCE));

  useEffect(() => {
    if (visible) {
      Animated.timing(translateY, {
        toValue: 0,
        duration: SLIDE_DURATION_MS,
        useNativeDriver: true,
      }).start();
    } else {
      // Resets instantly (no exit animation, matching the backdrop's own
      // instant disappearance) so the next open always starts from the
      // bottom again, rather than wherever it happened to be left.
      translateY.setValue(SLIDE_DISTANCE);
    }
  }, [visible, translateY]);

  return translateY;
}
