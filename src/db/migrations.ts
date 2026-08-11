import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';

import migrations from '../../drizzle/migrations';
import { db } from './client';

// Gates rendering in the root layout until migrations finish. On failure the
// root layout shows the "Database startup failure" copy (spec section 14)
// instead of rendering the app on top of a half-migrated database.
export function useDatabaseMigrations() {
  return useMigrations(db, migrations);
}
