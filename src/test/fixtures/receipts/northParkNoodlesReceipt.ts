// IMPORTANT PROVENANCE NOTE: this is a *reconstructed/representative*
// fixture, not a byte-exact real-receipt transcription per spec section
// 20.4's usual precedent (contrast with lianLomiHouseReceipt.ts/
// ramenHouseReceipt.ts, which are byte-for-byte real transcriptions). A real
// North Park Noodles dine-in receipt photo was manually transcribed and
// diagnosed against the parser during this session, but the source image is
// no longer available. The text below reproduces the exact *structural*
// bugs that photo exposed — it is not claimed to match the original receipt
// character-for-character. Already free of any customer-identifying data by
// construction (no real order/customer/table/transaction details).
//
// The three structural bugs this fixture exercises:
//
//   1. VAT-breakdown recap lines spelled without a parenthesized category
//      code and with plural "Sales" ("VATable Sales", "VAT-EXEMPT SALES",
//      "Zero-Rated Sales") — same family of bug as grabFoodReceipt.ts, plus
//      two more label variants of the same already-included-in-the-total
//      breakdown block: "VAT Tax" and "Total Tax". Before the fix,
//      "VAT-EXEMPT SALES" was added as a positive TAX adjustment, and "Total
//      Tax" was swept into the generic "TOTAL" strong-total keyword (it
//      contains the bare word "Total"), producing a phantom second total
//      candidate.
//   2. "Sales SC: (G2/S2) -757.00" (reconstructed here at a smaller,
//      bill-consistent magnitude) — a senior-citizen-discount-style line that
//      matches the "SC" positive-adjustment keyword (normally Service
//      Charge) but prints an explicit "-" sign. The old sign logic forced
//      every POSITIVE_ADJUSTMENT-classified amount positive regardless of
//      what was actually printed, silently flipping a real discount into a
//      charge.
//   3. "DR10 HONEY LEMONADE (2 @ 176.00" — a parenthesized quantity marker
//      ("(2 @") between the item name and its amount, a shape the existing
//      mid-line quantity marker pattern (bare "2@"/"2x", no parenthesis)
//      didn't recognize at all.
export const northParkNoodlesReceiptText = `NORTH PARK NOODLES
Sample Street, Quezon City
TIN: 000-000-000-000
Table No : T5
DR10 HONEY LEMONADE (2 @ 176.00
BF5 BEEF MAMI 220.00
PK3 PORK SISIG 245.00
SUBTOTAL 641.00
Service Charge 10% 64.10
Sales SC: (G2/S2) -57.00
VATable Sales 553.57
VAT-EXEMPT SALES 675.89
Zero-Rated Sales 0.00
VAT Tax 53.14
Total Tax 53.14
TOTAL 648.10
CASH 700.00
CHANGE 51.90`;
