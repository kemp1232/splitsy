import { and, asc, eq, inArray } from 'drizzle-orm';

import { db } from '../client';
import { savedGroupMembers, savedGroups } from '../schema';

export type SavedGroup = typeof savedGroups.$inferSelect;
export type SavedGroupWithMembers = { group: SavedGroup; memberIds: string[] };

// Named groups of saved people (see schema.ts's savedGroups). Every write is
// a single statement, so like appSettings.repository this needs no .web
// variant (native and web transaction shapes differ — see
// itemAssignments.repository.web.ts). The tables are cleared by
// bill.service's resetAllLocalData and wipeAllLocalData.
export const savedGroupsRepository = {
  async listWithMembers(): Promise<SavedGroupWithMembers[]> {
    const groups = await db.select().from(savedGroups).orderBy(asc(savedGroups.createdAt));
    const members = await db
      .select({
        groupId: savedGroupMembers.groupId,
        savedPersonId: savedGroupMembers.savedPersonId,
      })
      .from(savedGroupMembers);
    return groups.map((group) => ({
      group,
      memberIds: members
        .filter((member) => member.groupId === group.id)
        .map((member) => member.savedPersonId),
    }));
  },

  async create(row: { id: string; name: string; timestamp: string }): Promise<void> {
    await db
      .insert(savedGroups)
      .values({ id: row.id, name: row.name, createdAt: row.timestamp, updatedAt: row.timestamp });
  },

  async rename(id: string, name: string, timestamp: string): Promise<void> {
    await db.update(savedGroups).set({ name, updatedAt: timestamp }).where(eq(savedGroups.id, id));
  },

  // Memberships go via the FK cascade; the saved people stay.
  async remove(id: string): Promise<void> {
    await db.delete(savedGroups).where(eq(savedGroups.id, id));
  },

  async addMembers(groupId: string, savedPersonIds: string[]): Promise<void> {
    if (savedPersonIds.length === 0) return;
    await db
      .insert(savedGroupMembers)
      .values(savedPersonIds.map((savedPersonId) => ({ groupId, savedPersonId })))
      .onConflictDoNothing();
  },

  async removeMembers(groupId: string, savedPersonIds: string[]): Promise<void> {
    if (savedPersonIds.length === 0) return;
    await db
      .delete(savedGroupMembers)
      .where(
        and(
          eq(savedGroupMembers.groupId, groupId),
          inArray(savedGroupMembers.savedPersonId, savedPersonIds),
        ),
      );
  },
};
