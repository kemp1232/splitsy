import { sql } from 'drizzle-orm';
import { index, integer, primaryKey, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

// Seven tables from spec section 9.7. Money columns are always integer centavos —
// never real/float. Cascade deletes are declared here AND require
// `PRAGMA foreign_keys = ON` at the connection level (see db/client.ts) to
// actually be enforced by SQLite.

export const bills = sqliteTable('bills', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  merchantName: text('merchant_name'),
  receiptDate: text('receipt_date'), // YYYY-MM-DD
  currency: text('currency').notNull().default('PHP'),
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
});

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
