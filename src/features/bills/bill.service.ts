import { and, eq } from 'drizzle-orm';
import { File } from 'expo-file-system';

import { copy } from '@/constants/copy';
import { db } from '@/db/client';
import type { AdjustmentAllocation } from '@/db/repositories/adjustmentAllocations.repository';
import type { Adjustment } from '@/db/repositories/adjustments.repository';
import type { Bill, NewBill } from '@/db/repositories/bills.repository';
import { billsRepository } from '@/db/repositories/bills.repository';
import {
  adjustmentAllocations,
  adjustments,
  appSettings,
  bills,
  lineItems,
  participants,
} from '@/db/schema';
import { deleteReceiptsDirectory } from '@/features/receipt-capture/receiptImage.service';
import { PARSER_VERSION } from '@/features/receipt-parser/parseReceipt';
import { validateParsedReceipt } from '@/features/receipt-parser/receiptParser.schemas';
import type { ParsedReceipt } from '@/features/receipt-parser/receiptParser.types';
import { nowIso } from '@/lib/date';
import { createId } from '@/lib/ids';

// Exported so trip.service.ts's createBillInTrip (a new sibling of
// createDraftBill below, not a modification of it) can accept the exact same
// input shape.
export type CreateDraftBillInput = {
  entryMethod: NewBill['entryMethod'];
  receiptImageUri?: string;
  originalReceiptImageUri?: string;
};

// Spec section 15: leaving camera/preview before a bill is created doesn't need
// a draft, so the camera/gallery paths only call this once the user commits to
// a photo ("Use this photo"). The manual path calls it immediately on
// selection, since there is no further step before item entry (spec F-003).
export async function createDraftBill(input: CreateDraftBillInput): Promise<Bill> {
  const timestamp = nowIso();
  return billsRepository.create({
    id: createId(),
    title: copy.home.unknownMerchantTitle,
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

// Not from the spec — post-MVP quick-split addition (see PLAN.md). Creates a
// bill whose entire total is entered as one lump sum rather than scanned or
// itemized line-by-line: a single auto-generated line item carries the whole
// `totalCentavos`, so calculateSplit's existing itemized-assignment machinery
// still works unmodified once participants are added and all assigned to
// that one item.
//
// detectedReceiptTotalCentavos is left unset (null), the same as
// createDraftBill's manual-entry path: a quick-split bill was never scanned
// from a receipt, so there is nothing to reconcile against. Leaving it null
// makes reconcileBillTotals's hasDetectedTotal check skip the whole
// receipt-vs-computed comparison UI, which is correct here — e.g. adding a
// tip adjustment on top of the quick-split total should never be flagged as
// a "discrepancy" against a receipt that never existed. (Setting it equal to
// totalCentavos up front was tried and is wrong: computedTotalCentavos grows
// past it the moment any adjustment is added, triggering a false mismatch.)
//
// Mirrors saveParsedReceiptDraft's transactional style: bill row and its one
// line item are written together so a partial write never leaves the draft
// half-populated.
export function createQuickSplitBill(input: { title: string; totalCentavos: number }): Bill {
  const id = createId();
  const timestamp = nowIso();
  const title = input.title.trim() || copy.home.unknownMerchantTitle;

  return db.transaction((tx) => {
    const [bill] = tx
      .insert(bills)
      .values({
        id,
        title,
        currency: 'PHP',
        entryMethod: 'MANUAL',
        status: 'DRAFT',
        splitMode: 'EQUAL',
        discrepancyAcknowledged: false,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .returning()
      .all();

    if (!bill) throw new Error('Failed to create bill');

    tx.insert(lineItems)
      .values({
        id: createId(),
        billId: id,
        sortOrder: 0,
        name: 'Total',
        quantity: 1,
        lineTotalCentavos: input.totalCentavos,
        source: 'MANUAL',
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .run();

    return bill;
  });
}

// Persists a freshly parsed receipt onto an existing draft bill: validates the
// untrusted parser output (spec section 7), then writes the line items,
// adjustments, and bill-level detected fields in one transaction so a partial
// write never leaves the draft half-populated.
export function saveParsedReceiptDraft(billId: string, parsed: ParsedReceipt): void {
  const validated = validateParsedReceipt(parsed);
  const timestamp = nowIso();

  db.transaction((tx) => {
    if (validated.items.length > 0) {
      tx.insert(lineItems)
        .values(
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
        )
        .run();
    }

    if (validated.adjustments.length > 0) {
      tx.insert(adjustments)
        .values(
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
        )
        .run();
    }

    tx.update(bills)
      .set({
        merchantName: validated.merchantName,
        receiptDate: validated.receiptDate,
        rawOcrText: validated.rawText,
        detectedSubtotalCentavos: validated.detectedSubtotalCentavos,
        detectedReceiptTotalCentavos: validated.detectedTotalCentavos,
        parserVersion: PARSER_VERSION,
        updatedAt: timestamp,
      })
      .where(eq(bills.id, billId))
      .run();
  });
}

// Removes a participant and, in the same transaction, repairs any CUSTOM
// adjustment that stored an allocation row for them. The item_assignments and
// adjustment_allocations FK cascades (schema.ts) fire on their own once the
// participant row is deleted, but for a CUSTOM adjustment that cascade would
// silently remove only the departing participant's allocation row — leaving
// the remaining rows summing to less than the adjustment's own
// amountCentavos, which permanently violates the spec 10.7 invariant that
// calculateSplit's assertSplitInvariant enforces (spec 13.11's
// removal-confirmation copy already warns "Their item assignments and custom
// adjustment amounts will also be removed" — this is what keeps that promise
// true instead of leaving the draft in an unrecoverable state).
//
// For every CUSTOM adjustment that referenced the removed participant, this
// resets the adjustment to PROPORTIONAL (recomputed fresh from whoever is
// left, always valid — same safe fallback used elsewhere for non-CUSTOM
// methods) and deletes ALL of that adjustment's allocation rows, not just the
// removed participant's: adjustmentAllocationsRepository's own invariant is
// that a non-CUSTOM adjustment has zero allocation rows, and the remaining
// participants' entered amounts were computed assuming the removed
// participant was still part of the split, so they're stale too and the user
// has to re-enter the custom split from scratch regardless.
export function removeParticipant(billId: string, participantId: string): void {
  const timestamp = nowIso();

  db.transaction((tx) => {
    const billAdjustments: Adjustment[] = tx
      .select()
      .from(adjustments)
      .where(eq(adjustments.billId, billId))
      .all();

    for (const adjustment of billAdjustments) {
      if (adjustment.allocationMethod !== 'CUSTOM') continue;

      const ownAllocation: AdjustmentAllocation | undefined = tx
        .select()
        .from(adjustmentAllocations)
        .where(
          and(
            eq(adjustmentAllocations.adjustmentId, adjustment.id),
            eq(adjustmentAllocations.participantId, participantId),
          ),
        )
        .get();

      if (!ownAllocation) continue;

      tx.delete(adjustmentAllocations)
        .where(eq(adjustmentAllocations.adjustmentId, adjustment.id))
        .run();

      tx.update(adjustments)
        .set({ allocationMethod: 'PROPORTIONAL', updatedAt: timestamp })
        .where(eq(adjustments.id, adjustment.id))
        .run();
    }

    // Cascades away item_assignments (and adjustment_allocations for any
    // adjustment not touched above — none should exist there, since a
    // non-CUSTOM adjustment never had rows to begin with).
    tx.delete(participants).where(eq(participants.id, participantId)).run();
  });
}

// Permanently deletes a single bill (spec F-019): its app-owned receipt image
// file(s), then its database rows.
//
// Ordering: image file(s) first, DB row second — and the DB row is removed
// unconditionally, even if a file delete above it failed or the file was
// already missing. Deleting is supposed to be permanent and unconditional
// ("confirm permanent deletion ... return to home"); a bill that refuses to
// leave history because of an unrelated filesystem hiccup would be a worse
// outcome than a rare orphaned image. Doing the file deletes *before* the DB
// delete (rather than after) also shrinks the one truly unrecoverable
// failure mode: if the app is killed mid-function, "row still present, file
// still on disk" can simply be retried by deleting the bill again, whereas
// "row already gone, file still on disk" can never be found or cleaned up
// again by anything (nothing references that path once the row is gone).
export function deleteBill(bill: Bill): void {
  const imageUris = new Set(
    [bill.receiptImageUri, bill.originalReceiptImageUri].filter(
      (uri): uri is string => uri != null,
    ),
  );

  for (const uri of imageUris) {
    try {
      const file = new File(uri);
      if (file.exists) file.delete();
    } catch {
      // Already gone, or an OS-level error removing it — never block
      // deleting the bill itself over a receipt image that can't be
      // cleaned up.
    }
  }

  // Not billsRepository.remove(bill.id): that method's async signature is
  // only a Promise wrapper for API consistency — expo-sqlite itself is fully
  // synchronous (db/client.ts uses openDatabaseSync), but the awaited
  // top-level query builder only actually runs on a later microtask. This
  // function's synchronous void signature (matching removeParticipant and
  // saveParsedReceiptDraft above) needs the row to actually be gone by the
  // time it returns, so it deletes it the same way those do: a direct,
  // synchronous .run() call. The FK cascade (line_items, participants,
  // item_assignments, adjustments, adjustment_allocations) fires
  // automatically as part of this one statement via the foreign_keys pragma
  // (db/client.ts), so no db.transaction() wrapper is needed for what is,
  // from SQLite's perspective, a single atomic statement.
  db.delete(bills).where(eq(bills.id, bill.id)).run();
}

// Wipes every local bill (and, via the FK cascade, every line_item,
// participant, item_assignment, adjustment, and adjustment_allocation row —
// spec section 9.7) plus any app_settings rows, then deletes the entire
// receipts/ directory in one shot. Spec F-020 "Delete all local data".
//
// The two steps are deliberately not combined into one atomic operation:
// db.transaction() only covers the SQLite rows, and there's no way to make a
// filesystem directory delete participate in a SQL transaction's rollback.
// If the process were killed between the two steps, the DB rows are already
// gone (transaction committed), and the receipts/ directory (now fully
// orphaned, since no bill row references any file under it any more) simply
// gets removed the next time this same function runs — deleteReceiptsDirectory
// is guarded for "doesn't exist" already, so there is nothing to reconcile.
export function resetAllLocalData(): void {
  db.transaction((tx) => {
    // Cascades line_items, participants, item_assignments, adjustments, and
    // adjustment_allocations for every bill via the foreign_keys pragma.
    tx.delete(bills).run();
    tx.delete(appSettings).run();
  });

  deleteReceiptsDirectory();
}
