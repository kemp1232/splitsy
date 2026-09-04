import { expo } from '@better-auth/expo';
import { Pool } from '@neondatabase/serverless';
import { betterAuth } from 'better-auth';
import { Resend } from 'resend';

// The Expo app's custom URL scheme, from src/constants/appInfo.json's
// "scheme" field (read via app.config.ts). Hardcoded rather than imported
// across the server/client boundary — the server package is self-contained
// and shouldn't reach into ../../src for a single string. Update this if the
// client's scheme ever changes.
const EXPO_SCHEME = 'splitsy';

// Fail fast at startup — not lazily on first request — because these are all
// required to even construct the Better Auth instance below, unlike
// GROQ_API_KEY (checked per-request in routes/ocr.ts since OCR can still boot
// without it, just fail on use).
const BETTER_AUTH_SECRET = process.env.BETTER_AUTH_SECRET;
const BETTER_AUTH_URL = process.env.BETTER_AUTH_URL;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
// Not required in tests — see the in-memory-SQLite branch below, which
// never reads this at all. Vitest sets NODE_ENV=test automatically.
const DATABASE_URL = process.env.DATABASE_URL;

const missing: string[] = [];
if (!BETTER_AUTH_SECRET) missing.push('BETTER_AUTH_SECRET');
if (!BETTER_AUTH_URL) missing.push('BETTER_AUTH_URL');
if (!RESEND_API_KEY) missing.push('RESEND_API_KEY');
if (!DATABASE_URL && process.env.NODE_ENV !== 'test') missing.push('DATABASE_URL');

if (missing.length > 0) {
  console.error(
    `Missing required env var(s): ${missing.join(', ')}. Add them to server/.env ` +
      '(see server/.env.example for what each one is and where to get it).',
  );
  process.exit(1);
}

const resend = new Resend(RESEND_API_KEY);
const fromEmail = process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev';

// Origins the web build of the app may run from — shared with index.ts's
// CORS config (a single source of truth, since both need to agree on what
// "the web app" is allowed to be). CORS controls what the *browser* lets the
// page read back; this `trustedOrigins` list is Better Auth's own separate
// server-side check (CSRF-style) of what `Origin` header it accepts as
// legitimate on a state-changing auth request — a request can pass CORS and
// still be rejected here, which is exactly the "Invalid origin" error this
// list fixes. See server/.env.example for the env var itself.
export const webAppOrigins = (
  process.env.WEB_APP_ORIGINS ?? 'http://localhost:8081,http://localhost:3000'
)
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

// Better Auth's Expo plugin redirects back into the app via its custom URL
// scheme (see app.config.ts / src/constants/appInfo.json), so that scheme
// must be a trusted origin. The exp:// entries are only reachable in
// development, when running inside Expo Go / a dev client rather than a
// standalone build.
const trustedOrigins = [
  `${EXPO_SCHEME}://`,
  ...(process.env.NODE_ENV !== 'production'
    ? ['exp://', 'exp://**', 'exp://192.168.*.*:*/**']
    : []),
  ...webAppOrigins,
];

// Vitest sets NODE_ENV=test automatically, so test runs get a fresh
// in-memory SQLite database (via better-sqlite3, a devDependency — never
// installed/required outside test runs) instead of a real network
// connection to Postgres. Better Auth's Kysely adapter auto-detects the
// dialect from the object shape: something with `.connect()` (a `pg`-
// compatible Pool, which `@neondatabase/serverless`'s Pool is) reads as
// Postgres; a better-sqlite3 Database instance reads as SQLite — see
// node_modules/@better-auth/kysely-adapter's own dialect-detection.
//
// Real deploys (Fly.io/Docker or Vercel) both talk to the same Postgres
// database via DATABASE_URL — `@neondatabase/serverless`'s Pool works as a
// plain `pg`-compatible driver against Neon *or* any standard Postgres
// server (not Neon-exclusive), and its HTTP/WebSocket-based connection
// mode (rather than a long-lived raw TCP socket) is what makes it safe to
// construct in a serverless function that may get a fresh container on any
// given invocation — unlike better-sqlite3's file, which needs a real disk
// no serverless platform provides.
const database =
  process.env.NODE_ENV === 'test'
    ? new (await import('better-sqlite3')).default(':memory:')
    : new Pool({ connectionString: DATABASE_URL });

export const auth = betterAuth({
  database,
  secret: BETTER_AUTH_SECRET,
  baseURL: BETTER_AUTH_URL,
  trustedOrigins,
  emailAndPassword: {
    enabled: true,
    // Flipped on per the 2026-08-25 security review (Vuln 3): without this,
    // sign-up returns a distinguishable "email already in use" error for a
    // registered address, letting an unauthenticated caller enumerate which
    // emails have Splitsy accounts. Requiring verification makes Better
    // Auth return its generic synthetic-user response instead (see
    // `shouldReturnGenericDuplicateResponse` in its own sign-up route) — a
    // side benefit on top of the actual verification requirement.
    requireEmailVerification: true,
    sendResetPassword: async ({ user, url }) => {
      await resend.emails.send({
        from: fromEmail,
        to: user.email,
        subject: 'Reset your Splitsy password',
        html: `<p>Someone requested a password reset for your Splitsy account.</p><p><a href="${url}">Reset your password</a></p><p>If you didn't request this, you can safely ignore this email.</p>`,
      });
    },
  },
  emailVerification: {
    // Both fire the same `sendVerificationEmail` below: `sendOnSignUp` right
    // after registering (this is what actually makes `requireEmailVerification`
    // usable at all — otherwise a new user would have no way to ever receive
    // a link), `sendOnSignIn` as a courtesy resend if someone tries to sign
    // in again before verifying, rather than only failing with no recourse.
    sendOnSignUp: true,
    sendOnSignIn: true,
    // Deliberately left unset (false): this app's own client only ever picks
    // up a session from its own authClient calls, stored via
    // expo-secure-store — the verification link is opened by an external
    // browser/webview (email client), so any session cookie Better Auth
    // would set on *that* request never reaches the app's own session
    // storage regardless of this flag. The client's verify-email screen
    // shows a plain "verified, now sign in" confirmation instead of assuming
    // it's authenticated — see src/app/(auth)/verify-email.tsx.
    autoSignInAfterVerification: false,
    sendVerificationEmail: async ({ user, url }) => {
      await resend.emails.send({
        from: fromEmail,
        to: user.email,
        subject: 'Verify your Splitsy email',
        html: `<p>Welcome to Splitsy! Confirm your email address to finish setting up your account.</p><p><a href="${url}">Verify your email</a></p><p>If you didn't create a Splitsy account, you can safely ignore this email.</p>`,
      });
    },
  },
  plugins: [expo()],
});
