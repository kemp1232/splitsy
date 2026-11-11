import type { ComponentProps, ReactNode, Ref } from 'react';
import { useId, useMemo, useState } from 'react';
import { StyleSheet, TextInput, View, type TextInput as RNTextInput } from 'react-native';

import type { ColorTokens } from '@/theme/tokens';
import { radius, spacing, touchTarget } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

import { AppText } from './AppText';
import { InlineError } from './InlineError';

type Props = ComponentProps<typeof RNTextInput> & {
  label?: string;
  error?: string;
  // Same render-prop shape as AppButton's own `icon` — handing the input's
  // current border/placeholder color in keeps a leading icon visually
  // consistent with the field's own state (e.g. still legible, not
  // hardcoded, if this field ever gains its own error-tinted icon later).
  // Purely additive: every existing call site omits both and renders
  // exactly as before.
  leadingIcon?: (color: string) => ReactNode;
  // Not decoration-only like `leadingIcon` — the password-visibility eye
  // toggle this exists for needs its own tap target, so this expects the
  // caller to hand back an already-interactive node (e.g. a Pressable)
  // when it needs to do something, not just an icon glyph. Keeps the
  // toggle's own open/closed state and handler owned by the screen using
  // it, not duplicated into this shared field component.
  trailingIcon?: (color: string) => ReactNode;
  // Keeps the red error border but skips the inline message, for callers that
  // render the message elsewhere (e.g. full-width below a two-up row so it
  // doesn't make one column taller than its neighbour).
  hideErrorMessage?: boolean;
  // React 19 passes `ref` as a plain prop; it reaches the TextInput through
  // `...rest` (e.g. so a form can move focus to its next field on Enter).
  ref?: Ref<RNTextInput>;
};

export function AppTextInput({
  label,
  error,
  style,
  leadingIcon,
  trailingIcon,
  hideErrorMessage,
  onFocus,
  onBlur,
  ...rest
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const id = useId();
  // Drives the focus ring (colors.focus) — onFocus/onBlur are still
  // forwarded to the caller's own handlers unchanged.
  const [focused, setFocused] = useState(false);
  const iconColor = focused ? colors.primary : colors.textSecondary;
  return (
    <View style={styles.container}>
      {label ? (
        <AppText variant="caption" color="textSecondary" nativeID={id}>
          {label}
        </AppText>
      ) : null}
      <View style={styles.inputRow}>
        {leadingIcon ? <View style={styles.leadingIcon}>{leadingIcon(iconColor)}</View> : null}
        <TextInput
          accessibilityLabelledBy={label ? id : undefined}
          placeholderTextColor={colors.textMuted}
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
          style={[
            styles.input,
            leadingIcon && styles.inputWithLeadingIcon,
            trailingIcon && styles.inputWithTrailingIcon,
            focused && styles.inputFocused,
            error && styles.inputError,
            style,
          ]}
          {...rest}
        />
        {trailingIcon ? <View style={styles.trailingIcon}>{trailingIcon(iconColor)}</View> : null}
      </View>
      {error && !hideErrorMessage ? <InlineError message={error} /> : null}
    </View>
  );
}

function createStyles(colors: ColorTokens) {
  return StyleSheet.create({
    container: { gap: spacing.xs },
    inputRow: { justifyContent: 'center' },
    input: {
      minHeight: touchTarget.preferred,
      borderWidth: 1.5,
      borderColor: colors.border,
      borderRadius: radius.button,
      borderCurve: 'continuous',
      paddingHorizontal: spacing.lg,
      fontSize: 15,
      color: colors.textPrimary,
      backgroundColor: colors.surfaceMuted,
      // The lavender border below is the focus ring — suppress the browser's
      // own focus outline on web, which otherwise draws a second, white ring
      // over it. (No-op on native.)
      outlineWidth: 0,
    },
    inputFocused: {
      borderColor: colors.focus,
    },
    inputWithLeadingIcon: {
      paddingLeft: spacing.xxl + spacing.md,
    },
    inputWithTrailingIcon: {
      paddingRight: spacing.xxl,
    },
    inputError: {
      borderColor: colors.danger,
    },
    leadingIcon: {
      position: 'absolute',
      left: spacing.lg,
      zIndex: 1,
    },
    trailingIcon: {
      position: 'absolute',
      right: spacing.md,
      zIndex: 1,
    },
  });
}
