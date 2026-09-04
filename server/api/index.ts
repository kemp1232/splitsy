import { app } from '../src/app.js';

// The one function this whole API is — ../vercel.json's catch-all rewrite
// (`/(.*) -> /api`) sends every request here regardless of path, and the
// Hono app itself (src/app.ts) does the real routing from there (/api/
// auth/*, /api/ocr, /api/health), exactly like it does everywhere else
// this server runs. NOT a bracket-named catch-all file (api/[...route].ts
// or api/[[...route]].ts) — confirmed live, with `framework: null` in
// vercel.json (see that file's own comment for why), Vercel's plain Node
// builder only ever routed a *single* path segment to a bracket-catch-all
// file (/api/health and /api/ocr reached it; /api/auth/sign-up/email and
// even a made-up /api/foo/bar both 404'd before reaching the function at
// all) — the bracket convention appears to be Next.js-specific routing
// this project's own framework-less build doesn't get. The rewrite sidesteps
// that entirely: every request, any number of path segments, lands on this
// one literal file.
//
// Explicit Node.js runtime, not Edge: Better Auth + Resend + this app's
// other dependencies aren't verified against the Edge runtime's trimmed-
// down Web APIs, and Node is all this needs — @neondatabase/serverless's
// Pool works the same way in either runtime.
export const config = { runtime: 'nodejs' };

// Named per-method exports (Vercel's own documented Web-standard function
// convention: `(request: Request) => Response | Promise<Response>`), not
// `hono/vercel`'s `handle()` — that returns a single default-exported
// `(req) => app.fetch(req)`, which on this Vercel CLI version got
// mis-detected as the *legacy* Node `(req, res) => void` handler shape
// instead (confirmed live: "default export returned a `Response`... you
// likely meant the Web fetch-style API" in `vercel logs`, then every
// request hanging forever since nothing ever called `res.end()`). Every
// method this app's routes actually receive (GET/POST for /api/auth/*,
// POST for /api/ocr, GET for /api/health) forwards to the same handler —
// Hono's own router inside `app` is what actually dispatches by path AND
// method, so listing methods here is just "let requests with this method
// reach that router" versus Vercel 405-ing them before they arrive.
// `async`, not just a `Promise<Response>`-annotated return type: Vercel's
// own build-time typecheck for these named exports (a different, stricter
// config than server/tsconfig.json's own `tsc --noEmit` — that one doesn't
// even include api/**, so this file is never checked by it) rejected a
// plain function returning `app.fetch(request)` directly, since Hono's own
// `fetch` is typed to return `Response | Promise<Response>` — an `async`
// function's return type is checked against the *awaited* value instead,
// so it's unambiguously fine either way, regardless of which tsconfig ends
// up applied to this specific file.
async function handler(request: Request): Promise<Response> {
  return app.fetch(request);
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const OPTIONS = handler;
