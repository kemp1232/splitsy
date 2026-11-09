import { Hono } from 'hono';
import { ZodError } from 'zod';

import { resolveModelTag } from '../ocr/engines.js';
import { GroqRequestError, requestReceiptExtraction } from '../ocr/groqClient.js';
import { preprocessReceiptImage } from '../ocr/imagePreprocess.js';
import { RECEIPT_EXTRACTION_PROMPT } from '../ocr/prompts.js';
import { validateReceiptExtraction } from '../ocr/receiptExtraction.schema.js';
import { claimDailyScan, refundDailyScan, resolveDailyScanLimit } from '../ocr/dailyUsage.js';
import { claimScanSlot } from '../ocr/scanQueue.js';
import { getSessionUserId } from '../sessionUser.js';

const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // plenty for a resized receipt photo

// The server's own deadline for the Groq call — below the client's 360s
// timeout (FallbackReceiptOcrService.ts), so the server normally answers
// (and refunds) before the client gives up. Env-tunable like the rest of the
// OCR config; anything that isn't a positive integer uses the default.
const DEFAULT_GROQ_TIMEOUT_MS = 300_000;
export function resolveGroqTimeoutMs(raw: string | undefined): number {
  const value = Number(raw);
  return raw && Number.isInteger(value) && value > 0 ? value : DEFAULT_GROQ_TIMEOUT_MS;
}

// Nobody is listening once the client has disconnected — no body is built.
// 499 is nginx's "client closed request" convention; never actually read.
function clientGoneResponse(): Response {
  return new Response(null, { status: 499 });
}

const SCAN_UNAVAILABLE_BODY = {
  error: 'Online scanning is temporarily unavailable. Try again later.',
  reason: 'unavailable',
};

export const ocrRoute = new Hono();

ocrRoute.post('/api/ocr', async (c) => {
  // Signed-in users only (2026-11-09 spec Amendment) — checked first, before
  // even parsing the upload, so an anonymous caller never reaches the daily
  // cap, the shared scan slot, or Groq. `reason` follows the queued-429
  // body's shape so the client (BackendReceiptOcrService.ts) can tell it apart.
  const userId = await getSessionUserId(c.req.raw.headers);
  if (!userId) {
    return c.json({ error: 'Sign in to scan receipts.', reason: 'unauthenticated' }, 401);
  }

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
  const maxOutputTokens = process.env.OCR_MAX_OUTPUT_TOKENS
    ? Number(process.env.OCR_MAX_OUTPUT_TOKENS)
    : undefined;

  // Per-account daily cap (see dailyUsage.ts) — checked before the global
  // slot so an over-cap account never holds up everyone else's queue.
  // `reason: 'daily_limit'` keeps it distinct from 'queued' and from Groq's
  // own passed-through 429.
  const dailyLimit = resolveDailyScanLimit(process.env.OCR_DAILY_SCAN_LIMIT);
  // Fails closed: if the usage store itself is unavailable (DB down, or the
  // table missing because migrate.ts hasn't been run yet), refuse with a
  // clear 503 rather than an unhandled 500, and never call Groq uncounted.
  let daily;
  try {
    daily = await claimDailyScan(userId, dailyLimit);
  } catch {
    console.error('[ocr] daily scan usage store unavailable');
    return c.json(SCAN_UNAVAILABLE_BODY, 503);
  }
  if (!daily.allowed) {
    return c.json(
      {
        error: `Daily scan limit reached (${dailyLimit} per day). Try again tomorrow.`,
        reason: 'daily_limit',
        limit: dailyLimit,
      },
      429,
    );
  }
  // Refund policy: a claimed scan is given back whenever Groq never produced
  // a completion (queued, preprocessing failed, Groq request error) — the
  // user got nothing and nothing was spent. Once Groq has returned content
  // (even unusable JSON), the tokens were spent, so the scan counts.
  // Best-effort: a failed refund never changes the response.
  const usageDay = daily.usageDay;
  const refund = async () => {
    try {
      await refundDailyScan(userId, usageDay);
    } catch {
      console.error('[ocr] failed to refund a daily scan');
    }
  };

  // Global scan queue (see scanQueue.ts) — Groq's free-tier output-tokens-
  // per-minute budget is shared across every user of this backend, not
  // per-caller, so at most one scan may run per cooldown window regardless
  // of who's asking. Checked before doing any of the (comparatively
  // expensive) image preprocessing or the Groq call itself, both so a queued
  // caller gets an immediate answer and so a queued request never spends any
  // of that shared token budget at all. Distinguished from a genuine Groq-
  // side 429 (GroqRequestError below) via `reason: 'queued'` in the body —
  // the client (BackendReceiptOcrService.ts) uses that to show a "you're
  // queued, try again in Ns" message rather than silently falling back to
  // on-device OCR the way every other error does.
  let slot;
  try {
    slot = await claimScanSlot();
  } catch {
    // Same fail-closed treatment; the daily scan was already claimed, so
    // give it back first.
    console.error('[ocr] scan queue unavailable');
    await refund();
    return c.json(SCAN_UNAVAILABLE_BODY, 503);
  }
  if (!slot.claimed) {
    await refund();
    return c.json(
      {
        error: `Another scan is in progress. Try again in ${slot.retryAfterSeconds}s.`,
        reason: 'queued',
        retryAfterSeconds: slot.retryAfterSeconds,
      },
      429,
    );
  }

  // Hoisted so the catch block can report it too: a Groq response cut off
  // mid-item fails JSON parsing/schema validation below, and the client needs
  // to know that failure was caused by the token cap. Stays false for any
  // failure before Groq actually returned a response (preprocessing,
  // GroqRequestError).
  let truncated = false;
  let groqResponded = false;
  // Either the client disconnecting (its request signal) or the server's own
  // Groq deadline aborts the Groq call. Both mean the user gets no usable
  // result, so both refund the scan even if Groq already answered.
  const clientSignal = c.req.raw.signal;
  const groqTimeoutMs = resolveGroqTimeoutMs(process.env.OCR_GROQ_TIMEOUT_MS);
  const groqDeadline = AbortSignal.timeout(groqTimeoutMs);
  try {
    const model = resolveModelTag(engine);
    const preprocessed = await preprocessReceiptImage(bytes, maxWidth);
    const result = await requestReceiptExtraction({
      apiKey,
      model,
      prompt: RECEIPT_EXTRACTION_PROMPT,
      imageBase64: preprocessed.toString('base64'),
      maxOutputTokens,
      signal: AbortSignal.any([clientSignal, groqDeadline]),
    });
    groqResponded = true;
    const { content } = result;
    truncated = result.truncated;

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

    if (clientSignal.aborted) {
      await refund();
      return clientGoneResponse();
    }
    // `truncated` travels as a sibling of the validated extraction (like the
    // queued-429 body's `reason`) so the client can warn the user that the
    // scan was cut off by the token cap and some fields may be missing.
    return c.json({ ...extraction, truncated });
  } catch (error) {
    const clientGone = clientSignal.aborted;
    const deadlineHit = groqDeadline.aborted;
    if (!groqResponded || clientGone || deadlineHit) await refund();
    if (clientGone) return clientGoneResponse();
    if (deadlineHit) {
      // Same 502 shape as any other Groq failure — the client falls back.
      return c.json(
        { error: `Groq did not respond within ${groqTimeoutMs}ms.`, truncated: false },
        502,
      );
    }
    const message = error instanceof Error ? error.message : 'Unknown OCR error';
    // Groq's free-tier rate limit (429) is a distinct, expected, user-facing
    // situation — "try again shortly" — not a generic upstream failure.
    // Passed through as our own 429 so the client can show a specific
    // message instead of lumping it in with every other 502 case.
    const status = error instanceof GroqRequestError && error.status === 429 ? 429 : 502;
    return c.json({ error: message, truncated }, status);
  }
});
