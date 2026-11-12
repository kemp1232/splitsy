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

// The session lookup and per-account daily cap are mocked the same way:
// every test defaults to "signed in, under the cap" so the existing tests
// exercise the same success/failure paths as before; the auth/cap tests at
// the bottom override these per-test.
vi.mock('../sessionUser.js', () => ({
  getSessionUserId: vi.fn().mockResolvedValue('user-1'),
}));
vi.mock('../ocr/dailyUsage.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../ocr/dailyUsage.js')>();
  return {
    ...actual,
    claimDailyScan: vi.fn().mockResolvedValue({ allowed: true, usageDay: '2026-11-09' }),
    refundDailyScan: vi.fn().mockResolvedValue(undefined),
  };
});

import { claimDailyScan, refundDailyScan } from '../ocr/dailyUsage.js';
import { GroqRequestError, requestReceiptExtraction } from '../ocr/groqClient.js';
import { claimScanSlot } from '../ocr/scanQueue.js';
import { getSessionUserId } from '../sessionUser.js';
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
  const originalDailyLimit = process.env.OCR_DAILY_SCAN_LIMIT;

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
    vi.mocked(getSessionUserId).mockReset().mockResolvedValue('user-1');
    vi.mocked(claimDailyScan)
      .mockReset()
      .mockResolvedValue({ allowed: true, usageDay: '2026-11-09' });
    vi.mocked(refundDailyScan).mockReset().mockResolvedValue(undefined);
    process.env.GROQ_API_KEY = 'test-key';
    delete process.env.OCR_DAILY_SCAN_LIMIT;
  });

  afterEach(() => {
    process.env.GROQ_API_KEY = originalApiKey;
    delete process.env.OCR_GROQ_TIMEOUT_MS;
    if (originalDailyLimit === undefined) delete process.env.OCR_DAILY_SCAN_LIMIT;
    else process.env.OCR_DAILY_SCAN_LIMIT = originalDailyLimit;
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
    const body = await res.json();
    expect(body.error).toMatch(/did not match the expected schema/);
    expect(body.reason).toBe('unreadable');
  });

  it("returns 502 with reason 'unreadable' when every extracted item is unusable", async () => {
    vi.mocked(requestReceiptExtraction).mockResolvedValue({
      content: JSON.stringify({ ...VALID_EXTRACTION, items: [{ name: 'BURGER' }] }),
      truncated: false,
    });
    const file = new File([new Uint8Array(tinyPng)], 'receipt.jpg', { type: 'image/jpeg' });

    const res = await ocrRoute.fetch(buildRequest(file));

    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.reason).toBe('unreadable');
    expect(body.truncated).toBe(false);
  });

  it('returns 200 with the salvaged items when only some items are malformed', async () => {
    vi.mocked(requestReceiptExtraction).mockResolvedValue({
      content: JSON.stringify({
        ...VALID_EXTRACTION,
        items: [
          { name: 'BURGER MEAL', lineTotalCentavos: 24000 },
          { name: 'MYSTERY', quantity: 1 },
        ],
      }),
      truncated: false,
    });
    const file = new File([new Uint8Array(tinyPng)], 'receipt.jpg', { type: 'image/jpeg' });

    const res = await ocrRoute.fetch(buildRequest(file));

    expect(res.status).toBe(200);
    expect((await res.json()).items).toEqual([
      { name: 'BURGER MEAL', quantity: 1, lineTotalCentavos: 24000 },
    ]);
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

  describe('sign-in requirement and per-account daily cap', () => {
    function receiptFile() {
      return new File([new Uint8Array(tinyPng)], 'receipt.jpg', { type: 'image/jpeg' });
    }

    it('returns 401 unauthenticated without a session, before the daily cap, scan slot or Groq', async () => {
      vi.mocked(getSessionUserId).mockResolvedValue(null);

      const res = await ocrRoute.fetch(buildRequest(receiptFile()));

      expect(res.status).toBe(401);
      expect((await res.json()).reason).toBe('unauthenticated');
      expect(claimDailyScan).not.toHaveBeenCalled();
      expect(claimScanSlot).not.toHaveBeenCalled();
      expect(requestReceiptExtraction).not.toHaveBeenCalled();
    });

    it('returns 429 daily_limit without claiming the scan slot or calling Groq', async () => {
      vi.mocked(claimDailyScan).mockResolvedValue({ allowed: false, usageDay: '2026-11-09' });

      const res = await ocrRoute.fetch(buildRequest(receiptFile()));

      expect(res.status).toBe(429);
      const body = await res.json();
      expect(body.reason).toBe('daily_limit');
      expect(body.limit).toBe(10);
      expect(claimScanSlot).not.toHaveBeenCalled();
      expect(requestReceiptExtraction).not.toHaveBeenCalled();
      expect(refundDailyScan).not.toHaveBeenCalled();
    });

    it('passes the signed-in user id and OCR_DAILY_SCAN_LIMIT (default 10) to the daily cap', async () => {
      vi.mocked(requestReceiptExtraction).mockResolvedValue({
        content: JSON.stringify(VALID_EXTRACTION),
        truncated: false,
      });

      await ocrRoute.fetch(buildRequest(receiptFile()));
      expect(claimDailyScan).toHaveBeenLastCalledWith('user-1', 10);

      process.env.OCR_DAILY_SCAN_LIMIT = '3';
      await ocrRoute.fetch(buildRequest(receiptFile()));
      expect(claimDailyScan).toHaveBeenLastCalledWith('user-1', 3);
    });

    it('refunds the daily scan when the request is queued', async () => {
      vi.mocked(claimScanSlot).mockResolvedValue({ claimed: false, retryAfterSeconds: 5 });

      const res = await ocrRoute.fetch(buildRequest(receiptFile()));

      expect(res.status).toBe(429);
      expect((await res.json()).reason).toBe('queued');
      expect(refundDailyScan).toHaveBeenCalledWith('user-1', '2026-11-09');
    });

    it('refunds the daily scan when the Groq request itself fails', async () => {
      vi.mocked(requestReceiptExtraction).mockRejectedValue(
        new GroqRequestError('Groq request failed (500): internal error', 500),
      );

      const res = await ocrRoute.fetch(buildRequest(receiptFile()));

      expect(res.status).toBe(502);
      expect(refundDailyScan).toHaveBeenCalledWith('user-1', '2026-11-09');
    });

    it('does not refund once Groq returned a (schema-invalid) response', async () => {
      vi.mocked(requestReceiptExtraction).mockResolvedValue({
        content: JSON.stringify({ merchantName: 'X' }),
        truncated: false,
      });

      const res = await ocrRoute.fetch(buildRequest(receiptFile()));

      expect(res.status).toBe(502);
      expect(refundDailyScan).not.toHaveBeenCalled();
    });

    it('does not refund a successful scan', async () => {
      vi.mocked(requestReceiptExtraction).mockResolvedValue({
        content: JSON.stringify(VALID_EXTRACTION),
        truncated: false,
      });

      const res = await ocrRoute.fetch(buildRequest(receiptFile()));

      expect(res.status).toBe(200);
      expect(refundDailyScan).not.toHaveBeenCalled();
    });

    it('returns 503 when the daily usage store fails, without calling Groq', async () => {
      vi.mocked(claimDailyScan).mockRejectedValue(
        new Error('relation "ocr_daily_usage" does not exist'),
      );

      const res = await ocrRoute.fetch(buildRequest(receiptFile()));

      expect(res.status).toBe(503);
      expect((await res.json()).reason).toBe('unavailable');
      expect(claimScanSlot).not.toHaveBeenCalled();
      expect(requestReceiptExtraction).not.toHaveBeenCalled();
    });

    it('returns 503 and refunds the daily scan when the scan queue fails, without calling Groq', async () => {
      vi.mocked(claimScanSlot).mockRejectedValue(new Error('connection refused'));

      const res = await ocrRoute.fetch(buildRequest(receiptFile()));

      expect(res.status).toBe(503);
      expect((await res.json()).reason).toBe('unavailable');
      expect(refundDailyScan).toHaveBeenCalledWith('user-1', '2026-11-09');
      expect(requestReceiptExtraction).not.toHaveBeenCalled();
    });

    it('refunds the daily scan when the client disconnects mid-scan', async () => {
      const controller = new AbortController();
      // Groq "answers", but the client has already gone by then.
      vi.mocked(requestReceiptExtraction).mockImplementation(async () => {
        controller.abort();
        return { content: JSON.stringify(VALID_EXTRACTION), truncated: false };
      });
      const form = new FormData();
      form.append('image', receiptFile());

      const res = await ocrRoute.fetch(
        new Request('http://localhost/api/ocr', {
          method: 'POST',
          body: form,
          signal: controller.signal,
        }),
      );

      expect(res.status).toBe(499);
      expect(refundDailyScan).toHaveBeenCalledWith('user-1', '2026-11-09');
    });

    it('refunds the daily scan and returns 502 when the Groq deadline is hit', async () => {
      process.env.OCR_GROQ_TIMEOUT_MS = '20';
      vi.mocked(requestReceiptExtraction).mockImplementation(
        ({ signal }) =>
          new Promise((_resolve, reject) => {
            const fail = () => reject(signal?.reason);
            if (signal?.aborted) fail();
            else signal?.addEventListener('abort', fail);
          }),
      );

      const res = await ocrRoute.fetch(buildRequest(receiptFile()));

      expect(res.status).toBe(502);
      expect((await res.json()).error).toMatch(/did not respond within 20ms/);
      expect(refundDailyScan).toHaveBeenCalledWith('user-1', '2026-11-09');
    });
  });
});
