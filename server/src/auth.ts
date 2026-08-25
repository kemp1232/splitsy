import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { expo } from '@better-auth/expo';
import { betterAuth } from 'better-auth';
import Database from 'better-sqlite3';
import { Resend } from 'resend';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

const missing: string[] = [];
if (!BETTER_AUTH_SECRET) missing.push('BETTER_AUTH_SECRET');
if (!BETTER_AUTH_URL) missing.push('BETTER_AUTH_URL');
if (!RESEND_API_KEY) missing.push('RESEND_API_KEY');

if (missing.length > 0) {
  console.error(
    `Missing required env var(s): ${missing.join(', ')}. Add them to server/.env ` +
      '(see server/.env.example for what each one is and where to get it).',
  );
  process.exit(1);
}

const resend = new Resend(RESEND_API_KEY);
const fromEmail = process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev';

// Better Auth's Expo plugin redirects back into the app via its custom URL
// scheme (see app.config.ts / src/constants/appInfo.json), so that scheme
// must be a trusted origin. The exp:// entries are only reachable in
// development, when running inside Expo Go / a dev client rather than a
// standalone build.
const trustedOrigins = [
  `${EXPO_SCHEME}://`,
  ...(process.env.NODE_ENV !== 'production' ? ['exp://', 'exp://**', 'exp://192.168.*.*:*/**'] : []),
];

// Vitest sets NODE_ENV=test automatically, so test runs are routed to an
// in-memory SQLite database rather than the real server/data/auth.db file —
// tests never create, migrate, or write to that file.
const dbPath =
  process.env.NODE_ENV === 'test' ? ':memory:' : path.join(__dirname, '../data/auth.db');

// A fresh checkout has no server/data/ directory (it's git-ignored — see
// .gitignore — because it holds real user data). better-sqlite3 will not
// create missing parent directories itself, so ensure it exists up front.
if (dbPath !== ':memory:') {
  mkdirSync(path.dirname(dbPath), { recursive: true });
}

export const auth = betterAuth({
  database: new Database(dbPath),
  secret: BETTER_AUTH_SECRET,
  baseURL: BETTER_AUTH_URL,
  trustedOrigins,
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    sendResetPassword: async ({ user, url }) => {
      await resend.emails.send({
        from: fromEmail,
        to: user.email,
        subject: 'Reset your Splitsy password',
        html: `<p>Someone requested a password reset for your Splitsy account.</p><p><a href="${url}">Reset your password</a></p><p>If you didn't request this, you can safely ignore this email.</p>`,
      });
    },
  },
  plugins: [expo()],
});
