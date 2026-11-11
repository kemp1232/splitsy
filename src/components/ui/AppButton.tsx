import Feather from '@expo/vector-icons/Feather';
import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Animated, Pressable, StyleSheet, View } from 'react-native';

import type { ColorTokens } from '@/theme/tokens';
import { radius, spacing, touchTarget } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

import { AppText } from './AppText';
import { usePressFeedback } from './usePressFeedback';

type Variant = 'primary' | 'secondary' | 'text' | 'destructive';

type Props = {
  label: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  /**
   * @deprecated No-op since the 2026-11 redesign: every AppButton variant
   * now renders as a fully-rounded pill (radius.pill) by default. Kept only
   * so existing call sites (e.g. "Settle up") still type-check; it no longer
   * changes the button's shape.
   */
  pill?: boolean;
  // Opts this button into a taller (52 instead of 48) hit area for a screen's
  // single dominant full-width action (e.g. a docked "Add people" CTA).
  large?: boolean;
  // A render-prop, not a bare ReactNode or a glyph-name lookup: this button
  // already computes the correct per-variant label color below (onPrimary vs
  // primary) — handing that color into the factory guarantees an icon always
  // matches it (dark mode included) without a React.cloneElement trick, and
  // without a second, IconButton-inconsistent "icon" API (IconButton's own
  // `icon: ReactNode` prop doesn't have this per-variant-color problem, so it
  // doesn't need the same treatment). e.g.
  // `icon={(color) => <Feather name="arrow-right-circle" size={18} color={color} />}`
  icon?: (color: string) => ReactNode;
  iconPosition?: 'leading' | 'trailing';
  // 2026-11 redesign: the reference's trailing arrow-in-a-circle on a
  // screen's main forward CTA. Optional; omitted everywhere by default.
  trailingArrow?: boolean;
};

export function AppButton({
  label,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  large,
  icon,
  iconPosition = 'leading',
  trailingArrow,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const press = usePressFeedback();
  // Tracked here (not via Pressable's style/children function) because the
  // pressable itself is the animated element below.
  const [pressed, setPressed] = useState(false);
  const isDisabled = disabled || loading;
  const isPressed = pressed && !isDisabled;
  const contentColor =
    variant === 'primary' || variant === 'destructive' ? colors.onPrimary : colors.primary;

  return (
    // The pressable itself carries all the visible chrome (radius, fill,
    // border, min height) and the press-scale transform, so the pill always
    // fills exactly the box the parent lays out — equal heights side by side
    // in a row (e.g. ConfirmationDialog's actions) at any font scale — and
    // the web focus outline follows the pill's own radius.
    <AnimatedPressable
      accessibilityRole="button"
      aria-disabled={isDisabled}
      onPress={onPress}
      onPressIn={() => {
        setPressed(true);
        press.onPressIn();
      }}
      onPressOut={() => {
        setPressed(false);
        press.onPressOut();
      }}
      disabled={isDisabled}
      style={[
        styles.base,
        styles[variant],
        large && styles.large,
        isPressed && styles[PRESSED_STYLE[variant]],
        isDisabled && styles.disabled,
        press.animatedStyle,
      ]}
    >
      {/* The primary CTA's lavender gradient fill (2026-11 redesign); a flat
          primaryPressed fill while pressed for a clearly stronger pressed
          state. */}
      {variant === 'primary' ? (
        <LinearGradient
          colors={
            isPressed
              ? [colors.primaryPressed, colors.primaryPressed]
              : [colors.gradientStart, colors.gradientEnd]
          }
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      {loading ? (
        <ActivityIndicator color={contentColor} />
      ) : (
        <View style={styles.content}>
          {icon && iconPosition === 'leading' ? icon(contentColor) : null}
          <AppText
            variant="subheading"
            color={variant === 'primary' || variant === 'destructive' ? 'onPrimary' : 'primary'}
            style={styles.label}
          >
            {label}
          </AppText>
          {icon && iconPosition === 'trailing' ? icon(contentColor) : null}
          {trailingArrow ? (
            <View
              style={[styles.arrowCircle, { borderColor: contentColor }]}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              <Feather name="arrow-right" size={14} color={contentColor} />
            </View>
          ) : null}
        </View>
      )}
    </AnimatedPressable>
  );
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const PRESSED_STYLE = {
  primary: 'primaryPressed',
  secondary: 'secondaryPressed',
  text: 'textPressed',
  destructive: 'destructivePressed',
} as const satisfies Record<Variant, string>;

function createStyles(colors: ColorTokens) {
  return StyleSheet.create({
    // 2026-11 redesign: every button is a fully-rounded pill (the reference's
    // CTA shape) — see the deprecated `pill` prop.
    base: {
      minHeight: touchTarget.preferred,
      borderRadius: radius.pill,
      borderCurve: 'continuous',
      alignItems: 'center',
      justifyContent: 'center',
      // 12, not 20: leaves room for an icon + two-word label on one line in
      // a half-width slot on a ~390dp phone (Share summary / Copy breakdown,
      // Choose from photos / Scan next bill). Larger font scales still wrap.
      // Full-width CTAs are unaffected (their content is centered).
      paddingHorizontal: spacing.md,
      overflow: 'hidden',
    },
    content: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
    },
    // App-wide: every button's label renders at this one size (the single
    // component every AppButton renders its label through).
    // `variant="subheading"` still carries its 600 weight.
    label: {
      fontSize: 15,
      lineHeight: 20,
    },
    arrowCircle: {
      width: 24,
      height: 24,
      borderRadius: radius.pill,
      borderWidth: 1.5,
      alignItems: 'center',
      justifyContent: 'center',
    },
    disabled: {
      opacity: 0.5,
    },
    large: {
      minHeight: 52,
    },
    primary: { backgroundColor: colors.primary },
    secondary: {
      backgroundColor: 'transparent',
      borderWidth: 1.5,
      borderColor: colors.primary,
    },
    text: { backgroundColor: 'transparent' },
    destructive: { backgroundColor: colors.danger },
    primaryPressed: { backgroundColor: colors.primaryPressed },
    secondaryPressed: { backgroundColor: colors.surfaceElevated },
    textPressed: { backgroundColor: colors.surfaceElevated },
    // Theme-aware darker/dimmer `danger` (see tokens.ts's dangerPressed).
    destructivePressed: { backgroundColor: colors.dangerPressed },
  });
}
