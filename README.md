# Splitsy

Splitsy is a Philippine-market bill-splitting app: photograph or upload a receipt, review the detected items, add the people sharing the bill, assign items to one or more people, divide taxes and other adjustments, and get an exact per-person breakdown you can share or copy as text. You can also skip the receipt entirely and split a total evenly by headcount, and record who actually paid so Splitsy can work out who owes whom directly (see `PLAN.md`'s 2026-08-04 entry — this and the previous sentence's quick-split option are both a deliberate, documented post-MVP addition, same treatment as the OCR backend below).

It's local-first — every bill lives in on-device SQLite, and the confirmed split never leaves the device. See **[docs/Splitsy_MVP_Spec.md](docs/Splitsy_MVP_Spec.md)** for the full product spec, and its dated **⚠ Amendment** callouts near the top for two deliberate, documented deviations: receipt text is optionally read by a small backend that calls a cloud vision-language model (see [Optional: the OCR backend](#optional-the-ocr-backend) below) rather than purely on-device. **[PLAN.md](PLAN.md)** is the running implementation log — every milestone, decision, and bug found along the way is recorded there with dates.

## Prerequisites

- Node **26.2.0** (see `.nvmrc` — `nvm use` if you have nvm installed)
- [`pnpm`](https://pnpm.io/) for the client app
- An Android device or emulator. **Expo Go will not work** — this app uses custom native modules (on-device OCR, SQLite, camera) that require a custom **development build**.

## Setup

```sh
pnpm install
cp .env.example .env
```

`.env` configures `EXPO_PUBLIC_OCR_BACKEND_URL` — the address of the optional OCR backend (see below). Leave it blank to skip the backend entirely; the app always falls back to on-device OCR automatically when it's unset, unreachable, or slow.

## Development build

This app needs its own compiled dev-client APK (not Expo Go) — build it once per native-dependency change, then iterate against it with a fast-refreshing Metro server.

**Option A — local Android SDK** (if you have Android Studio installed):

```sh
npx expo run:android
```

**Option B — EAS Build** (cloud build, no local Android SDK needed — this is how the app was built and tested during development):

```sh
npx eas-cli build --platform android --profile development
```

Install the resulting APK on your device (EAS prints a download link/QR code). Either way, once the dev-client APK is installed, start the JS bundler for day-to-day development:

```sh
pnpm start
```

and open the Splitsy dev-client app on your device, pointed at the Metro server it prints (same WiFi network as this machine).

You only need to repeat the build step (A or B) when a **native** dependency changes — everything else (screens, business logic, copy, the OCR backend integration) is a pure JS change that Metro hot-reloads without a rebuild.

## Database and migrations

Schema lives in `src/db/schema.ts` (Drizzle ORM, `expo-sqlite`). After changing it, generate a migration:

```sh
npx drizzle-kit generate
```

This writes a new SQL file under `drizzle/`. Migrations are **applied automatically** at app startup (`src/db/migrations.ts`'s `useDatabaseMigrations`, gated in `src/app/_layout.tsx`) — there's no separate "run migrate" step for the app itself; just make sure the generated migration file is committed alongside the schema change.

## Testing

Client (Jest):

```sh
pnpm test
```

The OCR backend is an independent package (its own `npm`/Vitest, not part of the `pnpm` workspace):

```sh
cd server
npm install   # first time only
npm test
```

## Verification

Run all of these before considering a change done — this mirrors what's checked before every milestone is marked complete in `PLAN.md`:

```sh
pnpm run typecheck
pnpm run lint
pnpm run test
pnpm run format:check   # pnpm run format to fix
```

```sh
cd server
npx tsc --noEmit
npx vitest run
```

## Optional: the OCR backend

On-device OCR (Google ML Kit) struggles with real receipts — misreading printed thermal receipts and unable to read handwriting at all. `server/` is a small Hono backend that sends the receipt photo to [Groq](https://groq.com)'s hosted `qwen/qwen3.8-27b` vision-language model, which reads the receipt **and** classifies it — items, quantities, prices, tax/service-charge/discount adjustments, and the total — returning already-structured data instead of raw text. The on-device ML Kit fallback still runs the original rule-based parser (it has no reasoning of its own), but for the Groq path that parser is bypassed entirely. See the spec's Amendment callouts and `PLAN.md`'s "VLM-backed receipt OCR," "Switch to Groq," and "Groq performs full receipt extraction" entries for the full rationale — the last of those is a meaningful trade-off, not a free upgrade: reviewing the detected items/total on the next screen before saving matters more now than it did when the model only transcribed text.

This is **entirely optional** — leave `EXPO_PUBLIC_OCR_BACKEND_URL` unset in `.env` and the app works fully offline on-device.

To run it, get a free API key from [console.groq.com/keys](https://console.groq.com/keys), then:

```sh
cd server
npm install
cp .env.example .env   # set GROQ_API_KEY (required), OCR_ENGINE/PORT if needed
npm run dev
```

Point the client's root `.env` at this machine's LAN IP and the port above (e.g. `EXPO_PUBLIC_OCR_BACKEND_URL=http://192.168.1.10:8787`), then restart Metro (`pnpm start`) so the client picks up the new value. The receipt image is sent to Groq's API for the single request only, is never written to disk on this server, and nothing persists here between requests — but note this now sends receipt photos to a third-party cloud service (see the spec's Amendment callout), unlike the previous self-hosted-only version.

## Known MVP limitations

Logged and deliberately deferred, not oversights — see `PLAN.md`'s Milestone 5/6 entries for the reasoning behind each:

- **No manual reordering** of line items, participants, or adjustments (all three lists append-only, per creation order). Lower stakes for items/adjustments (display order only) than for participants (also the tie-break order for equal/proportional remainder allocation).
- **No component/screen tests** — this project consistently pulls business logic into small, pure, directly-unit-tested modules (200+ of the test suite) rather than rendering screens with `@testing-library/react-native`; every calculation, validation rule, and parsing rule has direct test coverage, but no test renders a full screen.
- **Removing a participant doesn't flag their now-stale payment contribution** (entered assuming the old participant list) — a minor staleness the user would need to notice and correct manually; confirmed safe (nothing crashes or corrupts, since contributions never feed the split-calculation invariant), unlike the analogous CUSTOM-adjustment case that was a real bug (see `PLAN.md`'s Milestone 5 entry).
- **No "Edit payments" entry point from a completed bill's own detail screen** (only from the in-progress Summary screen) — the Payments screen always routes back to Summary on save, which would be the wrong destination from a completed bill.

## Project structure

See `docs/Splitsy_MVP_Spec.md` section 8 for the intended layout and `PLAN.md` for what actually got built where, milestone by milestone. Briefly:

- `src/app/` — Expo Router screens (file-based routing)
- `src/features/` — business logic by domain (`receipt-ocr`, `receipt-parser`, `splitting`, `participants`, `assignments`, `adjustments`, `bills`, `summary`)
- `src/db/` — Drizzle schema, migrations, repositories
- `src/components/` — shared UI primitives (`ui/`) and bill-specific components (`bill/`)
- `src/constants/copy.ts` — every user-facing string, centralized and matched to the spec's exact copy tables
- `server/` — the optional OCR backend, an independent Node/Hono package
