import { Feather } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppButton } from '@/components/ui/AppButton';
import { AppText } from '@/components/ui/AppText';
import { AppTextInput } from '@/components/ui/AppTextInput';
import { InlineError } from '@/components/ui/InlineError';
import { Screen } from '@/components/ui/Screen';
import appInfo from '@/constants/appInfo.json';
import { copy } from '@/constants/copy';
import { validateEmail, validateSignInPassword } from '@/features/auth/validateAuthForm';
import { authClient } from '@/lib/authClient';
import { spacing } from '@/theme/tokens';

// Sign in — src/app/(auth)/sign-in.tsx (2026-08-25 spec Amendment). On
// success this deliberately does not navigate anywhere itself: the root
// layout (_layout.tsx) reads authClient.useSession() and swaps the visible
// route tree (Stack.Protected) the moment the session becomes active, which
// naturally reveals the authenticated app (Home, plus the global
// BottomTabBar) without this screen needing to know where "the rest of the
// app" even is.
export default function SignInScreen() {
  const router = useRouter();
  // Set by reset-password.tsx's `router.replace({ pathname: '/sign-in',
  // params: { justReset: '1' } })` on a successful reset — a one-off UI flag,
  // not bill/account data, so reading it straight from the route param here
  // doesn't run into the "route params aren't the source of truth" rule.
  const { justReset } = useLocalSearchParams<{ justReset?: string }>();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Set only on an EMAIL_NOT_VERIFIED failure — offers a way to recover
  // (server/src/auth.ts already resends on a blocked sign-in attempt via
  // sendOnSignIn, but the user may have missed that first one too) rather
  // than leaving them stuck with no path forward besides re-registering.
  const [showResendVerification, setShowResendVerification] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendSent, setResendSent] = useState(false);

  async function handleResendVerification() {
    const emailResult = validateEmail(email);
    if (!emailResult.valid) return;
    setResending(true);
    try {
      await authClient.sendVerificationEmail({
        email: emailResult.email,
        callbackURL: Linking.createURL('verify-email', { scheme: appInfo.scheme }),
      });
      setResendSent(true);
    } catch {
      setFormError(copy.auth.networkError);
    } finally {
      setResending(false);
    }
  }

  async function handleSignIn() {
    setShowResendVerification(false);
    setResendSent(false);
    const emailResult = validateEmail(email);
    const passwordResult = validateSignInPassword(password);

    setEmailError(
      emailResult.valid
        ? null
        : emailResult.reason === 'required'
          ? copy.auth.requiredEmailError
          : copy.auth.invalidEmailError,
    );
    setPasswordError(passwordResult.valid ? null : copy.auth.requiredPasswordError);
    if (!emailResult.valid || !passwordResult.valid) return;

    setFormError(null);
    setSubmitting(true);
    try {
      const { error } = await authClient.signIn.email({
        email: emailResult.email,
        password: passwordResult.password,
      });
      if (error) {
        if (error.code === 'EMAIL_NOT_VERIFIED') {
          setFormError(copy.auth.signInEmailNotVerified);
          setShowResendVerification(true);
        } else {
          setFormError(copy.auth.signInInvalidCredentials);
        }
        setSubmitting(false);
        return;
      }
      // Success: authClient's session store updates on its own (see
      // fetchPlugins.onSuccess in @better-auth/expo/client), which the root
      // layout's useSession() picks up — no manual navigation here.
    } catch {
      setFormError(copy.auth.networkError);
      setSubmitting(false);
    }
  }

  return (
    <Screen scroll>
      <View style={styles.body}>
        <View style={styles.headerGroup}>
          <AppText variant="heading">{copy.auth.signInHeading}</AppText>
          <AppText variant="body" color="textSecondary">
            {copy.auth.signInBody}
          </AppText>

          {justReset ? (
            <AppText color="success" accessibilityLiveRegion="polite">
              {copy.auth.resetPasswordSuccessToast}
            </AppText>
          ) : null}
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

          <AppTextInput
            label={copy.auth.passwordLabel}
            value={password}
            onChangeText={(value) => {
              setPassword(value);
              if (passwordError) setPasswordError(null);
            }}
            error={passwordError ?? undefined}
            secureTextEntry
            textContentType="password"
            autoComplete="current-password"
          />
        </View>

        <View style={styles.actions}>
          <AppButton
            variant="text"
            label={copy.auth.forgotPasswordLink}
            onPress={() => router.push('/forgot-password')}
          />

          <View style={styles.footerRow}>
            <AppText color="textSecondary">{copy.auth.signInNoAccountPrompt}</AppText>
            <AppButton
              variant="text"
              label={copy.auth.signInRegisterLink}
              onPress={() => router.push('/register')}
            />
          </View>

          {/* Was a sticky BottomActionBar footer — moved inline, per the
              user's own explicit request (2026-08-27) to drop sticky nav
              footers in favor of plain in-flow buttons. */}
          {formError ? <InlineError message={formError} /> : null}
          {showResendVerification ? (
            resendSent ? (
              <AppText color="success" accessibilityLiveRegion="polite">
                {copy.auth.resendVerificationSentToast}
              </AppText>
            ) : (
              <AppButton
                variant="secondary"
                label={copy.auth.resendVerificationAction}
                onPress={handleResendVerification}
                loading={resending}
              />
            )
          ) : null}
          <AppButton
            label={copy.auth.signInButton}
            onPress={handleSignIn}
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
  footerRow: {
    flexDirection: 'row',
    // Wraps rather than clipping/overflowing at larger system font sizes
    // (spec section 17 — "support system font scaling without clipping
    // critical controls").
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
});
