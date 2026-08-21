import { useMemo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';

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
};

export function AppButton({ label, onPress, variant = 'primary', disabled, loading, pill }: Props) {
  const { colors, scheme } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const isDisabled = disabled || loading;

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
        <ActivityIndicator
          color={
            variant === 'primary' || variant === 'destructive' ? colors.onPrimary : colors.primary
          }
        />
      ) : (
        <AppText
          variant="subheading"
          color={variant === 'primary' || variant === 'destructive' ? 'onPrimary' : 'primary'}
        >
          {label}
        </AppText>
      )}
    </Pressable>
  );
}

function createStyles(colors: ColorTokens) {
  return StyleSheet.create({
    base: {
      minHeight: touchTarget.preferred,
      borderRadius: radius.md,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.lg,
    },
    disabled: {
      opacity: 0.5,
    },
    pill: {
      borderRadius: radius.pill,
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
