import { z } from 'zod';

// Validates Groq's structured response before it ever leaves this server —
// `response_format: json_object` (groqClient.ts) only guarantees syntactically
// valid JSON, not that it matches this shape. This is the lean wire contract;
// the client maps it onto the app's full `ParsedReceipt` shape (filling in
// per-item confidence/source, allocation-method defaults, warnings, etc.) and
// validates *that* separately before it's ever persisted — this schema is a
// server-side sanity gate, not a substitute for the client's own validation.
export const receiptExtractionItemSchema = z.object({
  name: z.string().min(1),
  quantity: z.number().int().min(1).max(99),
  lineTotalCentavos: z.number().int().min(0),
});

export const receiptExtractionAdjustmentSchema = z.object({
  type: z.enum(['TAX', 'SERVICE_CHARGE', 'TIP', 'DISCOUNT', 'OTHER']),
  label: z.string().min(1),
  amountCentavos: z.number().int(),
});

export const receiptExtractionSchema = z.object({
  merchantName: z.string().nullable(),
  receiptDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  items: z.array(receiptExtractionItemSchema),
  adjustments: z.array(receiptExtractionAdjustmentSchema),
  detectedSubtotalCentavos: z.number().int().nullable(),
  detectedTotalCentavos: z.number().int().nullable(),
  rawText: z.string(),
});

export type ReceiptExtraction = z.infer<typeof receiptExtractionSchema>;

export function validateReceiptExtraction(data: unknown): ReceiptExtraction {
  return receiptExtractionSchema.parse(data);
}
