import 'dotenv/config';

import { serve } from '@hono/node-server';
import { Hono } from 'hono';

import { ocrRoute } from './routes/ocr.js';

const app = new Hono();

app.get('/health', (c) => c.json({ status: 'ok' }));
app.route('/', ocrRoute);

const port = Number(process.env.PORT ?? 8787);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Splitsy OCR backend listening on http://0.0.0.0:${info.port}`);
});
