import { Stack } from 'expo-router';

// The (auth) route group's own stack (2026-08-25 spec Amendment) — mirrors
// (tabs)/_layout.tsx's role (a named child of the root Stack's
// `<Stack.Screen name="(auth)" />`), except this group's screens don't share
// a persistent bar the way (tabs)'s do, so a plain Stack (not Tabs) is enough.
// `initialRouteName` makes sign-in the landing screen whenever this whole
// group becomes visible (i.e. right after signing out), regardless of which
// of its screens happened to be on top before.
export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }} initialRouteName="sign-in">
      <Stack.Screen name="sign-in" />
      <Stack.Screen name="register" />
      <Stack.Screen name="forgot-password" />
      <Stack.Screen name="reset-password" />
      <Stack.Screen name="verify-email" />
    </Stack>
  );
}
