import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppButton } from '@/components/ui/AppButton';
import { AppText } from '@/components/ui/AppText';
import { AppTextInput } from '@/components/ui/AppTextInput';
import { InlineError } from '@/components/ui/InlineError';
import { Screen } from '@/components/ui/Screen';
import { copy } from '@/constants/copy';
import {
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  passwordsMatch,
  validateNewPassword,
} from '@/features/auth/validateAuthForm';
import { authClient } from '@/lib/authClient';
import { spacing } from '@/theme/tokens';

// Reset password — src/app/(auth)/reset-password.tsx (2026-08-25 spec
// Amendment). Reached via the deep link built by forgot-password.tsx
// (`splitsy://reset-password?token=...`, relayed through
// server/src/auth.ts's emailed link) — `token` arrives as a route param from
// that link, which is the one legitimate source for it (there is no local
// repository for a one-time password-reset token the way there is for bill
// data).
export default function ResetPasswordScreen() {
  const router = useRouter();
  const { token } = useLocalSearchParams<{ token?: string }>();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [newPasswordError, setNewPasswordError] = useState<string | null>(null);
  const [confirmPasswordError, setConfirmPasswordError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!token) {
    return (
      <Screen scroll>
        <View style={styles.body}>
          <View style={styles.headerGroup}>
            <AppText variant="heading">{copy.auth.resetPasswordMissingTokenHeading}</AppText>
            <AppText variant="body" color="textSecondary">
              {copy.auth.resetPasswordMissingTokenBody}
            </AppText>
          </View>
          <AppButton
            label={copy.auth.requestNewLinkAction}
            onPress={() => router.replace('/forgot-password')}
          />
        </View>
      </Screen>
    );
  }

  async function handleResetPassword() {
    const passwordResult = validateNewPassword(newPassword);
    setNewPasswordError(
      passwordResult.valid
        ? null
        : passwordResult.reason === 'required'
          ? copy.auth.requiredPasswordError
          : passwordResult.reason === 'tooShort'
            ? copy.auth.passwordTooShortError.replace('{minLength}', String(MIN_PASSWORD_LENGTH))
            : copy.auth.passwordTooLongError.replace('{maxLength}', String(MAX_PASSWORD_LENGTH)),
    );
    const matches =
      passwordResult.valid && passwordsMatch(passwordResult.password, confirmPassword);
    setConfirmPasswordError(
      passwordResult.valid && !matches ? copy.auth.passwordMismatchError : null,
    );
    if (!passwordResult.valid || !matches) return;

    setFormError(null);
    setSubmitting(true);
    try {
      const { error } = await authClient.resetPassword({
        newPassword: passwordResult.password,
        token,
      });
      if (error) {
        setFormError(
          error.code === 'INVALID_TOKEN'
            ? copy.auth.resetPasswordInvalidTokenError
            : copy.auth.genericAuthError,
        );
        setSubmitting(false);
        return;
      }
      // Routes to sign-in with a success message, rather than showing it
      // here — sign-in.tsx reads this `justReset` param once to display it.
      router.replace({ pathname: '/sign-in', params: { justReset: '1' } });
    } catch {
      setFormError(copy.auth.networkError);
      setSubmitting(false);
    }
  }

  return (
    <Screen scroll>
      <View style={styles.body}>
        <View style={styles.headerGroup}>
          <AppText variant="heading">{copy.auth.resetPasswordHeading}</AppText>
          <AppText variant="body" color="textSecondary">
            {copy.auth.resetPasswordBody}
          </AppText>
        </View>

        <View style={styles.fields}>
          <AppTextInput
            label={copy.auth.newPasswordLabel}
            value={newPassword}
            onChangeText={(value) => {
              setNewPassword(value);
              if (newPasswordError) setNewPasswordError(null);
            }}
            error={newPasswordError ?? undefined}
            secureTextEntry
            textContentType="newPassword"
            autoComplete="new-password"
          />

          <AppTextInput
            label={copy.auth.confirmPasswordLabel}
            value={confirmPassword}
            onChangeText={(value) => {
              setConfirmPassword(value);
              if (confirmPasswordError) setConfirmPasswordError(null);
            }}
            error={confirmPasswordError ?? undefined}
            secureTextEntry
            textContentType="newPassword"
            autoComplete="new-password"
          />
        </View>

        <View style={styles.actions}>
          {/* Was a sticky BottomActionBar footer — moved inline, per the
              user's own explicit request (2026-08-27) to drop sticky nav
              footers in favor of plain in-flow buttons. */}
          {formError ? <InlineError message={formError} /> : null}
          <AppButton
            label={copy.auth.resetPasswordButton}
            onPress={handleResetPassword}
            loading={submitting}
            icon={(color) => <Feather name="arrow-right-circle" size={18} color={color} />}
            iconPosition="trailing"
          />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: spacing.xl,
  },
  headerGroup: {
    gap: spacing.sm,
  },
  fields: {
    gap: spacing.md,
  },
  actions: {
    gap: spacing.md,
  },
});
