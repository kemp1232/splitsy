import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseSync } from 'expo-sqlite';

import * as schema from './schema';

// Cascade deletes declared in schema.ts are only enforced when this pragma is
// on for the connection — SQLite does not enable foreign keys by default.
const expoDb = openDatabaseSync('splitsy.db');
expoDb.execSync('PRAGMA foreign_keys = ON;');

export const db = drizzle(expoDb, { schema });
