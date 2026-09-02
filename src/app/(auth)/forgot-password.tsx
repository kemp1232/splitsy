import { Feather } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppButton } from '@/components/ui/AppButton';
import { AppText } from '@/components/ui/AppText';
import { AppTextInput } from '@/components/ui/AppTextInput';
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
          <View style={styles.headerGroup}>
            <AppText variant="heading">{copy.auth.forgotPasswordHeading}</AppText>
            <AppText variant="body" color="textSecondary" accessibilityLiveRegion="polite">
              {copy.auth.forgotPasswordConfirmation}
            </AppText>
          </View>
          <AppButton
            variant="secondary"
            label={copy.auth.backToSignIn}
            onPress={() => router.replace('/sign-in')}
            icon={(color) => <Feather name="arrow-left" size={18} color={color} />}
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <View style={styles.body}>
        <View style={styles.headerGroup}>
          <AppText variant="heading">{copy.auth.forgotPasswordHeading}</AppText>
          <AppText variant="body" color="textSecondary">
            {copy.auth.forgotPasswordBody}
          </AppText>
        </View>

        <View style={styles.fields}>
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
        </View>

        <View style={styles.actions}>
          <AppButton
            variant="text"
            label={copy.auth.backToSignIn}
            onPress={() => router.back()}
            icon={(color) => <Feather name="arrow-left" size={18} color={color} />}
          />

          {/* Was a sticky BottomActionBar footer — moved inline, per the
              user's own explicit request (2026-08-27) to drop sticky nav
              footers in favor of plain in-flow buttons. */}
          {formError ? <InlineError message={formError} /> : null}
          <AppButton
            label={copy.auth.sendResetLinkButton}
            onPress={handleSendResetLink}
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
