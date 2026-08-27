import { Stack } from 'expo-router';

// The (auth) route group's own stack (2026-08-25 spec Amendment) — a named
// child of the root Stack's `<Stack.Screen name="(auth)" />`. These screens
// never show the global BottomTabBar (root _layout.tsx only renders it while
// `hasSession` is true, i.e. never inside this group), so a plain Stack is
// enough. `initialRouteName` makes sign-in the landing screen whenever this
// whole group becomes visible (i.e. right after signing out), regardless of
// which of its screens happened to be on top before.
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
