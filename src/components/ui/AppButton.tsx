import type { ReactNode } from 'react';
import { useMemo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import type { ColorTokens } from '@/theme/tokens';
import { radius, spacing, touchTarget } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

import { AppText } from './AppText';

type Variant = 'primary' | 'secondary' | 'text' | 'destructive';

type Props = {
  label: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  // Opts this button into the reference UI's fully-rounded "pill" shape
  // (radius.pill instead of the usual radius.md) for the app's most
  // prominent bottom-of-screen primary actions (e.g. "Settle up", "Finish
  // and save") — left off by default so every other button keeps its
  // existing, less attention-grabbing corner radius.
  pill?: boolean;
  // A render-prop, not a bare ReactNode or a glyph-name lookup: this button
  // already computes the correct per-variant label color below (onPrimary vs
  // primary) — handing that color into the factory guarantees an icon always
  // matches it (dark mode included) without a React.cloneElement trick, and
  // without a second, IconButton-inconsistent "icon" API (IconButton's own
  // `icon: ReactNode` prop doesn't have this per-variant-color problem, so it
  // doesn't need the same treatment). e.g.
  // `icon={(color) => <Feather name="arrow-right" size={18} color={color} />}`
  icon?: (color: string) => ReactNode;
  iconPosition?: 'leading' | 'trailing';
};

export function AppButton({
  label,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  pill,
  icon,
  iconPosition = 'leading',
}: Props) {
  const { colors, scheme } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const isDisabled = disabled || loading;
  const contentColor =
    variant === 'primary' || variant === 'destructive' ? colors.onPrimary : colors.primary;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled }}
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        styles[variant],
        pill && styles.pill,
        pressed && !isDisabled && pressedStyles(colors, scheme)[variant],
        isDisabled && styles.disabled,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={contentColor} />
      ) : (
        <View style={styles.content}>
          {icon && iconPosition === 'leading' ? icon(contentColor) : null}
          <AppText
            variant="subheading"
            color={variant === 'primary' || variant === 'destructive' ? 'onPrimary' : 'primary'}
          >
            {label}
          </AppText>
          {icon && iconPosition === 'trailing' ? icon(contentColor) : null}
        </View>
      )}
    </Pressable>
  );
}

function createStyles(colors: ColorTokens) {
  return StyleSheet.create({
    base: {
      minHeight: touchTarget.preferred,
      borderRadius: radius.md,
      borderCurve: 'continuous',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.lg,
    },
    content: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs,
    },
    disabled: {
      opacity: 0.5,
    },
    pill: {
      borderRadius: radius.pill,
      borderCurve: 'continuous',
    },
    primary: { backgroundColor: colors.primary },
    secondary: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.primary },
    text: { backgroundColor: 'transparent' },
    destructive: { backgroundColor: colors.danger },
  });
}

// A pressed-state palette rather than a static StyleSheet — computed fresh
// per render alongside `styles` above (both are cheap object literals), kept
// as its own small function only to mirror the variant-keyed shape of
// createStyles rather than inlining a lookup at each call site.
//
// `destructive`'s pressed color isn't a token — `danger` itself flips between
// a dark red (light theme) and a light coral (dark theme, see tokens.ts's
// header comment), so "pressed" needs its own theme-aware darker/dimmer shade
// in each direction rather than one fixed hex that would only work for one
// theme.
function pressedStyles(
  colors: ColorTokens,
  scheme: 'light' | 'dark',
): Record<Variant, { backgroundColor: string }> {
  return {
    primary: { backgroundColor: colors.primaryPressed },
    secondary: { backgroundColor: colors.surfaceMuted },
    text: { backgroundColor: colors.surfaceMuted },
    destructive: { backgroundColor: scheme === 'dark' ? '#E56F63' : '#8C1D17' },
  };
}
