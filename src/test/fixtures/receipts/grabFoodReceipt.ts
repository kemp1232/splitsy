// IMPORTANT PROVENANCE NOTE: this is a *reconstructed/representative*
// fixture, not a byte-exact real-receipt transcription per spec section
// 20.4's usual precedent (contrast with lianLomiHouseReceipt.ts/
// ramenHouseReceipt.ts, which are byte-for-byte real transcriptions). Two real
// GrabFood delivery receipt photos were manually transcribed and diagnosed
// against the parser during this session, but the source images are no
// longer available. The text below reproduces the exact *structural* bugs
// those photos exposed — it is not claimed to match the original receipts
// character-for-character. Already free of any customer-identifying data by
// construction (no real order/customer/merchant details).
//
// The three structural bugs this fixture exercises:
//
//   1. A leading quantity digit glued directly onto an item CODE that itself
//      starts with a digit ("3 2PC BGRSTKSPR", "1 1PC CKNJOY") — the original
//      leading-quantity pattern only recognized a letter-starting remainder,
//      so the quantity digit stayed stuck in the item name and quantity
//      silently defaulted to 1.
//   2. Two marker suffixes glued onto item lines with no separating
//      whitespace: a VAT-inclusive marker letter ("606.00V") and a bare
//      "@<digits>" unit-price marker with no decimal point ("@202") that
//      detectAmounts never touches at all. Both used to survive into the
//      final item name.
//   3. GrabFood's VAT-breakdown recap block spells its lines "VATable
//      Sales"/"VAT-Exempt Sales"/"Zero-Rated Sales" — plural "Sales", and
//      with no parenthesized category code the way the Lian's Lomi House
//      fixture's lines have. Before generalizing the VAT-breakdown
//      recognizer, "VAT-Exempt Sales 0.00" fell through as an unrecognized
//      line and matched the generic "VAT"/"TAX" positive-adjustment keyword
//      instead of being ignored as non-additive information.
export const grabFoodReceiptText = `GRABFOOD
Merchant: SAMPLE EATS
Order No: 000000000
3 2PC BGRSTKSPR @202 606.00V
1 1PC CKNJOY 100.00V
Subtotal 706.00
VATable Sales 630.36
VAT-Exempt Sales 0.00
Zero-Rated Sales 0.00
VAT Amount 75.64
TOTAL 706.00
GCASH 706.00`;
