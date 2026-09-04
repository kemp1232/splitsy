import 'dotenv/config';

import { serve } from '@hono/node-server';
import { getMigrations } from 'better-auth/db/migration';

import { app } from './app.js';
import { auth } from './auth.js';

// Local dev / the Docker image (Fly.io or any other long-running-process
// host) entrypoint — runs migrations once at boot, then starts listening.
// Not used by the Vercel deploy (api/[[...route]].ts): a serverless
// function has no boot-once moment shared across invocations, so migrations
// there are a separate, explicit step instead (see src/migrate.ts) rather
// than an inline side effect that would otherwise re-run on every cold
// start. Idempotent either way — a no-op once the schema is current.
const { runMigrations } = await getMigrations(auth.options);
await runMigrations();

const port = Number(process.env.PORT ?? 8787);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Splitsy OCR backend listening on http://0.0.0.0:${info.port}`);
});
