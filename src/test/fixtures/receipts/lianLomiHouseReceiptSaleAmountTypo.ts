// Real-device/VLM regression, one level more severe than the "Valable" typo
// covered by `lianLomiHouseReceipt.ts`: the same merchant (Lian's Lomi House),
// a different scan, with two compounding misreads in the same VAT-breakdown
// block:
//
//   1. "(U)Vatable Sale 388.39" came back as "(U)Vatable 5ale 388.39" — the
//      "S" in "Sale" itself was read as the digit "5" (a classic
//      shape-similar OCR/VLM character confusion), not just the descriptive
//      word before it as in the earlier fixture.
//   2. "Vat Amount 46.61" came back as "Vat Anburnt 46.61" — the whole
//      second word changed shape, not a single-character swap.
//
// The real transcription of this scan came back with its columns scrambled
// (names, quantities, and amounts each grouped into their own separate runs
// of lines, rather than row-merged) — on a real device, `mergeIntoRows`'
// geometry-based row reconstruction would reunite these into the rows below,
// but that geometry can't be carried by a flattened, frameless text fixture.
// Reproducing the scrambled form here would only exercise that unrelated,
// unfixable-at-this-layer problem instead of the two keyword-classification
// bugs this fixture exists to cover, so this fixture models the *row-merged*
// text directly — i.e. what a correct row reconstruction (real on-device
// geometry, or a VLM transcription that preserves reading order per row)
// would have produced from this same scan.
//
// Already free of any customer-identifying data in this row-merged form (no
// names, TINs, addresses, or transaction numbers survive it), so nothing
// further needed anonymizing per spec section 20.4.
export const lianLomiHouseReceiptSaleAmountTypoText = `LIAN'S LOMI HOUSE
CHICKEN CHAMI ORD 1.00 145.00 V
BEFF LOMI ORD 1.00 145.00 V
LECHON CHAMI ORD 1.00 145.00 V
(U)Vatable 5ale 388.39
Vat Anburnt 46.61
(E)VAT-Exempt Sale 0.00
AMOUNT DUE 435.00
CREDIT CARD 435.00
CHANGE 0.00`;
