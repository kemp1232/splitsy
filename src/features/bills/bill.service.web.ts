import { and, eq } from 'drizzle-orm';

import { db } from '@/db/client';
// Explicit .web path, like receiptImage.service.web below: native client.ts
// has no counterpart (its writes are already durable).
import { persistDatabaseNow } from '@/db/client.web';
import type { AdjustmentAllocation } from '@/db/repositories/adjustmentAllocations.repository';
import type { Adjustment } from '@/db/repositories/adjustments.repository';
import type { Bill, NewBill } from '@/db/repositories/bills.repository';
import { billsRepository } from '@/db/repositories/bills.repository';
import { tripParticipantsRepository } from '@/db/repositories/tripParticipants.repository';
import {
  adjustmentAllocations,
  adjustments,
  appSettings,
  bills,
  lineItems,
  participants,
  tripParticipants,
  trips,
} from '@/db/schema';
import { deleteReceiptsDirectory } from '@/features/receipt-capture/receiptImage.service';
import { deleteStoredImage } from '@/features/receipt-capture/receiptImage.service.web';
import { deleteAllImages } from '@/features/receipt-capture/web/imageStore';
import { PARSER_VERSION } from '@/features/receipt-parser/parseReceipt';
import { validateParsedReceipt } from '@/features/receipt-parser/receiptParser.schemas';
import type { ParsedReceipt } from '@/features/receipt-parser/receiptParser.types';
import { nowIso } from '@/lib/date';
import { createId } from '@/lib/ids';

// Web counterpart to bill.service.ts. Identical in intent to every function
// below — see that file's own comments for the "why" behind each one — but
// every `db.transaction()` here is called with an *async* callback
// (`await db.transaction(async (tx) => { await tx.x().run(); })`), unlike
// native's *sync* one (`db.transaction((tx) => { tx.x().run(); })`).
// drizzle-orm/sqlite-proxy (this app's web SQLite driver — see
// src/db/client.web.ts) only supports the async shape; the two aren't
// source-compatible (an unawaited `.run()` inside a sync callback here would
// let the wrapper's own `commit` race ahead of the actual statements, since
// nothing would block for them to finish), so this can't be a shared file.
// Every function that touches `db.transaction()` also becomes genuinely
// async here (native's own versions are either already async, or
// synchronous only because expo-sqlite itself is) — their callers already
// `await` every one of these calls (harmless on native, load-bearing here).

export type CreateDraftBillInput = {
  entryMethod: NewBill['entryMethod'];
  receiptImageUri?: string;
  originalReceiptImageUri?: string;
};

export async function createDraftBill(input: CreateDraftBillInput): Promise<Bill> {
  const timestamp = nowIso();
  return billsRepository.create({
    id: createId(),
    // Empty, not a placeholder: an untitled bill's name is derived at
    // display time (getBillDisplayTitle → "Bill · Nov 5").
    title: '',
    currency: 'PHP',
    status: 'DRAFT',
    entryMethod: input.entryMethod,
    receiptImageUri: input.receiptImageUri ?? null,
    originalReceiptImageUri: input.originalReceiptImageUri ?? null,
    discrepancyAcknowledged: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

export async function createQuickSplitBill(input: {
  title: string;
  totalCentavos: number;
  tripId?: string | null;
}): Promise<Bill> {
  const tripId = input.tripId ?? null;
  const roster = tripId ? await tripParticipantsRepository.listByTripId(tripId) : [];
  const id = createId();
  const timestamp = nowIso();
  const title = input.title.trim();

  return db.transaction(async (tx) => {
    const [bill] = await tx
      .insert(bills)
      .values({
        id,
        title,
        currency: 'PHP',
        entryMethod: 'MANUAL',
        status: 'DRAFT',
        splitMode: 'EQUAL',
        tripId,
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
          billId: id,
          sortOrder: index,
          name: member.name,
          tripParticipantId: member.id,
          createdAt: timestamp,
          updatedAt: timestamp,
        })),
      );
    }

    await tx.insert(lineItems).values({
      id: createId(),
      billId: id,
      sortOrder: 0,
      name: 'Total',
      quantity: 1,
      lineTotalCentavos: input.totalCentavos,
      source: 'MANUAL',
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    return bill;
  });
}

export async function saveParsedReceiptDraft(billId: string, parsed: ParsedReceipt): Promise<void> {
  const validated = validateParsedReceipt(parsed);
  const timestamp = nowIso();

  await db.transaction(async (tx) => {
    if (validated.items.length > 0) {
      await tx.insert(lineItems).values(
        validated.items.map((item, index) => ({
          id: createId(),
          billId,
          sortOrder: index,
          name: item.name,
          quantity: item.quantity,
          lineTotalCentavos: item.lineTotalCentavos,
          source: item.source,
          confidence: item.confidence,
          rawText: item.rawText,
          createdAt: timestamp,
          updatedAt: timestamp,
        })),
      );
    }

    if (validated.adjustments.length > 0) {
      await tx.insert(adjustments).values(
        validated.adjustments.map((adjustment, index) => ({
          id: createId(),
          billId,
          sortOrder: index,
          type: adjustment.type,
          label: adjustment.label,
          amountCentavos: adjustment.amountCentavos,
          allocationMethod: adjustment.allocationMethod,
          source: adjustment.source,
          createdAt: timestamp,
          updatedAt: timestamp,
        })),
      );
    }

    await tx
      .update(bills)
      .set({
        merchantName: validated.merchantName,
        receiptDate: validated.receiptDate,
        rawOcrText: validated.rawText,
        detectedSubtotalCentavos: validated.detectedSubtotalCentavos,
        detectedReceiptTotalCentavos: validated.detectedTotalCentavos,
        parserVersion: PARSER_VERSION,
        updatedAt: timestamp,
      })
      .where(eq(bills.id, billId));
  });
}

export async function removeParticipant(billId: string, participantId: string): Promise<void> {
  const timestamp = nowIso();

  await db.transaction(async (tx) => {
    const billAdjustments: Adjustment[] = await tx
      .select()
      .from(adjustments)
      .where(eq(adjustments.billId, billId));

    for (const adjustment of billAdjustments) {
      if (adjustment.allocationMethod !== 'CUSTOM') continue;

      const ownAllocation: AdjustmentAllocation | undefined = (
        await tx
          .select()
          .from(adjustmentAllocations)
          .where(
            and(
              eq(adjustmentAllocations.adjustmentId, adjustment.id),
              eq(adjustmentAllocations.participantId, participantId),
            ),
          )
      )[0];

      if (!ownAllocation) continue;

      await tx
        .delete(adjustmentAllocations)
        .where(eq(adjustmentAllocations.adjustmentId, adjustment.id));

      await tx
        .update(adjustments)
        .set({ allocationMethod: 'PROPORTIONAL', updatedAt: timestamp })
        .where(eq(adjustments.id, adjustment.id));
    }

    await tx.delete(participants).where(eq(participants.id, participantId));
  });
}

// Ordering matches native's own deleteBill: image(s) first, DB row second,
// unconditionally — see that file's header comment for the full reasoning
// (deleting is supposed to be permanent, and "row gone, image still stored"
// is worse than a rare orphaned image left behind).
export async function deleteBill(bill: Bill): Promise<void> {
  const imageUris = new Set(
    [bill.receiptImageUri, bill.originalReceiptImageUri].filter(
      (uri): uri is string => uri != null,
    ),
  );

  for (const uri of imageUris) {
    try {
      await deleteStoredImage(uri);
    } catch {
      // Same posture as native: never block deleting the bill itself over a
      // receipt image that can't be cleaned up.
    }
  }

  await db.delete(bills).where(eq(bills.id, bill.id));
}

export async function resetAllLocalData(): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(bills);
    await tx.delete(appSettings);
  });

  deleteReceiptsDirectory();
}

// Web counterpart to bill.service.ts's wipeAllLocalData — see there. Unlike
// resetAllLocalData, it only resolves once the wipe is durable: the emptied
// database is saved to IndexedDB immediately (not after the usual debounce)
// and the stored receipt images are cleared, both awaited, so any failure
// rejects and the caller keeps its pending-wipe marker for a retry.
export async function wipeAllLocalData(): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(bills);
    await tx.delete(tripParticipants);
    await tx.delete(trips);
    await tx.delete(appSettings);
  });

  await persistDatabaseNow();
  await deleteAllImages();
}
