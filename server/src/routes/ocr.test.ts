import sharp from 'sharp';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Keeps the real `GroqRequestError` class (ocr.ts's `instanceof` check on it
// needs the real constructor, not a mock stand-in) while only mocking the
// network call itself.
vi.mock('../ocr/groqClient.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../ocr/groqClient.js')>();
  return { ...actual, requestReceiptExtraction: vi.fn() };
});

// scanQueue.ts talks to real Postgres (see its own header comment on why —
// serverless instances share no memory) — mocked here so these route tests
// don't need a real DATABASE_URL, defaulting every test to "slot available"
// so the existing tests below exercise the same behavior as before this
// queue existed. The one test that cares about the queued-429 path
// overrides this per-test.
vi.mock('../ocr/scanQueue.js', () => ({
  claimScanSlot: vi.fn().mockResolvedValue({ claimed: true }),
}));

import { GroqRequestError, requestReceiptExtraction } from '../ocr/groqClient.js';
import { claimScanSlot } from '../ocr/scanQueue.js';
import { ocrRoute } from './ocr.js';

// A real, minimal decodable image — sharp (used by preprocessReceiptImage)
// rejects arbitrary bytes, unlike the raw fetch/base64 path this replaced.
let tinyPng: Buffer;

const VALID_EXTRACTION = {
  merchantName: 'SAMPLE DINER',
  receiptDate: '2026-01-15',
  items: [{ name: 'BURGER MEAL', quantity: 2, lineTotalCentavos: 24000 }],
  adjustments: [{ type: 'TAX', label: 'VAT (12%)', amountCentavos: 5400 }],
  detectedSubtotalCentavos: 24000,
  detectedTotalCentavos: 29400,
  rawText: 'BURGER MEAL 240.00\nVAT (12%) 54.00\nTOTAL 294.00',
};

function buildRequest(file: File | null): Request {
  const form = new FormData();
  if (file) form.append('image', file);
  return new Request('http://localhost/api/ocr', { method: 'POST', body: form });
}

describe('POST /api/ocr', () => {
  const originalApiKey = process.env.GROQ_API_KEY;

  beforeAll(async () => {
    tinyPng = await sharp({
      create: { width: 4, height: 4, channels: 3, background: { r: 255, g: 255, b: 255 } },
    })
      .png()
      .toBuffer();
  });

  beforeEach(() => {
    vi.mocked(requestReceiptExtraction).mockReset();
    vi.mocked(claimScanSlot).mockReset().mockResolvedValue({ claimed: true });
    process.env.GROQ_API_KEY = 'test-key';
  });

  afterEach(() => {
    process.env.GROQ_API_KEY = originalApiKey;
  });

  it('returns the validated structured extraction on success', async () => {
    vi.mocked(requestReceiptExtraction).mockResolvedValue({
      content: JSON.stringify(VALID_EXTRACTION),
      truncated: false,
    });
    const file = new File([new Uint8Array(tinyPng)], 'receipt.jpg', { type: 'image/jpeg' });

    const res = await ocrRoute.fetch(buildRequest(file));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ...VALID_EXTRACTION, truncated: false });
  });

  it('reports truncated: true when Groq hit its token cap before finishing', async () => {
    vi.mocked(requestReceiptExtraction).mockResolvedValue({
      content: JSON.stringify(VALID_EXTRACTION),
      truncated: true,
    });
    const file = new File([new Uint8Array(tinyPng)], 'receipt.jpg', { type: 'image/jpeg' });

    const res = await ocrRoute.fetch(buildRequest(file));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ...VALID_EXTRACTION, truncated: true });
  });

  it('returns 400 when no image is provided', async () => {
    const res = await ocrRoute.fetch(buildRequest(null));
    expect(res.status).toBe(400);
    expect(requestReceiptExtraction).not.toHaveBeenCalled();
  });

  it('returns 500 (with a clear message, not a Groq 401) when GROQ_API_KEY is unset', async () => {
    delete process.env.GROQ_API_KEY;
    const file = new File([new Uint8Array(tinyPng)], 'receipt.jpg', { type: 'image/jpeg' });

    const res = await ocrRoute.fetch(buildRequest(file));

    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/GROQ_API_KEY/);
    expect(requestReceiptExtraction).not.toHaveBeenCalled();
  });

  it('returns 502 when Groq call itself fails, without leaking internal details as a 200', async () => {
    vi.mocked(requestReceiptExtraction).mockRejectedValue(new Error('model unavailable'));
    const file = new File([new Uint8Array(tinyPng)], 'receipt.jpg', { type: 'image/jpeg' });

    const res = await ocrRoute.fetch(buildRequest(file));

    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/model unavailable/);
  });

  it('passes through a 429 (not a generic 502) when Groq rate-limits the request', async () => {
    vi.mocked(requestReceiptExtraction).mockRejectedValue(
      new GroqRequestError('Groq request failed (429): rate limit exceeded', 429),
    );
    const file = new File([new Uint8Array(tinyPng)], 'receipt.jpg', { type: 'image/jpeg' });

    const res = await ocrRoute.fetch(buildRequest(file));

    expect(res.status).toBe(429);
    expect((await res.json()).error).toMatch(/rate limit/);
  });

  it('still returns 502 for a non-429 GroqRequestError (e.g. a 500 from Groq itself)', async () => {
    vi.mocked(requestReceiptExtraction).mockRejectedValue(
      new GroqRequestError('Groq request failed (500): internal error', 500),
    );
    const file = new File([new Uint8Array(tinyPng)], 'receipt.jpg', { type: 'image/jpeg' });

    const res = await ocrRoute.fetch(buildRequest(file));

    expect(res.status).toBe(502);
  });

  it('returns 502 when Groq responds with text that is not valid JSON', async () => {
    vi.mocked(requestReceiptExtraction).mockResolvedValue({
      content: 'not json at all',
      truncated: false,
    });
    const file = new File([new Uint8Array(tinyPng)], 'receipt.jpg', { type: 'image/jpeg' });

    const res = await ocrRoute.fetch(buildRequest(file));

    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/not valid JSON/);
  });

  it('returns 502 (not a 200 with corrupted money data) when Groq JSON does not match the schema', async () => {
    // e.g. a non-integer amount, as if Groq emitted decimal pesos by mistake.
    vi.mocked(requestReceiptExtraction).mockResolvedValue({
      content: JSON.stringify({ ...VALID_EXTRACTION, detectedTotalCentavos: 294.5 }),
      truncated: false,
    });
    const file = new File([new Uint8Array(tinyPng)], 'receipt.jpg', { type: 'image/jpeg' });

    const res = await ocrRoute.fetch(buildRequest(file));

    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/did not match the expected schema/);
  });

  it('reports truncated: true on the 502 when a cut-off Groq response fails schema validation', async () => {
    // Cut off mid-item: the last item is missing quantity/lineTotalCentavos.
    vi.mocked(requestReceiptExtraction).mockResolvedValue({
      content: JSON.stringify({ ...VALID_EXTRACTION, items: [{ name: 'BURGER' }] }),
      truncated: true,
    });
    const file = new File([new Uint8Array(tinyPng)], 'receipt.jpg', { type: 'image/jpeg' });

    const res = await ocrRoute.fetch(buildRequest(file));

    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toMatch(/did not match the expected schema/);
    expect(body.truncated).toBe(true);
  });

  it('reports truncated: true on the 502 when a cut-off Groq response is not valid JSON', async () => {
    vi.mocked(requestReceiptExtraction).mockResolvedValue({
      content: '{"merchantName":"SAMP',
      truncated: true,
    });
    const file = new File([new Uint8Array(tinyPng)], 'receipt.jpg', { type: 'image/jpeg' });

    const res = await ocrRoute.fetch(buildRequest(file));

    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toMatch(/not valid JSON/);
    expect(body.truncated).toBe(true);
  });

  it.each([
    [
      'a generic Groq call failure',
      () => vi.mocked(requestReceiptExtraction).mockRejectedValue(new Error('model unavailable')),
      502,
    ],
    [
      "Groq's own 429",
      () =>
        vi
          .mocked(requestReceiptExtraction)
          .mockRejectedValue(new GroqRequestError('Groq request failed (429): rate limit', 429)),
      429,
    ],
    [
      'a 500 from Groq itself',
      () =>
        vi
          .mocked(requestReceiptExtraction)
          .mockRejectedValue(new GroqRequestError('Groq request failed (500): internal', 500)),
      502,
    ],
    [
      'a non-truncated schema mismatch',
      () =>
        vi.mocked(requestReceiptExtraction).mockResolvedValue({
          content: JSON.stringify({ ...VALID_EXTRACTION, detectedTotalCentavos: 294.5 }),
          truncated: false,
        }),
      502,
    ],
  ])('reports truncated: false on the error response for %s', async (_label, arrange, status) => {
    arrange();
    const file = new File([new Uint8Array(tinyPng)], 'receipt.jpg', { type: 'image/jpeg' });

    const res = await ocrRoute.fetch(buildRequest(file));

    expect(res.status).toBe(status);
    expect((await res.json()).truncated).toBe(false);
  });

  it('reports truncated: false when the image fails before Groq is ever called', async () => {
    const file = new File([new Uint8Array([1, 2, 3])], 'receipt.jpg', { type: 'image/jpeg' });

    const res = await ocrRoute.fetch(buildRequest(file));

    expect(res.status).toBe(502);
    expect((await res.json()).truncated).toBe(false);
  });

  it('returns 502 (not an unhandled crash) when the uploaded bytes are not a decodable image', async () => {
    const file = new File([new Uint8Array([1, 2, 3])], 'receipt.jpg', { type: 'image/jpeg' });

    const res = await ocrRoute.fetch(buildRequest(file));

    expect(res.status).toBe(502);
    expect(requestReceiptExtraction).not.toHaveBeenCalled();
  });

  it('returns a queued 429 (not calling Groq at all) when the shared scan slot is busy', async () => {
    vi.mocked(claimScanSlot).mockResolvedValue({ claimed: false, retryAfterSeconds: 42 });
    const file = new File([new Uint8Array(tinyPng)], 'receipt.jpg', { type: 'image/jpeg' });

    const res = await ocrRoute.fetch(buildRequest(file));

    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.reason).toBe('queued');
    expect(body.retryAfterSeconds).toBe(42);
    expect(body).not.toHaveProperty('truncated');
    // The whole point of checking the queue first is never spending any of
    // the shared Groq token budget on a request that's just going to be
    // turned away.
    expect(requestReceiptExtraction).not.toHaveBeenCalled();
  });
});
