import { and, asc, eq } from 'drizzle-orm';

import { nowIso } from '@/lib/date';

import { db } from '../client';
import { tripParticipants } from '../schema';

export type TripParticipant = typeof tripParticipants.$inferSelect;
export type NewTripParticipant = typeof tripParticipants.$inferInsert;

export const tripParticipantsRepository = {
  // Active-only by default (spec-adjacent trip roster convention: a
  // deactivated roster member should disappear from every "who's on this
  // trip" list without losing their stable id — see schema.ts's comment on
  // tripParticipants for why this table is soft-delete only).
  async listByTripId(
    tripId: string,
    { activeOnly = true }: { activeOnly?: boolean } = {},
  ): Promise<TripParticipant[]> {
    return db
      .select()
      .from(tripParticipants)
      .where(
        activeOnly
          ? and(eq(tripParticipants.tripId, tripId), eq(tripParticipants.isActive, true))
          : eq(tripParticipants.tripId, tripId),
      )
      .orderBy(asc(tripParticipants.sortOrder));
  },

  async create(row: NewTripParticipant): Promise<TripParticipant> {
    const [created] = await db.insert(tripParticipants).values(row).returning();
    if (!created) throw new Error('Failed to create trip participant');
    return created;
  },

  // Soft-delete only — this table intentionally has no hard-delete method.
  // Re-adding the same person later must reuse this same row (via `update`,
  // flipping `isActive` back to true) rather than minting a new id, since a
  // settlement-aggregation module built after this one keys combined-trip
  // aggregation by this table's id.
  async deactivate(id: string): Promise<void> {
    await db
      .update(tripParticipants)
      .set({ isActive: false, updatedAt: nowIso() })
      .where(eq(tripParticipants.id, id));
  },

  async update(id: string, patch: Partial<NewTripParticipant>): Promise<void> {
    await db.update(tripParticipants).set(patch).where(eq(tripParticipants.id, id));
  },
};
