import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingState } from '@/components/ui/LoadingState';
import { Screen } from '@/components/ui/Screen';
import { copy } from '@/constants/copy';
import { useDatabaseMigrations } from '@/db/migrations';
import { ThemeProvider, useTheme } from '@/theme/ThemeProvider';

function RootNavigator() {
  const { success, error } = useDatabaseMigrations();
  const { scheme } = useTheme();

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

  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false }}>
        {/* The (tabs) group owns Home (`/`) and Settings (`/settings`) behind
            its own persistent bottom bar (BottomTabBar.tsx) — every other
            screen below is pushed on top of it as a normal full-screen stack
            route, so none of them show that bar. */}
        <Stack.Screen name="(tabs)" />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <RootNavigator />
    </ThemeProvider>
  );
}
