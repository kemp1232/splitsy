// Real-device/VLM regression: a physical Philippine BIR-format thermal
// receipt (Lian's Lomi House) that the Qwen3-VL backend transcribed with a
// one-character misread — "(V)Vatable Sale 388.39" came back as
// "(V)Valable Sale 388.39" (t misread as l) — which caused the parser to add
// a bogus 4th line item instead of recognizing the VAT-breakdown line.
//
// Anonymized per spec section 20.4 before committing: the customer/cashier
// names, TINs, serial/MIN/transaction numbers, accreditation numbers, and the
// buyer's registered business name and address from the original transcript
// have all been replaced with synthetic placeholders. The merchant name,
// item lines, quantities, prices, the exact VAT-breakdown lines (including
// the "Valable" typo and the "BEFF LOMI" item-name misread), and the
// AMOUNT DUE/payment lines are preserved byte-for-byte from the real
// transcription, since those are exactly what this regression needs to cover.
export const lianLomiHouseReceiptText = `Thank you. Come again.
This serves as your SALES INVOICE.
LIAN'S LOMI HOUSE
ORD BY: SAMPLE CASHIER
SAMPLE ST. SAMPLE BARANGAY LIPA CITY BATANGAS
MIN:00000000000000000
VAT/TIN:000-000-000-000
SN:000000000000000A
SALES TRANSACTION
S.No.: 1
DINE IN
CHICKEN CHAMI ORD 1.00 145.00 V
BEFF LOMI ORD 1.00 145.00 V
LECHON CHAMI ORD 1.00 145.00 V
(V)Valable Sale 388.39
Vat Amount 46.61
(E)VAT-Exempt Sale 0.00
AMOUNT DUE 435.00
CREDIT CARD 435.00
AMOUNT TENDER 435.00
CHANGE 0.00
Number of Items : 3.00
Terminal No. : 000 S. I. No. : 00000000
Transaction No. : 00000000
Cashier Code : 0000 - SAMPLE
Date : 01/01/2026 Time : 12:00:00
Buyer's Information
Name:
Address:
TIN:
BUSINESS STYLE:
SAMPLE BUYER CORP
Sample Building, Sample Avenue
Quezon City
ACCRD'T'N NO.:000-000000000-000000
TIN: 000-000-000-000
DATE OF ISSUANCE: 01/01/2020
EFFECTIVITY DATE: 01/01/2020
VALID UNTIL: 12/31/2025
PTU: FPD00000-000-0000000-00000`;
