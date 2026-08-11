import { z } from 'zod';

// Validates parser output before anything derived from it is saved (spec
// section 7: "Treat scanned data as untrusted input and validate it before
// storage"). OCR text is inherently untrusted, however careful the parsing
// heuristics are.
export const parsedLineItemSchema = z.object({
  name: z.string().min(1),
  quantity: z.number().int().min(1).max(99),
  lineTotalCentavos: z.number().int().min(0),
  source: z.literal('OCR'),
  confidence: z.number().min(0).max(1).nullable(),
  rawText: z.string(),
});

export const parsedAdjustmentSchema = z.object({
  type: z.enum(['TAX', 'SERVICE_CHARGE', 'TIP', 'DISCOUNT', 'OTHER']),
  label: z.string().min(1),
  amountCentavos: z.number().int(),
  allocationMethod: z.enum(['PROPORTIONAL', 'EQUAL', 'CUSTOM']),
  source: z.literal('OCR'),
  rawText: z.string(),
});

export const parsedReceiptSchema = z.object({
  merchantName: z.string().nullable(),
  receiptDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  items: z.array(parsedLineItemSchema),
  adjustments: z.array(parsedAdjustmentSchema),
  detectedSubtotalCentavos: z.number().int().nullable(),
  detectedTotalCentavos: z.number().int().nullable(),
  rawText: z.string(),
  warnings: z.array(z.object({ code: z.string(), message: z.string() })),
  diagnostics: z.object({
    normalizedLineCount: z.number().int().min(0),
    totalCandidates: z.array(
      z.object({ raw: z.string(), centavos: z.number().int(), index: z.number().int() }),
    ),
    excludedPaymentLines: z.array(z.string()),
    excludedReconciliationLines: z.array(z.string()),
    lowConfidenceLineCount: z.number().int().min(0),
  }),
});

export function validateParsedReceipt(receipt: unknown) {
  return parsedReceiptSchema.parse(receipt);
}
