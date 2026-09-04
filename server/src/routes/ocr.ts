import { Hono } from 'hono';
import { ZodError } from 'zod';

import { resolveModelTag } from '../ocr/engines.js';
import { GroqRequestError, requestReceiptExtraction } from '../ocr/groqClient.js';
import { preprocessReceiptImage } from '../ocr/imagePreprocess.js';
import { RECEIPT_EXTRACTION_PROMPT } from '../ocr/prompts.js';
import { validateReceiptExtraction } from '../ocr/receiptExtraction.schema.js';

const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // plenty for a resized receipt photo

export const ocrRoute = new Hono();

ocrRoute.post('/api/ocr', async (c) => {
  const formData = await c.req.formData();
  const file = formData.get('image');

  if (!(file instanceof File)) {
    return c.json({ error: 'Missing "image" file in form data.' }, 400);
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return c.json({ error: 'Image too large.' }, 413);
  }

  // Held only for this request's lifetime — never written to disk, so there's
  // nothing to delete afterward. This is what "upload only the receipt image
  // for extraction, return the result, delete the server copy immediately"
  // means in practice: there is no persistent copy at any point.
  const bytes = Buffer.from(await file.arrayBuffer());

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    // Fail fast with a clear message rather than letting groqClient's fetch
    // reach Groq with an empty Authorization header and surface a confusing
    // 401 — this is the state right after `cp .env.example .env`, before a
    // key has been filled in.
    return c.json(
      {
        error:
          'GROQ_API_KEY is not set. Add one to server/.env (get one at console.groq.com/keys).',
      },
      500,
    );
  }

  const engine = process.env.OCR_ENGINE ?? 'qwen3.8-27b';
  const maxWidth = process.env.OCR_IMAGE_MAX_WIDTH
    ? Number(process.env.OCR_IMAGE_MAX_WIDTH)
    : undefined;

  try {
    const model = resolveModelTag(engine);
    const preprocessed = await preprocessReceiptImage(bytes, maxWidth);
    const content = await requestReceiptExtraction({
      apiKey,
      model,
      prompt: RECEIPT_EXTRACTION_PROMPT,
      imageBase64: preprocessed.toString('base64'),
    });

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new Error('Groq returned a response that was not valid JSON.');
    }

    // Schema-invalid output (wrong types, missing fields, a stray decimal
    // peso amount instead of integer centavos) surfaces as a 502, same as any
    // other extraction failure — FallbackReceiptOcrService on the client
    // already treats that as "try on-device OCR instead," which is the right
    // outcome for an occasional malformed response rather than corrupting
    // money data by trusting it anyway.
    let extraction;
    try {
      extraction = validateReceiptExtraction(parsed);
    } catch (error) {
      const detail = error instanceof ZodError ? error.message : String(error);
      throw new Error(`Groq response did not match the expected schema: ${detail}`);
    }

    return c.json(extraction);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown OCR error';
    // Groq's free-tier rate limit (429) is a distinct, expected, user-facing
    // situation — "try again shortly" — not a generic upstream failure.
    // Passed through as our own 429 so the client can show a specific
    // message instead of lumping it in with every other 502 case.
    const status = error instanceof GroqRequestError && error.status === 429 ? 429 : 502;
    return c.json({ error: message }, status);
  }
});
