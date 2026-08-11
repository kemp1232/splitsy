import type { FixtureLine } from './buildOcrDocument';

// One item line comes back from OCR with low confidence — the parser should
// still extract it but flag it for the mandatory manual review (spec 20.1
// case 12; spec section 6 requires the bridge to expose confidence when
// available, even though our current ML Kit adapter does not — see
// MlKitReceiptOcrService's Milestone 0 note).
export const lowConfidenceLines: FixtureLine[] = [
  { text: 'BLURRY CAFE' },
  { text: 'MYSTERY ITEM          99.00', confidence: 0.3 },
  { text: 'TOTAL                  99.00', confidence: 0.95 },
];
