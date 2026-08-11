import type { Rect } from '@/features/receipt-ocr/ocr.types';

// Flattened, position-sorted OCR line (spec section 11.4). Produced by
// normalizeOcr.ts from the raw OcrDocument's blocks/lines.
export type NormalizedLine = {
  text: string;
  frame?: Rect;
  confidence?: number;
  rotationDegrees?: number;
};

export type LineKind =
  | 'TOTAL'
  | 'SUBTOTAL'
  | 'POSITIVE_ADJUSTMENT'
  | 'NEGATIVE_ADJUSTMENT'
  | 'PAYMENT'
  // A known non-item informational line (e.g. a BIR receipt's "VATable
  // Sale"/"VAT-Exempt Sale" breakdown) — never an item candidate, and its
  // amount never contributes to any total (it's already implied by the
  // subtotal/total, not an amount owed on top of them).
  | 'INFO'
  | 'ITEM_CANDIDATE'
  | 'OTHER';

export type ClassifiedLine = NormalizedLine & {
  kind: LineKind;
};

export type DetectedAmount = {
  raw: string;
  centavos: number;
  index: number;
};

export type ParsedLineItem = {
  name: string;
  quantity: number;
  lineTotalCentavos: number;
  source: 'OCR';
  confidence: number | null;
  rawText: string;
};

export type AdjustmentType = 'TAX' | 'SERVICE_CHARGE' | 'TIP' | 'DISCOUNT' | 'OTHER';
export type AllocationMethod = 'PROPORTIONAL' | 'EQUAL' | 'CUSTOM';

export type ParsedAdjustment = {
  type: AdjustmentType;
  label: string;
  amountCentavos: number;
  allocationMethod: AllocationMethod;
  source: 'OCR';
  rawText: string;
};

export type ParserWarningCode =
  | 'NO_ITEMS_DETECTED'
  | 'NO_TOTAL_DETECTED'
  | 'MULTIPLE_TOTALS_FOUND'
  | 'SUBTOTAL_MISMATCH'
  | 'TOTAL_MISMATCH'
  | 'LOW_CONFIDENCE_LINES_USED'
  | 'PAYMENT_LINE_EXCLUDED'
  // Reconciliation backstop (parseReceipt.ts's reconcileItemsAgainstTotal): an
  // item-candidate line that no keyword rule recognized was removed from the
  // items array because doing so was the single change that brought the
  // computed total back in line with the detected receipt total. Distinct
  // from TOTAL_MISMATCH, which fires when totals disagree and nothing fixed
  // it — this fires when something *was* silently adjusted, so the user still
  // sees it happened even though it's now hidden from the items list.
  | 'ITEM_EXCLUDED_ON_RECONCILIATION';

export type ParserWarning = {
  code: ParserWarningCode;
  message: string;
};

export type ParserDiagnostics = {
  normalizedLineCount: number;
  totalCandidates: DetectedAmount[];
  excludedPaymentLines: string[];
  // Raw text of any item-candidate line removed by the reconciliation
  // backstop — kept here (and still present in rawText/the raw-text viewer)
  // so exclusion is never a silent, unexplainable deletion (mirrors
  // excludedPaymentLines' transparency precedent).
  excludedReconciliationLines: string[];
  lowConfidenceLineCount: number;
};

export type ParsedReceipt = {
  merchantName: string | null;
  receiptDate: string | null;
  items: ParsedLineItem[];
  adjustments: ParsedAdjustment[];
  detectedSubtotalCentavos: number | null;
  detectedTotalCentavos: number | null;
  rawText: string;
  warnings: ParserWarning[];
  diagnostics: ParserDiagnostics;
};
