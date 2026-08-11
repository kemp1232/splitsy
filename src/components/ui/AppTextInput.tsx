import type { ComponentProps } from 'react';
import { useId } from 'react';
import { StyleSheet, TextInput, View, type TextInput as RNTextInput } from 'react-native';

import { colors, radius, spacing, touchTarget } from '@/theme/tokens';

import { AppText } from './AppText';
import { InlineError } from './InlineError';

type Props = ComponentProps<typeof RNTextInput> & {
  label?: string;
  error?: string;
};

export function AppTextInput({ label, error, style, ...rest }: Props) {
  const id = useId();
  return (
    <View style={styles.container}>
      {label ? (
        <AppText variant="caption" color="textSecondary" nativeID={id}>
          {label}
        </AppText>
      ) : null}
      <TextInput
        accessibilityLabelledBy={label ? id : undefined}
        placeholderTextColor={colors.textSecondary}
        style={[styles.input, error && styles.inputError, style]}
        {...rest}
      />
      {error ? <InlineError message={error} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.xs },
  input: {
    minHeight: touchTarget.min,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontSize: 15,
    color: colors.textPrimary,
    backgroundColor: colors.surface,
  },
  inputError: {
    borderColor: colors.danger,
  },
});
