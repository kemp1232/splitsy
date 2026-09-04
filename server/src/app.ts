import type { Context } from 'hono';
import { Hono } from 'hono';
import { cors } from 'hono/cors';

import { auth, webAppOrigins } from './auth.js';
import { ocrRoute } from './routes/ocr.js';

// The Hono app itself — no side effects (no migrations, no listening
// socket) so this one file can be shared by every way this server actually
// runs: src/index.ts (local dev / the Docker image, via @hono/node-server's
// long-lived `serve()`) and api/[[...route]].ts (Vercel's Node.js function
// runtime, via hono/vercel's `handle()` — a fresh request/response cycle
// per invocation, no listening socket of its own to start).
export const app = new Hono();

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

// Registered at both paths, not just `/health`: Vercel's file-based routing
// (api/[[...route]].ts) only ever invokes this app for a request already
// under `/api/*`, so a bare `/health` never reaches it there without an
// extra rewrite — simplest fix is just answering at both paths instead of
// relying on Vercel-specific URL rewriting. `/health` alone keeps working
// unchanged for local dev, the Docker image, and Fly.io's own health check.
const healthCheck = (c: Context) => c.json({ status: 'ok' });
app.get('/health', healthCheck);
app.get('/api/health', healthCheck);
app.on(['POST', 'GET'], '/api/auth/*', (c) => auth.handler(c.req.raw));
app.route('/', ocrRoute);
