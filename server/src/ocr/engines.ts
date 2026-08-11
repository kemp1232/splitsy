export type OcrEngine = 'qwen3-vl' | 'qwen3-vl-8b' | 'paddleocr-vl' | 'minicpm-v';

// Both servable through the same Ollama /api/chat call — switching engines is
// a config change (OCR_ENGINE env var), not a code change.
const ENGINE_MODEL_TAGS: Record<OcrEngine, string> = {
  'qwen3-vl': 'qwen3-vl:4b',
  // Larger variant of the same model family — potentially more accurate on
  // messy/handwritten receipts, at the cost of not fully fitting this dev
  // machine's 8GB VRAM alongside the 4b model (see PLAN.md for GPU/CPU split
  // findings once measured).
  'qwen3-vl-8b': 'qwen3-vl:8b',
  // NOTE: as pulled during development, this specific community tag
  // (MedAIBase/PaddleOCR-VL:0.9b) loads but rejects image input — Ollama
  // reports "image input is not supported... you may need to provide the
  // mmproj", meaning this package is missing its vision projector. Left wired
  // up so swapping OCR_ENGINE is still just a config change once a working
  // vision-capable tag/source is found; qwen3-vl is the one confirmed working.
  'paddleocr-vl': 'MedAIBase/PaddleOCR-VL:0.9b',
  // Evaluated 2026-08-04 as a candidate specifically for messy/handwritten
  // receipts: smaller than qwen3-vl:8b, no "thinking"-mode overhead, and
  // known for strong document/OCR benchmarks relative to its size — see
  // PLAN.md for the measured result once tested against a real receipt.
  'minicpm-v': 'minicpm-v',
};

export function resolveModelTag(engine: string): string {
  if (
    engine === 'qwen3-vl' ||
    engine === 'qwen3-vl-8b' ||
    engine === 'paddleocr-vl' ||
    engine === 'minicpm-v'
  ) {
    return ENGINE_MODEL_TAGS[engine];
  }
  throw new Error(
    `Unknown OCR_ENGINE "${engine}". Expected "qwen3-vl", "qwen3-vl-8b", "paddleocr-vl", or "minicpm-v".`,
  );
}
