// Groq (https://groq.com) hosts open-weight models on its own inference
// hardware and exposes them through an OpenAI-compatible Chat Completions
// API — this is that same shape, just pointed at a vision-capable model, so
// swapping models later is a config change (see engines.ts), not a code one.
const GROQ_CHAT_COMPLETIONS_URL = 'https://api.groq.com/openai/v1/chat/completions';

export type GroqChatOptions = {
  apiKey: string;
  model: string;
  prompt: string;
  imageBase64: string;
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
