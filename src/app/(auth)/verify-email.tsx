import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { AppButton } from '@/components/ui/AppButton';
import { AppText } from '@/components/ui/AppText';
import { Screen } from '@/components/ui/Screen';
import { copy } from '@/constants/copy';
import { spacing } from '@/theme/tokens';

// Verify email — src/app/(auth)/verify-email.tsx (2026-08-25 spec Amendment).
// Reached via the deep link server/src/auth.ts's sendVerificationEmail
// points at (`splitsy://verify-email`, the same Linking.createURL pattern
// register.tsx passes as `callbackURL` — see that file). Unlike
// reset-password.tsx, this screen makes no API call of its own: Better
// Auth's GET /verify-email already marked the account verified on the
// request the email client's browser/webview followed to arrive here, before
// ever redirecting into the app. All this screen does is read the one signal
// available to it — an `error` query param Better Auth appends on failure,
// absent on success — and tell the user what to do next.
export default function VerifyEmailScreen() {
  const router = useRouter();
  const { error } = useLocalSearchParams<{ error?: string }>();
  const succeeded = !error;

  return (
    <Screen scroll>
      <View style={styles.body}>
        <View style={styles.headerGroup}>
          <AppText variant="heading">
            {succeeded ? copy.auth.verifyEmailSuccessHeading : copy.auth.verifyEmailErrorHeading}
          </AppText>
          <AppText variant="body" color="textSecondary" accessibilityLiveRegion="polite">
            {succeeded ? copy.auth.verifyEmailSuccessBody : copy.auth.verifyEmailErrorBody}
          </AppText>
        </View>

        {succeeded ? (
          <AppButton
            label={copy.auth.verifyEmailGoToSignIn}
            onPress={() => router.replace('/sign-in')}
            icon={(color) => <Feather name="arrow-right" size={18} color={color} />}
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
