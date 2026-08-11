export type OllamaChatOptions = {
  baseUrl: string;
  model: string;
  prompt: string;
  imageBase64: string;
};

type OllamaChatResponse = {
  message?: { content?: string };
};

export async function requestTranscription({
  baseUrl,
  model,
  prompt,
  imageBase64,
}: OllamaChatOptions): Promise<string> {
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt, images: [imageBase64] }],
        stream: false,
        // Ollama's default context window (4096) is smaller than the token
        // count a single receipt image encodes to (~4160+), which makes every
        // request fail with "exceeds the available context size". Receipts
        // are text-dense but still comfortably under this once headroom for
        // the transcribed output is included.
        options: { num_ctx: 8192 },
      }),
    });
  } catch (error) {
    // Node's fetch throws a generic "fetch failed" TypeError for connection-
    // level failures (Ollama not running, wrong host, etc.) — the actual
    // reason lives in `cause`, which is otherwise silently dropped.
    const cause = error instanceof Error && error.cause ? ` (${String(error.cause)})` : '';
    throw new Error(
      `Could not reach Ollama at ${baseUrl}${cause}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Ollama request failed (${response.status}): ${detail}`);
  }

  const data = (await response.json()) as OllamaChatResponse;
  const content = data.message?.content;
  if (typeof content !== 'string') {
    throw new Error('Ollama response did not include message content.');
  }
  return content;
}
