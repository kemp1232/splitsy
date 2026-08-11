import sharp from 'sharp';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../ocr/ollamaClient.js', () => ({
  requestTranscription: vi.fn(),
}));

import { requestTranscription } from '../ocr/ollamaClient.js';
import { ocrRoute } from './ocr.js';

// A real, minimal decodable image — sharp (used by preprocessReceiptImage)
// rejects arbitrary bytes, unlike the raw fetch/base64 path this replaced.
let tinyPng: Buffer;

function buildRequest(file: File | null): Request {
  const form = new FormData();
  if (file) form.append('image', file);
  return new Request('http://localhost/api/ocr', { method: 'POST', body: form });
}

describe('POST /api/ocr', () => {
  beforeAll(async () => {
    tinyPng = await sharp({
      create: { width: 4, height: 4, channels: 3, background: { r: 255, g: 255, b: 255 } },
    })
      .png()
      .toBuffer();
  });

  beforeEach(() => {
    vi.mocked(requestTranscription).mockReset();
  });

  it('returns the transcribed text on success', async () => {
    vi.mocked(requestTranscription).mockResolvedValue('BURGER 240.00\nTOTAL 240.00');
    const file = new File([new Uint8Array(tinyPng)], 'receipt.jpg', { type: 'image/jpeg' });

    const res = await ocrRoute.fetch(buildRequest(file));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ text: 'BURGER 240.00\nTOTAL 240.00' });
  });

  it('returns 400 when no image is provided', async () => {
    const res = await ocrRoute.fetch(buildRequest(null));
    expect(res.status).toBe(400);
    expect(requestTranscription).not.toHaveBeenCalled();
  });

  it('returns 502 when the engine call fails, without leaking internal details as a 200', async () => {
    vi.mocked(requestTranscription).mockRejectedValue(new Error('model unavailable'));
    const file = new File([new Uint8Array(tinyPng)], 'receipt.jpg', { type: 'image/jpeg' });

    const res = await ocrRoute.fetch(buildRequest(file));

    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/model unavailable/);
  });

  it('returns 502 (not an unhandled crash) when the uploaded bytes are not a decodable image', async () => {
    const file = new File([new Uint8Array([1, 2, 3])], 'receipt.jpg', { type: 'image/jpeg' });

    const res = await ocrRoute.fetch(buildRequest(file));

    expect(res.status).toBe(502);
    expect(requestTranscription).not.toHaveBeenCalled();
  });
});
