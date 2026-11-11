import { memo, useId, useState } from 'react';
import { type LayoutChangeEvent, StyleSheet, View } from 'react-native';
import Svg, {
  Circle,
  Defs,
  LinearGradient,
  Path,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';

import { useTheme } from '@/theme/ThemeProvider';

import { type AppBackgroundVariant, buildAmbientShapes } from './appBackgroundVariants';

export type { AppBackgroundVariant } from './appBackgroundVariants';

type Props = {
  variant?: AppBackgroundVariant;
};

// The app-wide ambient backdrop (2026-11 "Playful Fintech Minimalism"): a
// near-black vertical wash with a few very low-contrast, soft purple organic
// shapes rising from the corners. Purely decorative — absolute-fill,
// style.pointerEvents 'none' (not the prop, which react-native-web
// deprecates), hidden from screen readers, never animated and
// never blurred. Screen.tsx renders it once behind every screen's content
// (behind the ScrollView, so it doesn't scroll); full-screen overlays that
// don't use Screen (SplashLoadingScreen) render it themselves.
//
// Sized from its own onLayout (vercel-react-native-skills ui-measure-views),
// never from the window dimensions. Gradient ids come from useId(): on web
// several stacked screens stay mounted at once and SVG ids share one DOM
// namespace, so fixed ids would collide.
function AppBackgroundImpl({ variant = 'default' }: Props) {
  const { colors } = useTheme();
  const [size, setSize] = useState({ width: 0, height: 0 });
  const idBase = useId().replace(/[^a-zA-Z0-9_-]/g, '');

  function handleLayout(event: LayoutChangeEvent) {
    const { width, height } = event.nativeEvent.layout;
    if (width !== size.width || height !== size.height) setSize({ width, height });
  }

  const shapes = buildAmbientShapes(variant, size.width, size.height);
  const washId = `${idBase}-wash`;

  return (
    <View
      style={[
        StyleSheet.absoluteFill,
        { backgroundColor: colors.background, pointerEvents: 'none' },
      ]}
      onLayout={handleLayout}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {size.width > 0 && size.height > 0 ? (
        <Svg width={size.width} height={size.height}>
          <Defs>
            <LinearGradient id={washId} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={colors.background} stopOpacity={1} />
              <Stop offset="1" stopColor={colors.backgroundDeep} stopOpacity={1} />
            </LinearGradient>
            {shapes.map((shape, index) =>
              shape.kind === 'glow' ? (
                <RadialGradient
                  key={index}
                  id={`${idBase}-s${index}`}
                  cx={shape.cx}
                  cy={shape.cy}
                  r={shape.r}
                  gradientUnits="userSpaceOnUse"
                >
                  <Stop offset="0" stopColor={colors[shape.tone]} stopOpacity={shape.opacity} />
                  <Stop offset="1" stopColor={colors[shape.tone]} stopOpacity={0} />
                </RadialGradient>
              ) : (
                <LinearGradient
                  key={index}
                  id={`${idBase}-s${index}`}
                  x1="0"
                  y1={shape.y1}
                  x2="0"
                  y2={shape.y2}
                  gradientUnits="userSpaceOnUse"
                >
                  <Stop offset="0" stopColor={colors[shape.tone]} stopOpacity={shape.edgeOpacity} />
                  <Stop
                    offset="1"
                    stopColor={colors[shape.tone]}
                    stopOpacity={shape.innerOpacity}
                  />
                </LinearGradient>
              ),
            )}
          </Defs>
          <Rect x={0} y={0} width={size.width} height={size.height} fill={`url(#${washId})`} />
          {shapes.map((shape, index) =>
            shape.kind === 'glow' ? (
              <Circle
                key={index}
                cx={shape.cx}
                cy={shape.cy}
                r={shape.r}
                fill={`url(#${idBase}-s${index})`}
              />
            ) : (
              <Path key={index} d={shape.d} fill={`url(#${idBase}-s${index})`} />
            ),
          )}
        </Svg>
      ) : null}
    </View>
  );
}

export const AppBackground = memo(AppBackgroundImpl);
