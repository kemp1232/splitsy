import { File } from 'expo-file-system';
import { z } from 'zod';

import { OCR_BACKEND_URL } from '@/constants/config';
import { defaultAllocationMethodForType } from '@/features/adjustments/defaultAllocationMethod';
import type { ParsedReceipt } from '@/features/receipt-parser/receiptParser.types';

import {
  OcrRateLimitedError,
  type OcrRecognitionResult,
  type ReceiptOcrService,
} from './ReceiptOcrService';

// The lean wire shape the server validates its own response against before
// ever sending it (server/src/ocr/receiptExtraction.schema.ts) — checked
// again here since a network response is untrusted input regardless of what
// the server already did (spec section 7: "treat scanned data as untrusted
// input and validate it before storage"). This is deliberately not the full
// `ParsedReceipt` shape: the server's Groq backend now classifies items,
// totals, and adjustments itself (see PLAN.md's "Groq performs full receipt
// extraction" entry), but per-item confidence/source, allocation-method
// defaults, and warnings/diagnostics are still this app's own concerns, not
// something to ask an LLM to invent — groqExtractionToParsedReceipt below
// fills those in the same way parseReceipt.ts does for the on-device path.
const backendReceiptExtractionSchema = z.object({
  merchantName: z.string().nullable(),
  receiptDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  items: z.array(
    z.object({
      name: z.string().min(1),
      quantity: z.number().int().min(1).max(99),
      lineTotalCentavos: z.number().int().min(0),
    }),
  ),
  adjustments: z.array(
    z.object({
      type: z.enum(['TAX', 'SERVICE_CHARGE', 'TIP', 'DISCOUNT', 'OTHER']),
      label: z.string().min(1),
      amountCentavos: z.number().int(),
    }),
  ),
  detectedSubtotalCentavos: z.number().int().nullable(),
  detectedTotalCentavos: z.number().int().nullable(),
  rawText: z.string(),
});

type BackendReceiptExtraction = z.infer<typeof backendReceiptExtractionSchema>;

// Maps the backend's lean extraction onto the app's shared `ParsedReceipt`
// shape (the same shape parseReceipt.ts produces for the on-device path), so
// nothing downstream of ReceiptOcrService needs to know or care which path
// produced a given receipt. `warnings`/`diagnostics` are populated with the
// same reconciliation-style checks parseReceipt.ts's buildWarnings runs
// (arithmetic only, not text classification — safe to keep even though the
// classification itself is no longer this app's job for this path); every
// other field (totalCandidates, excludedPaymentLines, lowConfidenceLineCount,
// etc.) has no LLM-path equivalent and is left empty/zero.
export function groqExtractionToParsedReceipt(data: BackendReceiptExtraction): ParsedReceipt {
  const items = data.items.map((item) => ({
    name: item.name,
    quantity: item.quantity,
    lineTotalCentavos: item.lineTotalCentavos,
    source: 'OCR' as const,
    confidence: null,
    rawText: item.name,
  }));

  const adjustments = data.adjustments.map((adjustment) => ({
    type: adjustment.type,
    label: adjustment.label,
    amountCentavos: adjustment.amountCentavos,
    allocationMethod: defaultAllocationMethodForType(adjustment.type),
    source: 'OCR' as const,
    rawText: adjustment.label,
  }));

  const itemSubtotalCentavos = items.reduce((sum, item) => sum + item.lineTotalCentavos, 0);
  const adjustmentTotalCentavos = adjustments.reduce((sum, adj) => sum + adj.amountCentavos, 0);

  const warnings: ParsedReceipt['warnings'] = [];
  if (items.length === 0) {
    warnings.push({ code: 'NO_ITEMS_DETECTED', message: 'No line items detected.' });
  }
  if (data.detectedTotalCentavos === null) {
    warnings.push({ code: 'NO_TOTAL_DETECTED', message: 'No receipt total detected.' });
  }
  if (
    data.detectedSubtotalCentavos !== null &&
    data.detectedSubtotalCentavos !== itemSubtotalCentavos
  ) {
    warnings.push({
      code: 'SUBTOTAL_MISMATCH',
      message: 'Detected subtotal does not match item subtotal.',
    });
  }
  if (
    data.detectedTotalCentavos !== null &&
    data.detectedTotalCentavos !== itemSubtotalCentavos + adjustmentTotalCentavos
  ) {
    warnings.push({
      code: 'TOTAL_MISMATCH',
      message: 'Detected total does not match parsed items and adjustments.',
    });
  }

  return {
    merchantName: data.merchantName,
    receiptDate: data.receiptDate,
    items,
    adjustments,
    detectedSubtotalCentavos: data.detectedSubtotalCentavos,
    detectedTotalCentavos: data.detectedTotalCentavos,
    rawText: data.rawText,
    warnings,
    diagnostics: {
      normalizedLineCount: data.rawText.split('\n').filter((line) => line.trim().length > 0).length,
      totalCandidates: [],
      excludedPaymentLines: [],
      excludedReconciliationLines: [],
      lowConfidenceLineCount: 0,
    },
  };
}

export class BackendReceiptOcrService implements ReceiptOcrService {
  async recognize(imageUri: string): Promise<OcrRecognitionResult> {
    if (!OCR_BACKEND_URL) {
      throw new Error('OCR backend is not configured (EXPO_PUBLIC_OCR_BACKEND_URL unset).');
    }
    // Development-only diagnostic (spec §18: dev logging must be gated and
    // easy to disable) — just the request URL, never receipt content.
    if (__DEV__) console.log(`[BackendReceiptOcrService] requesting ${OCR_BACKEND_URL}/api/ocr`);

    const formData = new FormData();
    // Expo SDK 57's fetch/FormData implementation only accepts a real Blob
    // (or Blob-like object exposing `bytes()`) for file parts — the classic
    // React Native `{uri, name, type}` object idiom throws "Unsupported
    // FormDataPart implementation" here. expo-file-system's `File` implements
    // the Blob interface and satisfies this directly.
    formData.append('image', new File(imageUri));

    const response = await fetch(`${OCR_BACKEND_URL}/api/ocr`, { method: 'POST', body: formData });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      // The server passes Groq's own 429 through as our API's 429 (see
      // server/src/routes/ocr.ts) specifically so this distinction is
      // possible — everything else stays a generic failure that
      // FallbackReceiptOcrService already handles silently.
      if (response.status === 429) {
        throw new OcrRateLimitedError(`OCR backend rate-limited (429): ${detail}`);
      }
      throw new Error(`OCR backend request failed (${response.status}): ${detail}`);
    }

    const data: unknown = await response.json();
    const parseResult = backendReceiptExtractionSchema.safeParse(data);
    if (!parseResult.success) {
      const errorMessage = (data as { error?: string } | null)?.error;
      throw new Error(errorMessage ?? `OCR backend response did not match the expected shape.`);
    }

    return { receipt: groqExtractionToParsedReceipt(parseResult.data), source: 'backend' };
  }
}
