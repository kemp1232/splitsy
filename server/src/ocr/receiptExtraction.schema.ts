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

// detectedSubtotalCentavos/detectedTotalCentavos/rawText are listed last in
// the shape the prompt asks for (prompts.ts), and are exactly the fields
// Groq's own max_tokens cap (see groqClient.ts's DEFAULT_MAX_OUTPUT_TOKENS —
// capped well under the account's enforced OTPM limit) can cut the response
// off before the model ever gets to emit, on a receipt with enough line
// items that the items array alone eats most of the budget — confirmed via
// a direct Groq call that returned `finish_reason: "length"` with these
// exact three keys absent (not present-and-null, genuinely missing) for one
// such receipt. Groq's own forced JSON mode still closes out a cut-off
// response as syntactically valid JSON (just missing whatever trailing keys
// didn't get generated in time), so this isn't a parse failure — only a
// stricter-than-necessary schema failure. `.optional()` on top of each
// field's existing `.nullable()` treats "the model ran out of room before
// writing this" the same as the model's own documented "use null when a
// value can't be determined" convention (prompts.ts) — both mean the same
// thing to every caller, and this schema already fully supports a null
// total/subtotal (see groqExtractionToParsedReceipt's NO_TOTAL_DETECTED
// warning client-side). items/adjustments that already generated before the
// cutoff are preserved either way.
const rawReceiptExtractionSchema = z.object({
  merchantName: z.string().nullable(),
  receiptDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  items: z.array(receiptExtractionItemSchema),
  adjustments: z.array(receiptExtractionAdjustmentSchema),
  detectedSubtotalCentavos: z.number().int().nullable().optional(),
  detectedTotalCentavos: z.number().int().nullable().optional(),
  rawText: z.string().optional(),
});

// The real, always-fully-populated shape every other caller (the ocr route,
// the client's own mirrored schema, tests) depends on — optionality above is
// purely a validation-time tolerance, normalized away immediately below so
// nothing downstream needs to know a field was ever allowed to be absent.
export type ReceiptExtraction = {
  merchantName: string | null;
  receiptDate: string | null;
  items: z.infer<typeof receiptExtractionItemSchema>[];
  adjustments: z.infer<typeof receiptExtractionAdjustmentSchema>[];
  detectedSubtotalCentavos: number | null;
  detectedTotalCentavos: number | null;
  rawText: string;
};

export function validateReceiptExtraction(data: unknown): ReceiptExtraction {
  const parsed = rawReceiptExtractionSchema.parse(data);
  return {
    ...parsed,
    detectedSubtotalCentavos: parsed.detectedSubtotalCentavos ?? null,
    detectedTotalCentavos: parsed.detectedTotalCentavos ?? null,
    rawText: parsed.rawText ?? '',
  };
}
