import 'dotenv/config';

import { getMigrations } from 'better-auth/db/migration';

import { auth } from './auth.js';

// Standalone migration runner (`npm run db:migrate`) — the Vercel deploy
// (api/[[...route]].ts) has no boot-once moment the way src/index.ts's own
// long-running process does, so migrations there are a separate, explicit
// step: run this once against DATABASE_URL after deploying (or before —
// order doesn't matter, this only ever adds tables/columns, never touches
// existing data) rather than an inline side effect on every request.
// Idempotent — a no-op once the schema is current, safe to re-run.
const { runMigrations } = await getMigrations(auth.options);
await runMigrations();
console.log('Migrations up to date.');
