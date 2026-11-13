import { desc, eq } from 'drizzle-orm';

import { normalizeParticipantName } from '@/features/participants/validateParticipantName';
import { createId } from '@/lib/ids';

import { db } from '../client';
import { savedPeople } from '../schema';

export type SavedPerson = typeof savedPeople.$inferSelect;

// Device-wide saved names (see schema.ts's savedPeople). Every write is a
// single statement, so like appSettings.repository this needs no .web
// variant. The table is cleared by bill.service's resetAllLocalData and
// wipeAllLocalData.
export const savedPeopleRepository = {
  // Most recently used first — the order suggestions are offered in.
  async listAll(): Promise<SavedPerson[]> {
    return db.select().from(savedPeople).orderBy(desc(savedPeople.lastUsedAt));
  },

  // Remembers `name`: inserts it, or — when a saved person already has the
  // same normalized name (any casing) — only bumps lastUsedAt, keeping the
  // saved display name (which the user may have renamed in Settings).
  async touch(name: string, timestamp: string): Promise<void> {
    await db
      .insert(savedPeople)
      .values({
        id: createId(),
        name,
        normalizedName: normalizeParticipantName(name),
        lastUsedAt: timestamp,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .onConflictDoUpdate({
        target: savedPeople.normalizedName,
        set: { lastUsedAt: timestamp, updatedAt: timestamp },
      });
  },

  // Callers validate uniqueness first; the unique index still rejects a
  // clash.
  async rename(id: string, name: string, timestamp: string): Promise<void> {
    await db
      .update(savedPeople)
      .set({ name, normalizedName: normalizeParticipantName(name), updatedAt: timestamp })
      .where(eq(savedPeople.id, id));
  },

  // Group memberships go via the FK cascade; bill participants are never
  // linked to this table, so no bill changes.
  async remove(id: string): Promise<void> {
    await db.delete(savedPeople).where(eq(savedPeople.id, id));
  },
};
