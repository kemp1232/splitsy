import { Tabs } from 'expo-router';

import { BottomTabBar } from '@/components/ui/BottomTabBar';
import { copy } from '@/constants/copy';

// The (tabs) route group adds no path segment (Home stays `/`, Settings
// stays `/settings`) — it exists purely so these two screens share this
// persistent bottom bar. Every other route (`bill/**`, `trip/**`) is a
// normal stack screen pushed on top of this group from `_layout.tsx`, so it
// naturally has no tab bar of its own.
export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <BottomTabBar {...props} />}>
      <Tabs.Screen name="index" options={{ title: copy.nav.homeTab }} />
      <Tabs.Screen name="settings" options={{ title: copy.nav.settingsTab }} />
    </Tabs>
  );
}
