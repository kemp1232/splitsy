import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppButton } from '@/components/ui/AppButton';
import { AppText } from '@/components/ui/AppText';
import { AppTextInput } from '@/components/ui/AppTextInput';
import { BottomActionBar } from '@/components/ui/BottomActionBar';
import { InlineError } from '@/components/ui/InlineError';
import { Screen } from '@/components/ui/Screen';
import appInfo from '@/constants/appInfo.json';
import { copy } from '@/constants/copy';
import { validateEmail } from '@/features/auth/validateAuthForm';
import { authClient } from '@/lib/authClient';
import { spacing } from '@/theme/tokens';

// Forgot password — src/app/(auth)/forgot-password.tsx (2026-08-25 spec
// Amendment).
//
// `redirectTo` is what makes the emailed reset link mobile-appropriate: it's
// passed through to server/src/auth.ts's `sendResetPassword({ url })`, which
// Better Auth builds as
// `${BETTER_AUTH_URL}/reset-password/:token?callbackURL=<redirectTo>` — an
// http(s) link (tappable/openable from any email client, unlike a bare
// custom-scheme href) that the server's own GET /reset-password/:token route
// validates and then 302-redirects to `redirectTo` with the token attached,
// landing back on this app's reset-password.tsx via the OS's normal deep-link
// handling. `splitsy://` is already in server/src/auth.ts's trustedOrigins,
// so no server change was needed for this — see PLAN.md's account-system
// entry for the full trail.
export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSendResetLink() {
    const emailResult = validateEmail(email);
    setEmailError(
      emailResult.valid
        ? null
        : emailResult.reason === 'required'
          ? copy.auth.requiredEmailError
          : copy.auth.invalidEmailError,
    );
    if (!emailResult.valid) return;

    setFormError(null);
    setSubmitting(true);
    try {
      const { error } = await authClient.requestPasswordReset({
        email: emailResult.email,
        redirectTo: Linking.createURL('reset-password', { scheme: appInfo.scheme }),
      });
      if (error) {
        setFormError(copy.auth.genericAuthError);
        setSubmitting(false);
        return;
      }
      setSent(true);
      setSubmitting(false);
    } catch {
      setFormError(copy.auth.networkError);
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <Screen scroll>
        <View style={styles.body}>
          <AppText variant="heading">{copy.auth.forgotPasswordHeading}</AppText>
          <AppText variant="body" color="textSecondary" accessibilityLiveRegion="polite">
            {copy.auth.forgotPasswordConfirmation}
          </AppText>
          <AppButton
            variant="secondary"
            label={copy.auth.backToSignIn}
            onPress={() => router.replace('/sign-in')}
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen
      scroll
      footer={
        <BottomActionBar>
          {formError ? <InlineError message={formError} /> : null}
          <AppButton
            label={copy.auth.sendResetLinkButton}
            onPress={handleSendResetLink}
            loading={submitting}
          />
        </BottomActionBar>
      }
    >
      <View style={styles.body}>
        <AppText variant="heading">{copy.auth.forgotPasswordHeading}</AppText>
        <AppText variant="body" color="textSecondary">
          {copy.auth.forgotPasswordBody}
        </AppText>

        <AppTextInput
          label={copy.auth.emailLabel}
          placeholder={copy.auth.emailPlaceholder}
          value={email}
          onChangeText={(value) => {
            setEmail(value);
            if (emailError) setEmailError(null);
          }}
          error={emailError ?? undefined}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="emailAddress"
          autoComplete="email"
        />

        <AppButton variant="text" label={copy.auth.backToSignIn} onPress={() => router.back()} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: spacing.md,
  },
});
