import Feather from '@expo/vector-icons/Feather';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { AppButton } from '@/components/ui/AppButton';
import { AppText } from '@/components/ui/AppText';
import { Screen } from '@/components/ui/Screen';
import { copy } from '@/constants/copy';
import { resolveVerifyEmailOutcome } from '@/features/auth/resolveVerifyEmailOutcome';
import { spacing } from '@/theme/tokens';

// Verify email — src/app/(auth)/verify-email.tsx (2026-08-25 spec Amendment).
// Reached via the deep link server/src/auth.ts's sendVerificationEmail
// points at (`splitsy://verify-email`, the same Linking.createURL pattern
// register.tsx passes as `callbackURL` — see that file). Unlike
// reset-password.tsx, this screen makes no API call of its own: Better
// Auth's GET /verify-email already marked the account verified on the
// request the email client's browser/webview followed to arrive here, before
// ever redirecting into the app. All this screen does is read the signals
// available to it — the `verified=1` marker our callbackURL carries (kept on
// success) and the `error` param Better Auth appends on failure — and tell
// the user what to do next. With neither (opened directly, or an older email
// without the marker) it claims nothing and just points to sign in.
const HEADINGS = {
  success: copy.auth.verifyEmailSuccessHeading,
  error: copy.auth.verifyEmailErrorHeading,
  neutral: copy.auth.verifyEmailPendingHeading,
};
const BODIES = {
  success: copy.auth.verifyEmailSuccessBody,
  error: copy.auth.verifyEmailErrorBody,
  neutral: copy.auth.verifyEmailPendingBody,
};

export default function VerifyEmailScreen() {
  const router = useRouter();
  const { error, verified } = useLocalSearchParams<{ error?: string; verified?: string }>();
  const outcome = resolveVerifyEmailOutcome({ error, verified });
  // Success and neutral both lead straight on to sign in.
  const canGoToSignIn = outcome !== 'error';

  return (
    <Screen scroll background="form">
      <View style={styles.body}>
        <View style={styles.headerGroup}>
          <AppText variant="title">{HEADINGS[outcome]}</AppText>
          <AppText variant="body" color="textSecondary" accessibilityLiveRegion="polite">
            {BODIES[outcome]}
          </AppText>
        </View>

        {canGoToSignIn ? (
          <AppButton
            label={copy.auth.verifyEmailGoToSignIn}
            onPress={() => router.replace('/sign-in')}
            icon={(color) => <Feather name="arrow-right-circle" size={18} color={color} />}
            iconPosition="trailing"
          />
        ) : (
          <AppButton
            variant="secondary"
            label={copy.auth.registerSignInLink}
            onPress={() => router.replace('/sign-in')}
            icon={(color) => <Feather name="arrow-left" size={18} color={color} />}
          />
        )}
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
});
