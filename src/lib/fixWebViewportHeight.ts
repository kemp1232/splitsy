import { Platform } from 'react-native';

// Mobile browsers (confirmed live: Chrome on Android) don't live-resize
// `html`/`body`/`#root` when they're sized with `height: 100%` (react-
// native-web's own default web reset, baked into the auto-generated
// index.html — not something this app can hand-edit directly, since Expo
// Router's `+html.tsx` override only takes effect when `web.output` is
// `'static'`/`'server'`, and this app's default SPA build doesn't use
// either) as the browser's own address bar collapses on scroll. The app's
// rendered content stays sized for the smaller, address-bar-visible
// viewport, leaving a visible white gap below the fixed bottom nav bar
// once the newly-revealed space isn't covered by anything.
//
// `100dvh` (dynamic viewport height) is the standard fix — unlike `100vh`
// or a `%` height, it tracks the browser's *current* visual viewport live,
// including chrome show/hide transitions. Injected here as a plain <style>
// tag (a one-time, page-load side effect) rather than in the HTML template,
// since there isn't an editable one available for this build mode.
const STYLE_ID = 'web-viewport-height-fix';

export function fixWebViewportHeight() {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  // Guards against a duplicate <style> tag on Fast Refresh in dev, where
  // this module's top-level code can re-run without a full page reload —
  // harmless either way (same rule twice), just tidier with the guard.
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = 'html, body, #root { height: 100dvh; }';
  document.head.appendChild(style);
}
