import { eq, inArray } from 'drizzle-orm';

import { db } from '../client';
import { appSettings } from '../schema';

// Device-local key/value settings (the app_settings table). Every write is a
// single statement, so unlike itemAssignments/adjustmentAllocations this
// needs no .web variant — `db` already resolves to client.web.ts on web.
// The whole table is cleared by bill.service's resetAllLocalData and
// wipeAllLocalData.
export const appSettingsRepository = {
  async getMany(keys: string[]): Promise<Map<string, string>> {
    if (keys.length === 0) return new Map();
    const rows = await db.select().from(appSettings).where(inArray(appSettings.key, keys));
    return new Map(rows.map((row) => [row.key, row.value]));
  },

  async set(key: string, value: string): Promise<void> {
    await db
      .insert(appSettings)
      .values({ key, value })
      .onConflictDoUpdate({ target: appSettings.key, set: { value } });
  },

  async remove(key: string): Promise<void> {
    await db.delete(appSettings).where(eq(appSettings.key, key));
  },
};
