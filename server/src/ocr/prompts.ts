// This backend now asks the model to understand the receipt, not just
// transcribe it (see PLAN.md's "Groq performs full receipt extraction" entry
// — a further, explicit amendment beyond the original transcription-only VLM
// backend). It classifies items vs. totals vs. adjustments itself and
// returns them as structured JSON, replacing the deterministic
// classifier/parser (`src/features/receipt-parser/`) for this path entirely
// — that module is still used, unchanged, for the on-device ML Kit fallback,
// which has no reasoning ability of its own.
//
// Every field name/shape below is deliberately the lean wire contract
// `server/src/ocr/receiptExtraction.schema.ts` validates against, which the
// client then maps onto the app's existing `ParsedReceipt` shape.
export const RECEIPT_EXTRACTION_PROMPT = `Extract structured data from this receipt image. Output ONLY a single JSON object (no markdown fences, no commentary), matching exactly this shape:
{
  "merchantName": string | null,
  "receiptDate": string | null,   // YYYY-MM-DD
  "items": [ { "name": string, "quantity": integer >= 1, "lineTotalCentavos": integer >= 0 } ],
  "adjustments": [ { "type": "TAX" | "SERVICE_CHARGE" | "TIP" | "DISCOUNT" | "OTHER", "label": string, "amountCentavos": integer } ],
  "detectedSubtotalCentavos": integer | null,
  "detectedTotalCentavos": integer | null,
  "rawText": string   // best-effort full transcription of the receipt, one line per line
}
Rules:
- All money fields are integer centavos (e.g. 144.00 pesos = 14400), never decimals or currency symbols.
- "items" = every real ordered/served line item on the receipt, each with a name and a price. Include an item even if it is printed at 0.00 (e.g. a complimentary/free side dish, "Free Banchan") — 0 is a valid lineTotalCentavos, and a real menu item that happened to cost nothing this time is still an item, not something to omit. Do not include subtotal/tax/total/payment/change lines as items.
- "adjustments" = charges genuinely ADDED ON TOP OF the item subtotal to reach the amount actually due (tax/VAT, service charge, tip, discount). Use a negative amountCentavos for discounts/deductions.
- A charge is an adjustment only if adding it to the item subtotal gets you closer to the total actually due. It is NOT an adjustment if it is merely a breakdown/restatement of an amount already fully included elsewhere — including it as an adjustment as well would double-count it. This is a common, specific pattern on Philippine BIR-format receipts: a block near the bottom listing lines like "VATABLE", "VAT EXEMPT", "ZERO RATED Sales", "VAT Amount", and "Net Sale" is restating how the ALREADY-CHARGED item total breaks down into its VAT-exclusive base and VAT component — none of these are adjustments, even though "VAT Amount" looks like a tax. A concrete tell: if item unit prices are printed with a trailing "v" or "VAT-inc"-style marker (e.g. "85.00v"), those item prices are already VAT-inclusive, so a separate "VAT Amount" line is just showing you the VAT already baked into the items you extracted — do not add it again. Likewise, if a charge (e.g. "Service Charge") is printed more than once (once in the main total block, again inside this recap block), include it exactly once, not twice.
- If a value cannot be determined, use null (for merchantName/receiptDate/detectedSubtotalCentavos/detectedTotalCentavos) — items/adjustments may be empty arrays.
- detectedTotalCentavos is the final amount actually due, before any cash tendered/change lines.
- If handwritten text is unclear, give your best-guess reading rather than skipping it or leaving a gap.
- Before answering, verify: detectedTotalCentavos MUST equal the sum of every item's lineTotalCentavos plus the sum of every adjustment's amountCentavos, unless you are certain the receipt has an additional real charge you could not capture as an adjustment. If it does not add up: first check whether you mistakenly included a non-additive breakdown line (see above) as an adjustment, or double-counted a charge printed twice, and remove it. If it still does not add up after that, this means either an item/adjustment amount or the printed total itself was misread — thermal receipt digits, especially on a blurry or low-resolution photo, are frequently confused (3/5, 6/8, 3/8 in particular). In that situation, trust the sum of your own items+adjustments over a single standalone total/subtotal line: each item amount can be individually checked against its own printed line, while the total is one isolated figure with nothing else to cross-check it against. Set detectedTotalCentavos (and detectedSubtotalCentavos, if present) to match your items+adjustments arithmetic rather than a reading of the total line that disagrees with it, unless you can specifically identify a real charge on the receipt that your items+adjustments don't yet account for.`;
