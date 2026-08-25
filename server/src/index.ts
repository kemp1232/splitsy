import 'dotenv/config';

import { serve } from '@hono/node-server';
import { getMigrations } from 'better-auth/db/migration';
import { Hono } from 'hono';

import { auth } from './auth.js';
import { ocrRoute } from './routes/ocr.js';

// Better Auth doesn't auto-create its tables — run its migrations against
// server/data/auth.db on every boot so a fresh checkout works without a
// separate manual CLI step. Idempotent: a no-op once the schema is current.
const { runMigrations } = await getMigrations(auth.options);
await runMigrations();

const app = new Hono();

app.get('/health', (c) => c.json({ status: 'ok' }));
app.on(['POST', 'GET'], '/api/auth/*', (c) => auth.handler(c.req.raw));
app.route('/', ocrRoute);

const port = Number(process.env.PORT ?? 8787);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Splitsy OCR backend listening on http://0.0.0.0:${info.port}`);
});
