import { asc, eq } from 'drizzle-orm';

import { db } from '../client';
import { participants } from '../schema';

export type Participant = typeof participants.$inferSelect;
export type NewParticipant = typeof participants.$inferInsert;

export const participantsRepository = {
  async listByBillId(billId: string): Promise<Participant[]> {
    return db
      .select()
      .from(participants)
      .where(eq(participants.billId, billId))
      .orderBy(asc(participants.sortOrder));
  },

  async create(participant: NewParticipant): Promise<Participant> {
    const [row] = await db.insert(participants).values(participant).returning();
    if (!row) throw new Error('Failed to create participant');
    return row;
  },

  async update(id: string, patch: Partial<NewParticipant>): Promise<void> {
    await db.update(participants).set(patch).where(eq(participants.id, id));
  },

  // Cascade-deletes the participant's item assignments and adjustment
  // allocations via the FK pragma in db/client.ts.
  async remove(id: string): Promise<void> {
    await db.delete(participants).where(eq(participants.id, id));
  },
};
