import 'dotenv/config';

import { serve } from '@hono/node-server';
import { getMigrations } from 'better-auth/db/migration';
import { Hono } from 'hono';
import { cors } from 'hono/cors';

import { auth, webAppOrigins } from './auth.js';
import { ocrRoute } from './routes/ocr.js';

// Better Auth doesn't auto-create its tables — run its migrations against
// server/data/auth.db on every boot so a fresh checkout works without a
// separate manual CLI step. Idempotent: a no-op once the schema is current.
const { runMigrations } = await getMigrations(auth.options);
await runMigrations();

const app = new Hono();

// Only the web build needs this — native `fetch` calls are never subject to
// browser CORS/cookie-origin rules, so this has never come up before the web
// port. `credentials: true` (required for Better Auth's cookie-based web
// session — see src/lib/authClient.web.ts's `fetchOptions.credentials`)
// means `origin` must be an explicit allowlist, never `'*'` — the browser
// rejects a wildcard origin alongside `Allow-Credentials: true`. Same
// `webAppOrigins` list auth.ts's own `trustedOrigins` uses — CORS alone
// isn't enough, since that's a browser-side check; Better Auth does its own
// separate server-side origin check too.
app.use(
  '/api/*',
  cors({
    origin: webAppOrigins,
    credentials: true,
  }),
);

app.get('/health', (c) => c.json({ status: 'ok' }));
app.on(['POST', 'GET'], '/api/auth/*', (c) => auth.handler(c.req.raw));
app.route('/', ocrRoute);

const port = Number(process.env.PORT ?? 8787);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Splitsy OCR backend listening on http://0.0.0.0:${info.port}`);
});
