// Synthetic coverage for the reconciliation backstop (parseReceipt.ts's
// reconcileItemsAgainstTotal) independent of the VATABLE-SALE keyword fix: an
// unrecognized garbled line ("XYZ GARBLED LINE 15.00") matches no keyword, so
// classifyReceiptLines falls through and treats it as a plain item candidate.
// Item subtotal (80.00 + 60.00 + 15.00 = 155.00) overshoots the detected
// total (140.00) by exactly the garbled line's amount — removing exactly
// that one line reconciles the total exactly, so it should be excluded from
// items and tracked in diagnostics instead of left as a silent mismatch.
export const reconciliationJunkLineLines = [
  'SAMPLE CAFE',
  'COFFEE                80.00',
  'PASTRY                 60.00',
  'XYZ GARBLED LINE       15.00',
  'TOTAL                 140.00',
];
