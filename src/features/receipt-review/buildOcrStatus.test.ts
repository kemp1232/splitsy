import { copy } from '@/constants/copy';

import { buildOcrStatus } from './buildOcrStatus';

const r = copy.receiptReview;

describe('buildOcrStatus', () => {
  it('returns null when there is no OCR source (reopened draft)', () => {
    expect(buildOcrStatus(undefined, undefined, false)).toBeNull();
  });

  it('shows the AI-checked success card with the handwriting note for a full backend read', () => {
    expect(buildOcrStatus('backend', undefined, false)).toEqual({
      tone: 'success',
      title: r.aiCheckedTitle,
      body: r.aiCheckedBody,
      notes: [{ text: r.handwritingNote, tone: 'textSecondary' }],
    });
  });

  it('shows a warning card with handwriting and truncated notes for a truncated backend read', () => {
    expect(buildOcrStatus('backend', undefined, true)).toEqual({
      tone: 'warning',
      title: r.ocrSourceBackend,
      body: null,
      notes: [
        { text: r.handwritingNote, tone: 'textSecondary' },
        { text: r.truncatedNote, tone: 'warning' },
      ],
    });
  });

  it('shows a neutral on-device card with no notes when there was no fallback reason', () => {
    expect(buildOcrStatus('on-device', undefined, false)).toEqual({
      tone: 'neutral',
      title: r.ocrSourceOnDevice,
      body: null,
      notes: [],
    });
  });

  it('shows a warning on-device card with the rate-limit note after a rate-limited fallback', () => {
    expect(buildOcrStatus('on-device', 'rate_limited', false)).toEqual({
      tone: 'warning',
      title: r.ocrSourceOnDevice,
      body: null,
      notes: [{ text: r.rateLimitedNote, tone: 'warning' }],
    });
  });

  it('shows a warning on-device card with the truncated note after a token-limit fallback', () => {
    expect(buildOcrStatus('on-device', 'token_limit_truncated', false)).toEqual({
      tone: 'warning',
      title: r.ocrSourceOnDevice,
      body: null,
      notes: [{ text: r.truncatedNote, tone: 'warning' }],
    });
  });
});
