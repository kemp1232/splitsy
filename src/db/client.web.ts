import { drizzle } from 'drizzle-orm/sqlite-proxy';
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';

import * as schema from './schema';

// Web counterpart to client.ts.
//
// Two worker-based approaches were tried first and both failed under
// Metro's web bundling (see WEB_PORT_STATUS.md's "Phase 1 spike result" and
// its "take 2"): expo-sqlite's own web driver (wa-sqlite) died with a
// `Sync operation timeout` — its worker, spawned from a `blob:` URL, appears
// not to inherit the page's cross-origin-isolation state. Re-attempting with
// @sqlite.org/sqlite-wasm's own worker+OPFS mode hit a different failure:
// its OPFS support needs its own *nested* worker
// (sqlite3-opfs-async-proxy.js), created via a two-statement
// `new URL(...)` + `new Worker(...)` pattern Metro's web-worker bundling
// doesn't recognize (unlike the single-expression form this app's own code
// uses), so that file never ends up served where the library expects it,
// and the resulting failure surfaces as an uncaught
// "Module scripts don't support importScripts()" error that isn't
// recoverable from application code.
//
// KNOWN LIMITATION: since persistence requires OPFS, and OPFS requires a
// worker, and every worker-based path hit a Metro-bundling-specific dead
// end, this runs @sqlite.org/sqlite-wasm directly on the main thread instead
// (its own documented "without OPFS" mode — see that package's README) —
// no worker, no COOP/COEP requirement, no SharedArrayBuffer, and no
// persistence: the database resets on every page reload. Revisit once
// there's a working path to serve sqlite3-opfs-async-proxy.js correctly (or
// Metro/Expo's web-worker bundling recognizes the two-statement form) —
// nothing else in this file would need to change beyond swapping this
// module for a worker-backed one again, since drizzle-orm/sqlite-proxy's
// callback shape is unaffected either way.
let dbReady: Promise<InstanceType<Awaited<ReturnType<typeof sqlite3InitModule>>['oo1']['DB']>> | null =
  null;

// @sqlite.org/sqlite-wasm's default WASM-file lookup is
// `new URL('sqlite3.wasm', import.meta.url)` — relative to wherever Metro
// serves this bundled chunk from, which isn't where the actual
// `sqlite3.wasm` binary ends up (Metro's asset scanner doesn't trace this
// runtime-constructed URL the way it does the `new Worker(new URL(...))`
// pattern, so the file is never included in the bundle output at all).
// Worked around by copying the same binary sqlite-wasm ships
// (node_modules/@sqlite.org/sqlite-wasm/dist/sqlite3.wasm) into this repo's
// `public/` directory (Expo's static-passthrough folder for web — anything
// there is served verbatim at the same root-relative path) and pointing
// `locateFile` at it explicitly. `locateFile` isn't part of
// `sqlite3InitModule`'s declared TS signature even though the runtime
// function accepts it (confirmed by reading its source directly), hence the
// cast.
const initSqlite3 = sqlite3InitModule as unknown as (opts: {
  locateFile: (file: string) => string;
}) => ReturnType<typeof sqlite3InitModule>;

function getDb() {
  if (!dbReady) {
    dbReady = initSqlite3({ locateFile: () => '/sqlite3.wasm' }).then((sqlite3) => {
      const sqliteDb = new sqlite3.oo1.DB('/splitsy.sqlite3', 'ct');
      // Cascade deletes declared in schema.ts are only enforced when this
      // pragma is on for the connection — same as client.ts's native setup.
      sqliteDb.exec('PRAGMA foreign_keys = ON;');
      return sqliteDb;
    });
  }
  return dbReady;
}

// drizzle-orm/sqlite-proxy's own `AsyncRemoteCallback` type declares
// `rows: any[]` unconditionally, but its actual runtime contract for
// `method: 'get'` is looser than that: `mapGetResult` treats `rows` as the
// matched row's own value array, or an intentionally falsy `undefined` for
// "no match" — an empty array there reads as a present-but-empty row, not
// "not found" (this app's repositories never call `.get()`/`.findFirst()`
// today, so this is a correctness safeguard against future use, not a
// currently-exercised path). The explicit `Promise<{ rows: any }>` return
// type (not `any[]`) lets this callback structurally satisfy that stricter
// declared type while still returning the actually-correct `undefined` at
// runtime.
async function queryWebSqlite(
  sql: string,
  params: any[],
  method: 'run' | 'all' | 'get' | 'values',
): Promise<{ rows: any }> {
  const sqliteDb = await getDb();
  if (method === 'run') {
    sqliteDb.exec({ sql, bind: params });
    return { rows: [] };
  }
  const resultRows = sqliteDb.exec({
    sql,
    bind: params,
    returnValue: 'resultRows',
    rowMode: 'array',
  });
  return { rows: method === 'get' ? (resultRows[0] ?? undefined) : resultRows };
}

export const db = drizzle(queryWebSqlite, { schema });
