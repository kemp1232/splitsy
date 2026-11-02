import { afterEach, describe, expect, it, vi } from 'vitest';

import { requestReceiptExtraction } from './groqClient.js';

const OPTIONS = { apiKey: 'test-key', model: 'test-model', prompt: 'extract', imageBase64: 'AAAA' };
const CONTENT = '{"merchantName":"SAMPLE DINER"}';

// Stubs the global fetch requestReceiptExtraction calls with a Groq-shaped
// (OpenAI-compatible) chat-completions body — no real network access.
function stubGroqResponse(choice: { message: { content: string }; finish_reason?: string }) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ choices: [choice] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    ),
  );
}

describe('requestReceiptExtraction', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reports truncated: true when Groq stopped at its token cap (finish_reason "length")', async () => {
    stubGroqResponse({ message: { content: CONTENT }, finish_reason: 'length' });

    await expect(requestReceiptExtraction(OPTIONS)).resolves.toEqual({
      content: CONTENT,
      truncated: true,
    });
  });

  it('reports truncated: false for a normal completion (finish_reason "stop")', async () => {
    stubGroqResponse({ message: { content: CONTENT }, finish_reason: 'stop' });

    await expect(requestReceiptExtraction(OPTIONS)).resolves.toEqual({
      content: CONTENT,
      truncated: false,
    });
  });

  it('reports truncated: false when finish_reason is absent', async () => {
    stubGroqResponse({ message: { content: CONTENT } });

    await expect(requestReceiptExtraction(OPTIONS)).resolves.toEqual({
      content: CONTENT,
      truncated: false,
    });
  });
});
