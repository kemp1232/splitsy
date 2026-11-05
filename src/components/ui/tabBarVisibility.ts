// The global BottomTabBar (and its "+" button) is hidden on every bill-flow
// and bill-detail screen — anything under /bill/ — so those screens get the
// full height for their own in-flow actions. Kept in its own module (not in
// BottomTabBar.tsx) so it's unit-testable without pulling in react-native-svg.
// Every screen under src/app/bill/ passes Screen's `tabBarHidden` prop to
// match, so it takes the bottom safe-area edge the hidden bar no longer pads.
export function isTabBarHiddenForPath(pathname: string): boolean {
  return pathname === '/bill' || pathname.startsWith('/bill/');
}
