// Groq (https://groq.com) hosts open-weight models on its own inference
// hardware and exposes them through an OpenAI-compatible Chat Completions
// API — this is that same shape, just pointed at a vision-capable model, so
// swapping models later is a config change (see engines.ts), not a code one.
const GROQ_CHAT_COMPLETIONS_URL = 'https://api.groq.com/openai/v1/chat/completions';

// Groq rejects the request outright (a hard 429, not a "wait and retry")
// whenever the *declared* max_tokens exceeds the account's output-tokens-
// per-minute (OTPM) limit for the model — this is a ceiling on what the
// request says it might use, not on what it actually used, so leaving
// max_tokens unset (which defaults to 2048 for qwen/qwen3.8-27b) fails every
// single request on this account's on_demand tier (observed OTPM limit:
// 1000), regardless of how short the receipt actually is. 900 leaves a
// little headroom under that observed limit. Env-tunable (matching
// OCR_IMAGE_MAX_WIDTH's own pattern) so raising Groq's Dev Tier later is a
// config change, not a code change.
const DEFAULT_MAX_OUTPUT_TOKENS = 900;

export type GroqChatOptions = {
  apiKey: string;
  model: string;
  prompt: string;
  imageBase64: string;
  maxOutputTokens?: number;
};

type GroqChatResponse = {
  choices?: { message?: { content?: string } }[];
  error?: { message?: string };
};

// Carries Groq's own HTTP status through to the route, which needs to tell a
// 429 (rate limited — a distinct, user-facing "try again shortly" situation)
// apart from every other upstream failure (which all become a generic 502).
export class GroqRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'GroqRequestError';
  }
}

// Returns the model's raw JSON-string response for the receipt-extraction
// prompt — the caller (ocr.ts) is responsible for JSON.parse-ing and
// schema-validating it before trusting any of it.
export async function requestReceiptExtraction({
  apiKey,
  model,
  prompt,
  imageBase64,
  maxOutputTokens = DEFAULT_MAX_OUTPUT_TOKENS,
}: GroqChatOptions): Promise<string> {
  let response: Response;
  try {
    response = await fetch(GROQ_CHAT_COMPLETIONS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imageBase64}` } },
            ],
          },
        ],
        // Extraction, not creative writing — keep it deterministic.
        temperature: 0,
        // See DEFAULT_MAX_OUTPUT_TOKENS above — must stay under the
        // account's enforced OTPM limit or Groq rejects the request before
        // it ever runs.
        max_tokens: maxOutputTokens,
        // qwen3.8-27b (like its predecessor qwen3.6-27b, which Groq
        // deprecated 2026-09) "thinks" by default (a <think>...</think>
        // reasoning block prepended to content) — harmless for chat, but it
        // would land inside the JSON string this call expects back,
        // breaking JSON.parse entirely. Confirmed via a direct API test
        // against qwen/qwen3.8-27b that this still fully suppresses it.
        reasoning_effort: 'none',
        // Guarantees syntactically valid JSON back (confirmed working for
        // qwen/qwen3.8-27b via a direct API test against a real receipt) —
        // does not by itself guarantee the JSON matches our schema, which is
        // why ocr.ts still validates the parsed result.
        response_format: { type: 'json_object' },
      }),
    });
  } catch (error) {
    // Node's fetch throws a generic "fetch failed" TypeError for connection-
    // level failures — the actual reason lives in `cause`, which is
    // otherwise silently dropped.
    const cause = error instanceof Error && error.cause ? ` (${String(error.cause)})` : '';
    throw new Error(
      `Could not reach Groq${cause}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new GroqRequestError(
      `Groq request failed (${response.status}): ${detail}`,
      response.status,
    );
  }

  const data = (await response.json()) as GroqChatResponse;
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== 'string') {
    throw new Error(data.error?.message ?? 'Groq response did not include message content.');
  }
  return content;
}
