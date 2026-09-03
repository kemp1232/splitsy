import { drizzle } from 'drizzle-orm/sqlite-proxy';
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';

import * as schema from './schema';
import { loadPersistedDatabase, savePersistedDatabase } from './web/idbPersistence';

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
// Since real OPFS persistence hit a Metro-bundling-specific dead end on
// every attempt, this runs @sqlite.org/sqlite-wasm directly on the main
// thread instead (its own documented "without OPFS" mode — see that
// package's README) — no worker, no COOP/COEP requirement, no
// SharedArrayBuffer. STOPGAP PERSISTENCE: the whole database is exported to
// a single binary blob (`sqlite3_js_db_export`) and saved to IndexedDB
// (`./web/idbPersistence.ts`) shortly after every write, then restored
// (`sqlite3_deserialize`) on the next load — not `localStorage`, which only
// stores strings (a ~33% size-inflating base64 round trip for binary data)
// and has a much lower per-origin size ceiling than IndexedDB. This is a
// whole-file save, not incremental — fine for this app's size, but revisit
// if the database grows large enough for that to matter. True OPFS
// persistence remains the better long-term fix (revisit once there's a
// working path to serve sqlite3-opfs-async-proxy.js correctly, or
// Metro/Expo's web-worker bundling recognizes the two-statement
// `new URL()` + `new Worker()` form) — nothing else in this file would need
// to change beyond swapping the save/restore calls below for OPFS's own
// automatic persistence, since drizzle-orm/sqlite-proxy's callback shape is
// unaffected either way.
type Sqlite3 = Awaited<ReturnType<typeof sqlite3InitModule>>;
type Sqlite3Db = InstanceType<Sqlite3['oo1']['DB']>;

let dbReady: Promise<{ sqlite3: Sqlite3; sqliteDb: Sqlite3Db }> | null = null;

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

// SQLite's own C API for loading a serialized database image into an
// already-open (empty) connection — the counterpart to
// `sqlite3_js_db_export` used in `schedulePersist` below. `allocFromTypedArray`
// copies `bytes` into WASM linear memory first, since `sqlite3_deserialize`
// takes a raw pointer, not a JS array; `FREEONCLOSE` tells SQLite to free
// that memory itself when the connection closes, `RESIZEABLE` lets the
// in-memory database grow past the restored snapshot's original size as the
// app keeps writing to it.
function restoreDatabase(sqlite3: Sqlite3, sqliteDb: Sqlite3Db, bytes: Uint8Array) {
  const pData = sqlite3.wasm.allocFromTypedArray(bytes);
  sqlite3.capi.sqlite3_deserialize(
    sqliteDb.pointer!,
    'main',
    pData,
    bytes.length,
    bytes.length,
    sqlite3.capi.SQLITE_DESERIALIZE_FREEONCLOSE | sqlite3.capi.SQLITE_DESERIALIZE_RESIZEABLE,
  );
}

function getDb() {
  if (!dbReady) {
    dbReady = initSqlite3({ locateFile: () => '/sqlite3.wasm' }).then(async (sqlite3) => {
      // 'c' = create the file if it doesn't exist yet. Not 'ct' — the 't'
      // flag enables sqlite3-wasm's own verbose per-statement SQL_TRACE
      // console logging (confirmed by reading its source), which isn't
      // something this app wants on by default; it was left in by mistake,
      // copied verbatim from the package's own README example.
      const sqliteDb = new sqlite3.oo1.DB('/splitsy.sqlite3', 'c');
      const savedBytes = await loadPersistedDatabase();
      if (savedBytes && savedBytes.length > 0) {
        restoreDatabase(sqlite3, sqliteDb, savedBytes);
      }
      // Cascade deletes declared in schema.ts are only enforced when this
      // pragma is on for the connection — same as client.ts's native setup.
      // Set after restoring, not before: PRAGMA foreign_keys is a
      // per-connection setting, not something stored in the database file
      // itself, so it has to be (re-)applied regardless of which branch above
      // ran.
      sqliteDb.exec('PRAGMA foreign_keys = ON;');
      return { sqlite3, sqliteDb };
    });
  }
  return dbReady;
}

// Debounced so a burst of writes (e.g. a transaction inserting many item
// assignments, or the migration run's many CREATE TABLE statements) produces
// one save shortly after the burst settles rather than one per statement.
// Best-effort on tab close: `beforeunload` can't reliably await async work
// before the page terminates, so this just fires the save immediately
// (skipping the debounce) rather than guaranteeing it completes.
const PERSIST_DEBOUNCE_MS = 500;
let persistTimeout: ReturnType<typeof setTimeout> | null = null;

function schedulePersist(sqlite3: Sqlite3, sqliteDb: Sqlite3Db) {
  if (persistTimeout) clearTimeout(persistTimeout);
  persistTimeout = setTimeout(() => {
    persistTimeout = null;
    void savePersistedDatabase(sqlite3.capi.sqlite3_js_db_export(sqliteDb.pointer!));
  }, PERSIST_DEBOUNCE_MS);
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    if (!persistTimeout || !dbReady) return;
    clearTimeout(persistTimeout);
    // Only fires if getDb() already resolved by now — a reasonable
    // assumption, since reaching this point means the app already ran at
    // least one write against an open connection.
    void dbReady.then(({ sqlite3, sqliteDb }) => {
      void savePersistedDatabase(sqlite3.capi.sqlite3_js_db_export(sqliteDb.pointer!));
    });
  });
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
  const { sqlite3, sqliteDb } = await getDb();
  // `.returning()` inserts execute via 'all', not 'run' — a plain method
  // check would miss those — so this instead checks the statement itself:
  // anything that isn't a SELECT is treated as a write worth persisting
  // (covers INSERT/UPDATE/DELETE, migrations' CREATE TABLE/INDEX, and
  // BEGIN/COMMIT — a harmless over-trigger on the rare non-mutating
  // statement, like a bare PRAGMA, is fine).
  const isWrite = !/^\s*select/i.test(sql);
  if (method === 'run') {
    sqliteDb.exec({ sql, bind: params });
    if (isWrite) schedulePersist(sqlite3, sqliteDb);
    return { rows: [] };
  }
  const resultRows = sqliteDb.exec({
    sql,
    bind: params,
    returnValue: 'resultRows',
    rowMode: 'array',
  });
  if (isWrite) schedulePersist(sqlite3, sqliteDb);
  return { rows: method === 'get' ? (resultRows[0] ?? undefined) : resultRows };
}

export const db = drizzle(queryWebSqlite, { schema });
