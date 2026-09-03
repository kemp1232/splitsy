const path = require('path');

const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Lets Metro resolve drizzle-kit's generated .sql migration imports.
// https://orm.drizzle.team/docs/sqlite/connect-expo-sqlite
config.resolver.sourceExts.push('sql');

// Lets Metro serve @sqlite.org/sqlite-wasm's WASM binary for the web
// platform (src/db/web/sqliteWorker.ts).
config.resolver.assetExts.push('wasm');

// @sqlite.org/sqlite-wasm's own index.mjs contains
// `new Worker(new URL('sqlite3-worker1.mjs', import.meta.url))` for its
// "Worker1 Promiser" convenience API — this app never uses that API
// (src/db/web/sqliteWorker.ts calls `sqlite3InitModule` directly), but Metro
// statically scans every module for the `new Worker(new URL(...))` pattern
// (its own first-class web-worker bundling support) regardless of whether
// the code path is actually reachable, and resolves the bare string
// "sqlite3-worker1.mjs" as a Node package specifier (since it has no `./`
// prefix) rather than relative to index.mjs — which fails, since it isn't a
// real package. The referenced file genuinely exists right next to
// index.mjs, so just point Metro's resolver there for this one specifier.
const { resolveRequest: defaultResolveRequest } = config.resolver;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'sqlite3-worker1.mjs') {
    const resolve = defaultResolveRequest ?? context.resolveRequest;
    return resolve(
      context,
      path.join(path.dirname(context.originModulePath), 'sqlite3-worker1.mjs'),
      platform,
    );
  }
  return (defaultResolveRequest ?? context.resolveRequest)(context, moduleName, platform);
};

// Cross-origin isolation for the dev server — same requirement as the
// `expo-router` plugin's `headers` config in app.config.ts (production), but
// that config only applies to EAS Hosting; the dev server needs its own copy
// here regardless of where production eventually deploys. Required by
// @sqlite.org/sqlite-wasm's worker+OPFS mode (SharedArrayBuffer — see
// src/db/client.web.ts), which documents `require-corp` (not
// `credentialless`) as its own requirement. Applied to every response, not
// just `/` — this app has ~20 real routes a browser refresh or deep link can
// land on directly.
//
// NOTE: this only reaches Metro's own bundle/asset-serving requests, not the
// route's actual HTML document — `expo start --web` serves that through a
// separate SSR-style handler this hook doesn't cover (see WEB_PORT_STATUS.md
// for the full investigation). Not yet solved; `expo export -p web` + a
// static server applying these same headers to every response (e.g. `serve`
// with a `serve.json`) is the reliable way to test this locally for now.
// `server.middlewares` isn't a pre-populated array on this Metro version —
// `enhanceMiddleware` (wrapping the existing handler) is the supported hook.
const { enhanceMiddleware } = config.server;
config.server.enhanceMiddleware = (middleware, metroServer) => {
  const wrapped = enhanceMiddleware ? enhanceMiddleware(middleware, metroServer) : middleware;
  return (req, res, next) => {
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    wrapped(req, res, next);
  };
};

module.exports = config;
