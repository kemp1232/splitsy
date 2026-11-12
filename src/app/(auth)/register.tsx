import Feather from '@expo/vector-icons/Feather';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, View, type TextInput } from 'react-native';

import { AppButton } from '@/components/ui/AppButton';
import { AppText } from '@/components/ui/AppText';
import { AppTextInput } from '@/components/ui/AppTextInput';
import { InlineError } from '@/components/ui/InlineError';
import { Screen } from '@/components/ui/Screen';
import appInfo from '@/constants/appInfo.json';
import { copy } from '@/constants/copy';
import { VERIFY_EMAIL_SUCCESS_PARAMS } from '@/features/auth/resolveVerifyEmailOutcome';
import {
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  validateDisplayName,
  validateEmail,
  validateNewPassword,
} from '@/features/auth/validateAuthForm';
import { authClient } from '@/lib/authClient';
import { spacing } from '@/theme/tokens';

// Register — src/app/(auth)/register.tsx (2026-08-25 spec Amendment, updated
// for the same day's security-review follow-up requiring email
// verification). `callbackURL` is what makes the verification link server/
// src/auth.ts emails mobile-appropriate — same `Linking.createURL` pattern
// forgot-password.tsx already uses for its own reset link, just pointed at
// verify-email.tsx instead. Better Auth's sign-up/email endpoint requires
// `name` in addition to email/password.
//
// Unlike sign-in.tsx, this screen CANNOT rely on the root layout's session
// gate to move the user along on success: requireEmailVerification means
// sign-up returns `token: null` (see server/src/auth.ts's own comment on
// why) — no session exists yet, so nothing for the gate to react to. This
// screen shows an explicit "check your email" state instead once sign-up
// succeeds, the same shape forgot-password.tsx's own `sent` state already
// uses for the analogous "we can't confirm anything more happened here" case.
export default function RegisterScreen() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  // Same show/hide toggle as sign-in.tsx's password field.
  const [showPassword, setShowPassword] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState<string | null>(null);
  // Enter moves name -> email -> password; Enter on the password registers.
  const emailInputRef = useRef<TextInput>(null);
  const passwordInputRef = useRef<TextInput>(null);

  async function handleRegister() {
    // Enter can't start a second registration while one is in flight.
    if (submitting) return;
    const nameResult = validateDisplayName(name);
    const emailResult = validateEmail(email);
    const passwordResult = validateNewPassword(password);

    setNameError(
      nameResult.valid
        ? null
        : nameResult.reason === 'required'
          ? copy.auth.requiredNameError
          : copy.auth.nameTooLongError,
    );
    setEmailError(
      emailResult.valid
        ? null
        : emailResult.reason === 'required'
          ? copy.auth.requiredEmailError
          : copy.auth.invalidEmailError,
    );
    setPasswordError(
      passwordResult.valid
        ? null
        : passwordResult.reason === 'required'
          ? copy.auth.requiredPasswordError
          : passwordResult.reason === 'tooShort'
            ? copy.auth.passwordTooShortError.replace('{minLength}', String(MIN_PASSWORD_LENGTH))
            : copy.auth.passwordTooLongError.replace('{maxLength}', String(MAX_PASSWORD_LENGTH)),
    );
    if (!nameResult.valid || !emailResult.valid || !passwordResult.valid) return;

    setFormError(null);
    setSubmitting(true);
    try {
      const { error } = await authClient.signUp.email({
        name: nameResult.name,
        email: emailResult.email,
        password: passwordResult.password,
        callbackURL: Linking.createURL('verify-email', {
          scheme: appInfo.scheme,
          // Success marker for verify-email.tsx: Better Auth redirects to this
          // URL as-is on success and appends `&error=…` on failure.
          queryParams: VERIFY_EMAIL_SUCCESS_PARAMS,
        }),
      });
      if (error) {
        setFormError(
          error.code === 'USER_ALREADY_EXISTS' ||
            error.code === 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL'
            ? copy.auth.registerEmailInUse
            : copy.auth.genericAuthError,
        );
        setSubmitting(false);
        return;
      }
      // No session to hand off to the root layout's gate (see this file's
      // own header note) — show the "check your email" state directly.
      setRegisteredEmail(emailResult.email);
      setSubmitting(false);
    } catch {
      setFormError(copy.auth.networkError);
      setSubmitting(false);
    }
  }

  if (registeredEmail) {
    return (
      <Screen scroll background="form">
        <View style={styles.body}>
          <View style={styles.headerGroup}>
            <AppText variant="title">{copy.auth.registerCheckEmailHeading}</AppText>
            {/* The address is lowercased for display only — what was
                submitted to sign-up is unchanged. */}
            <AppText variant="body" color="textSecondary" accessibilityLiveRegion="polite">
              {copy.auth.registerCheckEmailBody.replace('{email}', () =>
                registeredEmail.toLowerCase(),
              )}
            </AppText>
          </View>
          <AppButton
            variant="secondary"
            label={copy.auth.registerSignInLink}
            onPress={() => router.replace('/sign-in')}
            icon={(color) => <Feather name="arrow-left" size={18} color={color} />}
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll background="form">
      <View style={styles.body}>
        <View style={styles.headerGroup}>
          <AppText variant="title">{copy.auth.registerHeading}</AppText>
          <AppText variant="body" color="textSecondary">
            {copy.auth.registerBody}
          </AppText>
        </View>

        <View style={styles.fields}>
          <AppTextInput
            label={copy.auth.nameLabel}
            placeholder={copy.auth.namePlaceholder}
            value={name}
            onChangeText={(value) => {
              setName(value);
              if (nameError) setNameError(null);
            }}
            error={nameError ?? undefined}
            textContentType="name"
            autoComplete="name"
            returnKeyType="next"
            submitBehavior="submit"
            onSubmitEditing={() => emailInputRef.current?.focus()}
          />

          <AppTextInput
            ref={emailInputRef}
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
            returnKeyType="next"
            submitBehavior="submit"
            onSubmitEditing={() => passwordInputRef.current?.focus()}
          />

          <AppTextInput
            ref={passwordInputRef}
            label={copy.auth.passwordLabel}
            value={password}
            onChangeText={(value) => {
              setPassword(value);
              if (passwordError) setPasswordError(null);
            }}
            error={passwordError ?? undefined}
            secureTextEntry={!showPassword}
            textContentType="newPassword"
            autoComplete="new-password"
            returnKeyType="go"
            onSubmitEditing={handleRegister}
            trailingIcon={(color) => (
              <Pressable
                onPress={() => setShowPassword((value) => !value)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={
                  showPassword ? copy.auth.hidePasswordLabel : copy.auth.showPasswordLabel
                }
              >
                <Feather name={showPassword ? 'eye-off' : 'eye'} size={18} color={color} />
              </Pressable>
            )}
          />
        </View>

        <View style={styles.actions}>
          <View style={styles.footerRow}>
            <AppText color="textSecondary">{copy.auth.registerHasAccountPrompt}</AppText>
            <AppButton
              variant="text"
              label={copy.auth.registerSignInLink}
              onPress={() => router.push('/sign-in')}
            />
          </View>

          {/* Was a sticky BottomActionBar footer — moved inline, per the
              user's own explicit request (2026-08-27) to drop sticky nav
              footers in favor of plain in-flow buttons. */}
          {formError ? <InlineError message={formError} /> : null}
          <AppButton
            label={copy.auth.registerButton}
            onPress={handleRegister}
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
