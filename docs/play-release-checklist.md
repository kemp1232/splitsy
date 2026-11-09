# Play Store release checklist

Android application ID: `com.splitsy.app` (final — cannot change after the first upload).

## 1. Before the first release build

- [ ] **Groq**: move the Groq account to a paid plan and set a monthly spend limit in the Groq
      console. The per-account cap (10 scans/day, `OCR_DAILY_SCAN_LIMIT`) bounds per-user cost but
      not the total.
- [ ] **Database**: run `cd server && npm run db:migrate` against the production `DATABASE_URL`
      (Neon) **before** deploying this backend version. It creates Better Auth's tables (if
      needed) and the new `ocr_daily_usage` table. Without it, `/api/ocr` fails and the app
      silently uses on-device OCR. Note: `ocr_scan_queue` (the global scan queue) has no DDL in
      the repo; it must already exist on Neon.
- [ ] **Backend env** (Vercel): `OCR_DAILY_SCAN_LIMIT` (optional, default 10), plus the existing
      `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `RESEND_API_KEY`, `GROQ_API_KEY`,
      `WEB_APP_ORIGINS`.
- [ ] **Privacy policy contact**: replace the `TODO: add a contact email` line in
      `server/src/routes/pages.ts` and redeploy.
- [ ] Check `https://<backend>/privacy` and `https://<backend>/delete-account` load in a browser.
- [ ] **EAS environment variables** for the `preview` and `production` profiles:
      `EXPO_PUBLIC_AUTH_BACKEND_URL` and `EXPO_PUBLIC_OCR_BACKEND_URL` (both the same production
      backend origin — the OCR request reuses the auth session cookie).
- [ ] **Signing**: EAS-managed credentials (`eas credentials -p android`, let EAS generate and
      keep the upload keystore). No keystore is committed to the repo.
- [ ] Version: `version` in `app.config.ts` is the user-facing version; `versionCode` is managed
      remotely by EAS (`appVersionSource: "remote"`, `autoIncrement` on `production`).

## 2. Build and submit

- Internal test APK: `eas build -p android --profile preview`
- Store bundle: `eas build -p android --profile production` (AAB)
- Submit: `eas submit -p android --profile production` (goes to the **internal** track; needs a
  Google Play service account key configured in EAS — set up in Play Console first; the very
  first upload may need to be done manually in Play Console).

## 3. Play Console

- [ ] Create the app, package `com.splitsy.app`.
- [ ] Privacy policy URL: `https://<backend>/privacy`.
- [ ] Data deletion: in-app (Settings → Delete account) and URL `https://<backend>/delete-account`.
- [ ] Data Safety form (answers below), content rating, target audience, app access (provide a
      test account: reviewers must sign in).

## 4. Data Safety form answers

**Does the app collect or share user data?** Yes.
**Is all user data encrypted in transit?** Yes (HTTPS only in production).
**Can users request deletion?** Yes — in-app and via the web deletion URL.

| Data type | Collected | Shared | Purpose | Optional? | Notes |
|---|---|---|---|---|---|
| Personal info → Name | Yes | No | Account management | Required | Entered at sign-up, stored by Better Auth in Postgres (Neon). |
| Personal info → Email address | Yes | Yes (Resend, for verification / reset emails) | Account management | Required | Stored in Postgres. |
| Photos and videos → Photos | Yes (processed ephemerally) | Yes (Groq, to read the receipt) | App functionality | Optional (on-device OCR or manual entry is possible) | Receipt photo is sent for that one request; Splitsy does not store it. Mark "processed ephemerally" for Splitsy; Groq's own retention is governed by its terms. |
| App activity → Other actions (daily scan count) | Yes | No | App functionality / fraud & abuse prevention | Required to use online scanning | User ID + UTC date + count, deleted with the account. |
| App info and performance | No | — | — | — | No analytics or crash reporting. |
| Financial info / bills | No | — | — | — | Bills stay on the device only. |

Not collected: location, contacts, device identifiers for advertising, messages, audio,
health, web browsing.

## 5. Manual steps out of scope for the code change

Buying the Groq plan, creating the signing key in EAS, running the Neon migration, filling in
Play Console, and deploying the backend are all manual.
