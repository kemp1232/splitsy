# Splitsy Web Port — Status & Handoff

_Written as a handoff so work can resume on a different machine. Delete this
file once the web port is finished and merged into normal project docs._

## Where things stand

The mobile app (Expo/React Native) was declared MVP-complete. This session
started a **new phase: porting Splitsy to web**, reusing the existing
codebase via Expo's built-in web target (`react-native-web`) rather than a
separate React rewrite — see "Why Expo Web" below for the reasoning that
decision was based on.

A full research + design pass was done **before** writing any code (2
parallel Explore agents inventoried every native-only touchpoint, 1 Plan
agent validated the two riskiest architecture pieces), resulting in an
approved 7-phase plan (embedded in full below). **Implementation has just
started**: Phase 1 (enable the web target + get SQLite persistence working)
is partially done and **not yet verified end-to-end in a real browser** —
that's the very next step on resume.

## Why Expo Web, not a separate React app

Asked the user this exact trade-off before starting:

- **Expo Web (chosen)**: one codebase, so "same functionality/assets/UI-UX"
  is guaranteed by construction rather than approximated. Costs: some
  web-idiom compromises (RN `Modal` isn't a native `<dialog>`, `Pressable`
  press-states aren't real `:hover`/`:focus`, no native momentum scroll,
  responsive breakpoints need manual `useWindowDimensions` checks instead of
  CSS media queries), a heavier JS bundle than raw React+CSS, no easy
  SSR/SSG.
- **Separate React app**: better native web idioms/performance/CSS control,
  but a from-scratch rebuild of ~23 screens and ~30 components with real
  ongoing risk of drifting from the mobile app's look, and two codebases to
  maintain forever.

User picked Expo Web explicitly given the stated "same everything" goals.

## The approved plan (verbatim — this is the source of truth)

<details>
<summary>Click to expand the full 7-phase plan</summary>

# Splitsy Web — Expo Web (react-native-web) port

## Context

Splitsy is currently an Expo/React Native (SDK 57) app with all functionality —
bill splitting, receipt OCR, trips, settlement, auth — built against native
modules (`expo-sqlite`, `expo-secure-store`, `expo-file-system`, `expo-camera`,
`@react-native-ml-kit/text-recognition`, RN's `Share`). The user wants a web
version that reuses the same functionality, assets, and UI/UX rather than a
from-scratch rewrite, decided after an explicit trade-off discussion in favor
of **Expo Web via react-native-web** over a separate React codebase — one
codebase, guaranteed-identical UI, at the cost of some web-idiom/perf
compromises.

Two new pieces of polish are also requested as part of this phase: a strict
**sequential** fade-through page transition (fade out 200ms → navigate → fade
in 200ms, no overlap) and an audit of loading spinners.

**Scope reality check**: web support today is completely unconfigured (no
`react-native-web`/`react-dom`, no `web` key in `app.config.ts`, no `.web.*`
files anywhere). Several native modules have zero web equivalent
(`expo-secure-store`, `@react-native-ml-kit/text-recognition`, RN's `Share`,
`expo-file-system`'s new `Directory`/`File`/`Paths` API), and one
(`expo-sqlite`'s web driver, via `wa-sqlite`/OPFS) is real but explicitly
labeled **alpha** by Expo and has a documented history of failures on other
apps. This is a multi-phase effort, not a single pass — the plan below is
ordered so the highest-uncertainty, most-foundational piece (does persistence
even work on web) is resolved first, before investing in everything built on
top of it.

## Phase 1 — Enable the web target + resolve SQLite persistence (the spike)

This phase's only goal: get a real SQLite-backed screen rendering and
persisting data in a browser tab. Everything else depends on this working.

1. `npx expo install react-dom react-native-web @expo/metro-runtime`; add a
   `"web": "expo start --web"` script to `package.json`.
2. Add a minimal `web` key to `app.config.ts` (favicon from the existing
   `assets/images/icon.png`, bundler left at Metro's default).
3. Edit `metro.config.js`: add `config.resolver.assetExts.push('wasm')`
   alongside the existing `.sql` push, and add a dev-server middleware that
   sets `Cross-Origin-Embedder-Policy: credentialless` and
   `Cross-Origin-Opener-Policy: same-origin` on **every** response (not just
   `/` — the app has ~20 real routes a browser refresh/deep-link can land on
   directly). These headers are required for OPFS's synchronous access
   handles + `SharedArrayBuffer`, which is how `expo-sqlite`'s web driver
   works.
4. For production hosting, add the equivalent tuple-form `expo-router` plugin
   config in `app.config.ts` (`headers: {...}` — matches the existing
   tuple-config pattern already used there for `expo-camera`/
   `expo-image-picker`/`expo-splash-screen`), but flag explicitly to the user
   that this only takes effect on **EAS Hosting** — any other host (Vercel,
   Netlify, nginx, Cloudflare) needs the same two headers set at that host's
   own config layer, which the user needs to confirm/do themselves once a
   host is chosen.
5. Leave `src/db/client.ts` and `src/db/migrations.ts` completely untouched
   — Metro's `.web.js` platform resolution should transparently swap in
   `expo-sqlite`'s own web driver, and `drizzle-orm/expo-sqlite`'s sync API
   surface (`prepareSync`/`executeSync`/`getAllSync`/`getFirstSync`, sync
   `transaction()`) has no filesystem/platform-specific code — verified by
   reading the driver source.
6. Run `expo start --web` and verify, **in this order** (each is a plausible
   first failure point):
   1. `self.crossOriginIsolated === true` in devtools
   2. `openDatabaseSync('splitsy.db')` doesn't throw
   3. `useDatabaseMigrations()` resolves `success: true` (exercises the full
      migration path, not just "did open succeed")
   4. A full write→read round trip through `itemAssignmentsRepository` or
      `adjustmentAllocationsRepository` specifically — these two use the
      sync `db.transaction((tx) => { tx.x().run(); })` shape, the code path
      most likely to surface a worker-timing bug
   5. Reload the page — confirm data actually persisted (OPFS wrote)
   6. Spot-check in both Chromium and Safari (Safari's OPFS support landed
      later)

**Fallback (only if step 6 fails)** — fully scoped, not "pick a library and
see":
- Swap to `drizzle-orm/sqlite-proxy` (already present in `node_modules`) —
  an async-mode driver taking a single `(sql, params, method) =>
  Promise<{rows}>` callback — backed by **`@sqlite.org/sqlite-wasm`** (the
  SQLite project's own official WASM+OPFS build) run inside a small
  hand-written worker.
- `src/db/client.ts`: platform-branch — native keeps today's code exactly;
  web initializes the sqlite-wasm worker and calls
  `drizzle(callback, { schema })` from `drizzle-orm/sqlite-proxy`.
- `src/db/migrations.ts`: web uses `drizzle-orm/sqlite-proxy/migrator`'s
  async `migrate()` instead of `drizzle-orm/expo-sqlite/migrator`'s
  `useMigrations` — the same `drizzle/migrations.js` `.sql`-file bundling is
  reused unchanged (that mechanism isn't platform-scoped).
- Update exactly **`src/db/repositories/adjustmentAllocations.repository.ts`**
  and **`src/db/repositories/itemAssignments.repository.ts`** — their
  `db.transaction((tx) => { tx.x().run(); })` becomes `await
  db.transaction(async (tx) => { await tx.x(); })` for the async proxy driver.
  The other 6 repositories (already `await`-based) need no change either way.
- The COOP/COEP header requirement from step 3 above is unchanged by this
  fallback — OPFS sync access handles need it regardless of which WASM SQLite
  build sits behind Drizzle.

## Phase 2 — Auth on web

- `src/lib/authClient.ts`: add a `.web.ts` variant dropping the `expoClient`
  plugin (native cookie/deep-link bridging) and `expo-secure-store` storage —
  Better Auth's default browser-cookie session handling applies directly,
  and the backend (`server/`) already runs `better-auth`, which supports
  cookie sessions natively.
- `src/app/(auth)/sign-in.tsx`, `register.tsx`, `forgot-password.tsx`: their
  `Linking.createURL(...)` calls (building scheme-based deep-link callback
  URLs) need a web branch constructing a plain `https://` URL from
  `window.location.origin` instead — a scheme URL is meaningless in a
  browser tab. `verify-email.tsx`/`reset-password.tsx` read the resulting
  query params via `useLocalSearchParams`, which already works with
  Expo Router on web unchanged.
- Verify/add CORS config on the Hono backend (`server/`) so credentialed
  cookie requests from the web app's origin are accepted — native apps never
  hit browser CORS, so this has never been exercised before.

## Phase 3 — Receipt capture & image storage on web

- `src/features/receipt-capture/receiptImage.service.ts`: add a `.web.ts`
  variant. `expo-file-system`'s new `Directory`/`File`/`Paths` API has no
  browser-filesystem concept — replace with IndexedDB-stored `Blob`s keyed
  by bill id, resolved to a live `URL.createObjectURL(...)` when a screen
  needs to render the image. `bills.receiptImageUri` on web stores the
  IndexedDB key instead of a file path.
- `src/app/bill/capture.tsx` (`expo-camera`): verify the browser
  `getUserMedia` permission flow end-to-end; adjust `takePictureAsync`
  handling if web behavior differs.
- `src/features/bills/useBillSourceActions.ts`'s gallery picker
  (`expo-image-picker`): has an existing web shim (browser file input) —
  verify it round-trips correctly into the new web image store above.
- `src/app/bill/preview.tsx`'s rotate (`expo-image-manipulator`): verify web
  support; if unsupported, fall back to an offscreen `<canvas>` draw +
  re-export.
- `src/features/receipt-ocr/BackendReceiptOcrService.ts`: its `new
  File(imageUri)` (`expo-file-system`) call needs a web branch building the
  OCR `FormData` directly from the in-memory `Blob` instead.
- `src/features/receipt-ocr/FallbackReceiptOcrService.ts`: on web, skip
  straight to backend-only OCR — `@react-native-ml-kit/text-recognition`
  (the offline fallback) has no web equivalent at all.

## Phase 4 — Share API fallback

Add `src/lib/share.ts` with a `.web.ts` variant wrapping the 5 `Share.share`
call sites (`bill/[billId]/index.tsx`, `bill/[billId]/summary.tsx`,
`trip/[tripId]/index.tsx`, `trip/[tripId]/settlement.tsx`,
`src/app/index.tsx`): on web, try `navigator.share` (supported on
mobile-browser/Safari), falling back to `Clipboard.setStringAsync` +
a toast when `navigator.share` is unavailable (most desktop browsers).

## Phase 5 — Fade-through page transition

Expo Router's declarative `Stack.Screen options={{animation:'fade'}}` can't
express a strict sequential (non-overlapping) fade — it needs intercepting
navigation calls themselves. New `src/navigation/` module (new top-level dir,
parallel to `src/theme/`/`src/lib/`/`src/db/`):

- **`src/navigation/screenFade.ts`** — module-level `Animated.Value`
  (`screenOpacity`, matching `useSlideUpAnimation.ts`'s existing plain-RN-
  `Animated` convention, no Reanimated) plus `FADE_DURATION_MS = 200` and
  `USE_NATIVE_DRIVER = Platform.OS !== 'web'` (RNW's native-driver opacity
  support isn't verified against this dependency tree yet; native stays
  `true` as today).
- **`src/navigation/useFadeRouter.ts`** — wraps `useRouter()`'s
  `push`/`replace`/`back`/`navigate` (same signatures, including the
  `{pathname, params}` object form `useBillSourceActions.ts` uses): each
  call fades `screenOpacity` 1→0 over 200ms, then invokes the real router
  method, guarded by a module-level re-entrancy flag against double-taps
  mid-fade.
- **`src/navigation/FadeTransitionView.tsx`** — wraps `<Stack>` only (not
  `BottomTabBar`, which stays a sibling and is confirmed to survive all
  navigation unmounted) in an `Animated.View` bound to `screenOpacity`; a
  `usePathname()`-keyed effect fades 0→1 over 200ms once the new screen has
  mounted (already invisible from the fade-out step, so no flash). `<Stack
  screenOptions={{headerShown:false, animation:'none'}}>` suppresses the
  native-stack's own default transition so it doesn't run underneath the
  overlay.
- `src/app/_layout.tsx`: wrap `<Stack>` in `<FadeTransitionView>`.
- **23 files** that import `useRouter` from `expo-router` each get one
  import line changed to import `useFadeRouter` as `useRouter` instead —
  zero call-site changes, since method names/signatures match exactly.
  `src/components/ui/BottomTabBar.tsx` is one of the 23 (uses `.navigate()`)
  and needs the same swap.
- **Known, accepted gap**: native-stack's gesture-driven back nav (iOS
  edge-swipe, Android predictive-back) bypasses `useFadeRouter()` entirely
  and won't fade — documented as an accepted trade-off rather than disabling
  the gesture globally.

## Phase 6 — Loading screens audit

`src/components/ui/LoadingState.tsx` already exists (`ActivityIndicator`,
themed, optional message) and is already used in all 12 places that load
async data. No new component needed — audit pass only: confirm each still
renders correctly on web, and specifically check whether the web SQLite
driver's boot time (WASM/worker startup, likely slower than native's
synchronous open on first load) needs its own loading state surfaced through
`RootNavigator`'s existing `useDatabaseMigrations()` gate in
`src/app/_layout.tsx`, rather than a fresh spinner elsewhere.

## Phase 7 — Responsive widening for desktop (mobile-first, still a web app)

Small, targeted layout addition, not a redesign: `src/components/ui/Screen.tsx`
gets a max-width (~480–560px) centered treatment applied only above a
`useWindowDimensions` breakpoint, so mobile layout is pixel-identical below
that width and desktop gets a sane centered column instead of a
stretched-out phone UI.

## Verification

- `pnpm typecheck && pnpm lint && pnpm test` clean throughout — native
  behavior must be provably unaffected by every `.web.ts` split.
- Manual browser walkthrough (`expo start --web`) of every primary flow:
  sign in/register, create a bill via camera and via gallery upload, full
  wizard (review → participants → assignments → adjustments → payments →
  summary), share/copy, trips + trip settlement, settings — checking
  persistence survives a reload, the fade transition looks sequential (not
  crossfading), and loading spinners appear where expected.
- Native regression check: run the app on a simulator/device (or plain
  `expo start`) after the `.web.ts` splits land, confirming native behavior
  is unchanged.

</details>

## Exact current implementation state

Files touched so far (all already committed/pushed — see "Git status"
below):

1. **`package.json`** — added `react-dom`, `react-native-web`,
   `@expo/metro-runtime` deps (via `npx expo install`, versions
   auto-resolved for SDK 57), added `"web": "expo start --web"` script.
2. **`app.config.ts`** — added `web: { favicon: './assets/images/icon.png' }`;
   converted the `'expo-router'` plugin entry from a bare string to tuple
   form with a `headers` config (`Cross-Origin-Embedder-Policy:
   credentialless`, `Cross-Origin-Opener-Policy: same-origin`) — only takes
   effect on EAS Hosting, noted in a comment.
3. **`metro.config.js`** — added `config.resolver.assetExts.push('wasm')`
   (serves expo-sqlite's wa-sqlite WASM binary), and a dev-server middleware
   setting the same 2 COOP/COEP headers on every response.

   **Gotcha already hit and fixed**: this Metro version has no
   pre-populated `config.server.middlewares` array (unlike what Expo's own
   SQLite web docs snippet assumes) — `config.server.middlewares.push(...)`
   crashes with `TypeError: Cannot read properties of undefined (reading
   'push')`. Fixed by using `config.server.enhanceMiddleware` instead
   (wraps the existing middleware handler) — that IS the supported hook in
   this Metro version. Current code:
   ```js
   const { enhanceMiddleware } = config.server;
   config.server.enhanceMiddleware = (middleware, metroServer) => {
     const wrapped = enhanceMiddleware ? enhanceMiddleware(middleware, metroServer) : middleware;
     return (req, res, next) => {
       res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
       res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
       wrapped(req, res, next);
     };
   };
   ```

## Immediate next step (exactly where we stopped)

We had just re-run `npx expo export -p web` to confirm the `metro.config.js`
fix resolves that crash and to see what the **next** error is — native-only
imports (`expo-secure-store`, `expo-file-system`'s `Directory`/`File`/
`Paths`, ML Kit, RN's `Share`, `expo-linking`) will very likely surface next,
per Phase 1 step 6 and Phases 2–4 of the plan. This command was interrupted
by the user leaving mid-run, **not because it failed** — the fix had not yet
been re-verified.

**First action on resume**: run `npx expo export -p web` (a one-shot export,
good for quickly surfacing every bundling/import error without a live
browser) or `npx expo start --web` (a live dev server, needed for the actual
runtime verification checklist below). Work through whatever errors appear
one at a time — this is expected and exactly what Phase 1 anticipates.

## What's NOT started yet

- Phase 1's actual runtime verification checklist (crossOriginIsolated,
  `openDatabaseSync`, migrations round-trip, the two sync-transaction
  repositories, persistence across reload, cross-browser check) — needs a
  real or headless browser; not yet attempted at all.
- Phase 1's fallback path (`drizzle-orm/sqlite-proxy` +
  `@sqlite.org/sqlite-wasm`) — only needed if the above verification fails.
- Phases 2–7 entirely: auth on web, receipt capture/image storage on web,
  Share API fallback, the sequential fade-through transition
  (`src/navigation/` module), loading-screen audit, responsive desktop
  widening.

## Key facts worth not re-deriving on resume

- `expo-sqlite` DOES have real web support (confirmed by directly reading
  `node_modules/expo-sqlite/build/ExpoSQLite.web.js` +
  `node_modules/expo-sqlite/web/wa-sqlite/*`) — WASM+OPFS backed,
  officially documented, but labeled "alpha" by Expo with a filed-and-fixed
  GitHub issue history (`expo/expo#36392`). Don't waste time re-checking
  whether web support exists at all — it does; the open question is only
  whether it works reliably in *this* app's exact setup.
- `drizzle-orm/expo-sqlite`'s driver only uses sync APIs (`prepareSync`/
  `executeSync`/etc.) with no filesystem-specific code — if the web driver's
  sync bridge works, `src/db/client.ts`/`migrations.ts` need **zero**
  changes.
- Exactly 2 repositories use the sync `db.transaction((tx) => {
  tx.x().run(); })` shape that would need rewriting if the fallback (async
  proxy driver) is ever needed: `src/db/repositories/
  adjustmentAllocations.repository.ts` and `src/db/repositories/
  itemAssignments.repository.ts`. The other 6 repositories are already
  `await`-based and driver-agnostic.
- The fade-transition design requires intercepting router calls — a passive
  listener (React Navigation state events, `usePathname()` effects) cannot
  produce a true sequential fade, because by the time such a listener fires
  the new screen has already mounted. Planned as `src/navigation/
  screenFade.ts` + `useFadeRouter.ts` + `FadeTransitionView.tsx`, with a
  1-line import swap across 23 files that call `useRouter()`. Full design
  is in the embedded plan above.
- `BottomTabBar.tsx` is a custom component (not Expo Router `<Tabs>`),
  rendered as a sibling of `<Stack>`, tracks the active route via
  `usePathname()` — confirmed safe to leave outside the fade wrapper
  entirely.
- This codebase's animation convention is plain RN `Animated` (see
  `src/components/ui/useSlideUpAnimation.ts`) — `react-native-reanimated` is
  **not** installed; don't introduce it for the fade transition.

## Git status

Everything through this point (including the `metro.config.js`
`enhanceMiddleware` fix) is already committed and pushed to `origin/main` on
GitHub (`kemp1232/splitsy`), commit `3230c7b "finalize design, started web
app"`. On a different machine, `git pull` (or a fresh clone) gets the exact
same state — no manual file copying needed.

The Claude Code plan file itself
(`~/.claude/plans/keen-imagining-lake.md`) is local to the original machine
and won't transfer — the full plan is embedded above so nothing is lost.
