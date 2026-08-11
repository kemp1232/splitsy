// Real-device/VLM regression: a ramen restaurant receipt (transcribed via
// qwen3-vl) that prints each item's fields on separate physical lines rather
// than one row per item —
//   AJI TAMAGO
//   2@
//   85.00v
//   170.00
// (name, then a bare "N@" quantity marker, then the VAT-inclusive-marked unit
// price, then the actual line total) — and the same shape recurs for the
// receipt's label-only total/subtotal/adjustment lines, which print their
// amount on the very next line ("Total Due" / "1,655.71"). The VLM transcribes
// this exactly as printed, in correct top-to-bottom order; the bug is entirely
// downstream, in a parser that assumed every line already carried its own
// amount.
//
// This receipt also has a second, later "compliance recap" block (a BIR VAT
// breakdown) that restates the main bill's Service Charge a second time —
// once these label+amount lines are correctly reunited, that second
// occurrence must not be double-counted as a second real adjustment.
//
// Anonymized per spec section 20.4 before committing: the cashier's name,
// table number, and bill slip number have been replaced with synthetic
// placeholders (matching lianLomiHouseReceipt.ts's existing precedent). Item
// names, quantities, prices, the exact split-field/multi-line structure, and
// every other figure are preserved byte-for-byte from the real transcription.
export const ramenHouseReceiptText = `Table No : T0
Bill Slip No : 00000
Head Count : 2
Cashier : SAMPLE CASHIER
Transaction Type : DINE-IN
<R>
AJI TAMAGO
2@
85.00v
170.00
GYOZA
1@
270.00v
270.00
MISO CHASHU RAMEN
1@
530.00v
530.00
TONKOTSU RAMEN
1@
550.00v
550.00
Total Amount
1,520.00
Net Sale
1,357.14
Service Charge
135.71
Total Due
1,655.71
MASTERCARD
1,655.71
Change
0.00
VATABLE
1,357.14
VAT EXEMPT
0.00
ZERO RATED Sales
0.00
VAT Amount
162.86
Service Charge
135.71
Total Amt Due
1,655.71
Total No. of ITEMS : 5
Name:
Address:`;
