import { desc, eq, sql } from 'drizzle-orm';

import { db } from '../client';
import { bills, trips } from '../schema';

export type Trip = typeof trips.$inferSelect;
export type NewTrip = typeof trips.$inferInsert;
export type TripWithBillCount = { trip: Trip; billCount: number };

export const tripsRepository = {
  // Newest first, with a count of bills under each trip — mirrors
  // bills.repository.ts's listAllWithParticipantCounts.
  async listAllWithBillCounts(): Promise<TripWithBillCount[]> {
    return db
      .select({ trip: trips, billCount: sql<number>`count(${bills.id})` })
      .from(trips)
      .leftJoin(bills, eq(bills.tripId, trips.id))
      .groupBy(trips.id)
      .orderBy(desc(trips.updatedAt));
  },

  async getById(id: string): Promise<Trip | undefined> {
    const [row] = await db.select().from(trips).where(eq(trips.id, id));
    return row;
  },

  async create(trip: NewTrip): Promise<Trip> {
    const [row] = await db.insert(trips).values(trip).returning();
    if (!row) throw new Error('Failed to create trip');
    return row;
  },

  async update(id: string, patch: Partial<NewTrip>): Promise<void> {
    await db.update(trips).set(patch).where(eq(trips.id, id));
  },

  // Cascade-deletes trip_participants via the FK pragma in db/client.ts —
  // caller (trip.service.ts's deleteTrip) is responsible for deleting each
  // of the trip's bills first (via bill.service.ts's deleteBill, which cleans
  // up receipt image files) rather than relying on bills.tripId's own
  // cascade, which would silently skip that file cleanup.
  async remove(id: string): Promise<void> {
    await db.delete(trips).where(eq(trips.id, id));
  },
};
