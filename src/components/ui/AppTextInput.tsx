import type { ComponentProps, ReactNode } from 'react';
import { useId, useMemo } from 'react';
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
};

export function AppTextInput({ label, error, style, leadingIcon, trailingIcon, ...rest }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const id = useId();
  const iconColor = colors.textSecondary;
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
          placeholderTextColor={colors.textSecondary}
          style={[
            styles.input,
            leadingIcon && styles.inputWithLeadingIcon,
            trailingIcon && styles.inputWithTrailingIcon,
            error && styles.inputError,
            style,
          ]}
          {...rest}
        />
        {trailingIcon ? <View style={styles.trailingIcon}>{trailingIcon(iconColor)}</View> : null}
      </View>
      {error ? <InlineError message={error} /> : null}
    </View>
  );
}

function createStyles(colors: ColorTokens) {
  return StyleSheet.create({
    container: { gap: spacing.xs },
    inputRow: { justifyContent: 'center' },
    input: {
      minHeight: touchTarget.min,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      borderCurve: 'continuous',
      paddingHorizontal: spacing.md,
      fontSize: 15,
      color: colors.textPrimary,
      backgroundColor: colors.surface,
    },
    inputWithLeadingIcon: {
      paddingLeft: spacing.xxl,
    },
    inputWithTrailingIcon: {
      paddingRight: spacing.xxl,
    },
    inputError: {
      borderColor: colors.danger,
    },
    leadingIcon: {
      position: 'absolute',
      left: spacing.md,
      zIndex: 1,
    },
    trailingIcon: {
      position: 'absolute',
      right: spacing.md,
      zIndex: 1,
    },
  });
}
