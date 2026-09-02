const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Lets Metro resolve drizzle-kit's generated .sql migration imports.
// https://orm.drizzle.team/docs/sqlite/connect-expo-sqlite
config.resolver.sourceExts.push('sql');

// Lets Metro serve expo-sqlite's wa-sqlite WASM binary for the web platform.
// https://docs.expo.dev/versions/latest/sdk/sqlite/#usage-on-web
config.resolver.assetExts.push('wasm');

// Cross-origin isolation for the dev server — same requirement as the
// `expo-router` plugin's `headers` config in app.config.ts (production), but
// that config only applies to EAS Hosting; the dev server needs its own copy
// here regardless of where production eventually deploys. Required by
// expo-sqlite's web driver (OPFS synchronous access handles +
// SharedArrayBuffer). Applied to every response, not just `/` — this app has
// ~20 real routes a browser refresh or deep link can land on directly.
// `server.middlewares` isn't a pre-populated array on this Metro version —
// `enhanceMiddleware` (wrapping the existing handler) is the supported hook.
const { enhanceMiddleware } = config.server;
config.server.enhanceMiddleware = (middleware, metroServer) => {
  const wrapped = enhanceMiddleware ? enhanceMiddleware(middleware, metroServer) : middleware;
  return (req, res, next) => {
    res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    wrapped(req, res, next);
  };
};

module.exports = config;
