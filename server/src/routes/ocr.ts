import { Hono } from 'hono';

import { resolveModelTag } from '../ocr/engines.js';
import { preprocessReceiptImage } from '../ocr/imagePreprocess.js';
import { requestTranscription } from '../ocr/ollamaClient.js';
import { RECEIPT_TRANSCRIPTION_PROMPT } from '../ocr/prompts.js';

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

  const engine = process.env.OCR_ENGINE ?? 'qwen3-vl';
  const baseUrl = process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434';
  const maxWidth = process.env.OCR_IMAGE_MAX_WIDTH
    ? Number(process.env.OCR_IMAGE_MAX_WIDTH)
    : undefined;

  try {
    const model = resolveModelTag(engine);
    const preprocessed = await preprocessReceiptImage(bytes, maxWidth);
    const text = await requestTranscription({
      baseUrl,
      model,
      prompt: RECEIPT_TRANSCRIPTION_PROMPT,
      imageBase64: preprocessed.toString('base64'),
    });
    return c.json({ text });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown OCR error';
    return c.json({ error: message }, 502);
  }
});
