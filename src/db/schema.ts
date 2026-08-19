import { sql } from 'drizzle-orm';
import { index, integer, primaryKey, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

// Seven tables from spec section 9.7, plus `trips` and `tripParticipants`
// (Trip feature addition, not from the spec). Money columns are always
// integer centavos — never real/float. Cascade deletes are declared here AND
// require `PRAGMA foreign_keys = ON` at the connection level (see
// db/client.ts) to actually be enforced by SQLite.

// Not from spec section 9 — Trip feature addition. A trip groups several
// bills that share one default participant roster (tripParticipants below).
// Defined ahead of `bills` and `participants` so those tables' `tripId` /
// `tripParticipantId` FK columns can reference these without a forward
// reference.
export const trips = sqliteTable('trips', {
  id: text('id').primaryKey(),
  // Nullable, mirroring bills.title's own nullable-with-fallback pattern
  // (a display fallback name is applied at the service/UI layer, not here).
  name: text('name'),
  status: text('status').notNull().default('ACTIVE').$type<'ACTIVE' | 'SETTLED'>(),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(current_timestamp)`),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`(current_timestamp)`),
});

// Not from spec section 9 — Trip feature addition. The trip's roster
// *template*: deliberately a separate table from the existing bill-scoped
// `participants` table (never a modification of it), since a trip's roster
// outlives and is edited independently of any one bill's copy of it.
//
// Soft-delete only: removing someone from a trip must set `isActive = false`
// (tripParticipants.repository.ts's `deactivate`), never DELETE the row, so
// re-adding the same person later reuses the same stable `id` instead of
// minting a new one — a settlement-aggregation module built after this one
// keys combined-trip aggregation by this table's id.
export const tripParticipants = sqliteTable(
  'trip_participants',
  {
    id: text('id').primaryKey(),
    tripId: text('trip_id')
      .notNull()
      .references(() => trips.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    sortOrder: integer('sort_order').notNull(),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(current_timestamp)`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [index('trip_participants_trip_id_idx').on(table.tripId)],
);

export const bills = sqliteTable(
  'bills',
  {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    merchantName: text('merchant_name'),
    receiptDate: text('receipt_date'), // YYYY-MM-DD
    currency: text('currency').notNull().default('PHP'),
    // Not from spec section 9 — Trip feature addition. Nullable: most bills
    // are never part of a trip. `onDelete: 'cascade'` here is a defensive
    // DB-level backstop only — the normal deletion path is trip.service.ts's
    // deleteTrip, which calls bill.service.ts's existing deleteBill for every
    // bill first (so receipt image files get cleaned up) before removing the
    // trip row; this raw FK cascade only fires if that orchestrated path was
    // somehow bypassed, and would silently skip file cleanup if it did.
    tripId: text('trip_id').references(() => trips.id, { onDelete: 'cascade' }),
    entryMethod: text('entry_method').notNull().$type<'CAMERA' | 'GALLERY' | 'MANUAL'>(),
    status: text('status').notNull().default('DRAFT').$type<'DRAFT' | 'COMPLETED'>(),
    // Not from the spec — post-MVP quick-split addition (see bill.service.ts's
    // createQuickSplitBill). 'EQUAL' marks a bill created via the quick-split
    // path: the whole bill is one lump sum split evenly across everyone, never
    // itemized. 'ITEMIZED' (the default) is every existing/normal bill,
    // unchanged behavior.
    splitMode: text('split_mode').notNull().default('ITEMIZED').$type<'ITEMIZED' | 'EQUAL'>(),
    receiptImageUri: text('receipt_image_uri'),
    originalReceiptImageUri: text('original_receipt_image_uri'),
    rawOcrText: text('raw_ocr_text'),
    detectedReceiptTotalCentavos: integer('detected_receipt_total_centavos'),
    detectedSubtotalCentavos: integer('detected_subtotal_centavos'),
    parserVersion: integer('parser_version'),
    discrepancyAcknowledged: integer('discrepancy_acknowledged', { mode: 'boolean' })
      .notNull()
      .default(false),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(current_timestamp)`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`(current_timestamp)`),
    completedAt: text('completed_at'),
  },
  (table) => [index('bills_trip_id_idx').on(table.tripId)],
);

export const lineItems = sqliteTable(
  'line_items',
  {
    id: text('id').primaryKey(),
    billId: text('bill_id')
      .notNull()
      .references(() => bills.id, { onDelete: 'cascade' }),
    sortOrder: integer('sort_order').notNull(),
    name: text('name').notNull(),
    quantity: integer('quantity').notNull().default(1),
    unitPriceCentavos: integer('unit_price_centavos'),
    lineTotalCentavos: integer('line_total_centavos').notNull(),
    source: text('source').notNull().$type<'OCR' | 'MANUAL'>(),
    confidence: real('confidence'),
    rawText: text('raw_text'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(current_timestamp)`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [index('line_items_bill_id_idx').on(table.billId)],
);

export const participants = sqliteTable(
  'participants',
  {
    id: text('id').primaryKey(),
    billId: text('bill_id')
      .notNull()
      .references(() => bills.id, { onDelete: 'cascade' }),
    sortOrder: integer('sort_order').notNull(),
    name: text('name').notNull(),
    // Not from the spec — post-MVP payments/contributions addition. How much
    // this participant has actually paid/contributed toward the bill so far;
    // separate from their computed fair share (calculateSplit's
    // finalTotalCentavos).
    contributedCentavos: integer('contributed_centavos').notNull().default(0),
    // Not from the spec — Trip feature addition. Set when this participant
    // row was copied from a trip's roster (trip.service.ts's
    // createBillInTrip); null for every bill created outside a trip.
    // `onDelete: 'set null'` (not cascade): once copied onto a bill, this row
    // is this bill's own data and must survive independently of later trip
    // roster edits (renames, deactivations, or the trip itself being edited)
    // — only trip.service.ts's deleteTrip (which deletes the bill itself via
    // bill.service.ts's deleteBill) removes this participant.
    tripParticipantId: text('trip_participant_id').references(() => tripParticipants.id, {
      onDelete: 'set null',
    }),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(current_timestamp)`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [index('participants_bill_id_idx').on(table.billId)],
);

export const itemAssignments = sqliteTable(
  'item_assignments',
  {
    lineItemId: text('line_item_id')
      .notNull()
      .references(() => lineItems.id, { onDelete: 'cascade' }),
    participantId: text('participant_id')
      .notNull()
      .references(() => participants.id, { onDelete: 'cascade' }),
    // Fixed to 1 in the MVP (spec section 9.4) — kept as a column so weighted
    // splits can be added later without a schema migration to add the concept.
    weight: integer('weight').notNull().default(1),
  },
  (table) => [
    primaryKey({ columns: [table.lineItemId, table.participantId] }),
    index('item_assignments_participant_id_idx').on(table.participantId),
  ],
);

export const adjustments = sqliteTable(
  'adjustments',
  {
    id: text('id').primaryKey(),
    billId: text('bill_id')
      .notNull()
      .references(() => bills.id, { onDelete: 'cascade' }),
    sortOrder: integer('sort_order').notNull(),
    type: text('type').notNull().$type<'TAX' | 'SERVICE_CHARGE' | 'TIP' | 'DISCOUNT' | 'OTHER'>(),
    label: text('label').notNull(),
    amountCentavos: integer('amount_centavos').notNull(),
    allocationMethod: text('allocation_method')
      .notNull()
      .$type<'PROPORTIONAL' | 'EQUAL' | 'CUSTOM'>(),
    source: text('source').notNull().$type<'OCR' | 'MANUAL' | 'RECONCILIATION'>(),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(current_timestamp)`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [index('adjustments_bill_id_idx').on(table.billId)],
);

export const adjustmentAllocations = sqliteTable(
  'adjustment_allocations',
  {
    adjustmentId: text('adjustment_id')
      .notNull()
      .references(() => adjustments.id, { onDelete: 'cascade' }),
    participantId: text('participant_id')
      .notNull()
      .references(() => participants.id, { onDelete: 'cascade' }),
    amountCentavos: integer('amount_centavos').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.adjustmentId, table.participantId] }),
    index('adjustment_allocations_participant_id_idx').on(table.participantId),
  ],
);

export const appSettings = sqliteTable('app_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});
