export type OcrEngine = 'qwen3.8-27b';

// Groq-hosted model ID for each supported engine — switching engines is a
// config change (OCR_ENGINE env var), not a code change. qwen3.8-27b is a
// multimodal (vision + text) model with strong OCR performance, run on
// Groq's own inference hardware via its OpenAI-compatible chat completions
// API (see groqClient.ts). Replaces qwen3.6-27b, which Groq deprecated
// 2026-09 (decommissioned 2026-09-14 — every request would have been
// auto-routed to this same model after that date regardless).
const ENGINE_MODEL_TAGS: Record<OcrEngine, string> = {
  'qwen3.8-27b': 'qwen/qwen3.8-27b',
};

export function resolveModelTag(engine: string): string {
  if (engine === 'qwen3.8-27b') {
    return ENGINE_MODEL_TAGS[engine];
  }
  throw new Error(`Unknown OCR_ENGINE "${engine}". Expected "qwen3.8-27b".`);
}
