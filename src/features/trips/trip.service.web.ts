import { eq } from 'drizzle-orm';

import { copy } from '@/constants/copy';
import { db } from '@/db/client';
import type { Bill } from '@/db/repositories/bills.repository';
import type { Trip } from '@/db/repositories/trips.repository';
import { tripsRepository } from '@/db/repositories/trips.repository';
import { tripParticipantsRepository } from '@/db/repositories/tripParticipants.repository';
import { bills, participants, tripParticipants, trips } from '@/db/schema';
import type { CreateDraftBillInput } from '@/features/bills/bill.service';
import { deleteBill } from '@/features/bills/bill.service';
import { nowIso } from '@/lib/date';
import { createId } from '@/lib/ids';

// Web counterpart to trip.service.ts — same reasoning as
// bill.service.web.ts's own header comment: drizzle-orm/sqlite-proxy (this
// app's web SQLite driver) only supports an *async* `db.transaction()`
// callback, unlike native's sync one, so this can't be a shared file.

type CreateTripInput = {
  name?: string | null;
  rosterNames: string[];
};

export async function createTrip(input: CreateTripInput): Promise<Trip> {
  const timestamp = nowIso();

  return db.transaction(async (tx) => {
    const [trip] = await tx
      .insert(trips)
      .values({
        id: createId(),
        name: input.name ?? null,
        status: 'ACTIVE',
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .returning();

    if (!trip) throw new Error('Failed to create trip');

    if (input.rosterNames.length > 0) {
      await tx.insert(tripParticipants).values(
        input.rosterNames.map((name, index) => ({
          id: createId(),
          tripId: trip.id,
          name,
          sortOrder: index,
          isActive: true,
          createdAt: timestamp,
          updatedAt: timestamp,
        })),
      );
    }

    return trip;
  });
}

export async function createBillInTrip(tripId: string, input: CreateDraftBillInput): Promise<Bill> {
  const roster = await tripParticipantsRepository.listByTripId(tripId);
  const timestamp = nowIso();

  return db.transaction(async (tx) => {
    const [bill] = await tx
      .insert(bills)
      .values({
        id: createId(),
        title: copy.home.unknownMerchantTitle,
        currency: 'PHP',
        status: 'DRAFT',
        tripId,
        entryMethod: input.entryMethod,
        receiptImageUri: input.receiptImageUri ?? null,
        originalReceiptImageUri: input.originalReceiptImageUri ?? null,
        discrepancyAcknowledged: false,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .returning();

    if (!bill) throw new Error('Failed to create bill');

    if (roster.length > 0) {
      await tx.insert(participants).values(
        roster.map((member, index) => ({
          id: createId(),
          billId: bill.id,
          sortOrder: index,
          name: member.name,
          tripParticipantId: member.id,
          createdAt: timestamp,
          updatedAt: timestamp,
        })),
      );
    }

    return bill;
  });
}

export async function deleteTrip(trip: Trip): Promise<void> {
  const tripBills: Bill[] = await db.select().from(bills).where(eq(bills.tripId, trip.id));

  for (const bill of tripBills) {
    await deleteBill(bill);
  }

  await tripsRepository.remove(trip.id);
}
