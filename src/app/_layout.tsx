import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { BottomTabBar } from '@/components/ui/BottomTabBar';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingState } from '@/components/ui/LoadingState';
import { Screen } from '@/components/ui/Screen';
import { AUTH_BACKEND_URL } from '@/constants/config';
import { copy } from '@/constants/copy';
import { useDatabaseMigrations } from '@/db/migrations';
import { authClient } from '@/lib/authClient';
import { ThemeProvider, useTheme } from '@/theme/ThemeProvider';

// Gates every screen except the (auth) group behind an active session
// (2026-08-25 spec Amendment — sign-in is required to use the app). Reads
// authClient.useSession() directly rather than anything bill/trip-related:
// this is purely an access gate, session state is not "bill data" the way
// the hard rule about route params means, and there is nothing else in this
// codebase that already owns "is there a session" for this to read from
// instead.
function SessionGate() {
  const { scheme } = useTheme();
  const { data: session, isPending, error, refetch } = authClient.useSession();

  if (isPending) {
    return (
      <Screen>
        <LoadingState />
      </Screen>
    );
  }

  if (error) {
    return (
      <Screen>
        <ErrorState
          heading={copy.auth.sessionCheckFailedHeading}
          body={copy.auth.sessionCheckFailedBody}
          retryLabel={copy.global.retryAction}
          onRetry={() => refetch()}
        />
      </Screen>
    );
  }

  const hasSession = Boolean(session);

  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      {/* Stack.Protected (Expo Router SDK 52+, available here on SDK 57) is
          the officially-recommended way to gate a whole route group behind a
          condition: it shows/hides the wrapped Stack.Screen entries and
          automatically redirects to whichever protected group is currently
          visible, rather than requiring this component to hand-navigate on
          every session change. sign-in.tsx/register.tsx and the Settings
          "Log out" action both rely on exactly that — they never navigate
          themselves, this is the one place that reacts to the session
          changing. */}
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={hasSession}>
          <Stack.Screen name="index" />
          <Stack.Screen name="settings" />
        </Stack.Protected>
        <Stack.Protected guard={!hasSession}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
      </Stack>
      {/* Persistent overlay above whichever screen the Stack above is
          currently showing — every `bill/**`/`trip/**` route included, not
          just Home/Settings (those two are just this bar's own highlighted
          destinations, see BottomTabBar.tsx). Rendered here rather than
          inside the Stack.Screen for "index"/"settings" so it survives
          across pushes to other routes instead of unmounting/remounting. */}
      {hasSession ? <BottomTabBar /> : null}
    </>
  );
}

function RootNavigator() {
  const { success, error } = useDatabaseMigrations();

  if (error) {
    return (
      <Screen>
        <ErrorState
          heading={copy.global.genericErrorHeading}
          body={copy.global.databaseStartupFailure}
        />
      </Screen>
    );
  }

  if (!success) {
    return (
      <Screen>
        <LoadingState />
      </Screen>
    );
  }

  return <SessionGate />;
}

export default function RootLayout() {
  // Unlike OCR_BACKEND_URL (which has an on-device fallback, see
  // src/constants/config.ts), there is nothing to fall back to for auth — an
  // unconfigured backend means sign-in can never succeed. This is checked
  // once, before ThemeProvider/RootNavigator even mount, as a hard, visible
  // startup error rather than letting authClient silently fail every request
  // against an empty baseURL.
  if (!AUTH_BACKEND_URL) {
    return (
      <ThemeProvider>
        <Screen>
          <ErrorState
            heading={copy.auth.backendNotConfiguredHeading}
            body={copy.auth.backendNotConfiguredBody}
          />
        </Screen>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <RootNavigator />
    </ThemeProvider>
  );
}
