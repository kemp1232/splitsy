import { describe, expect, it } from 'vitest';

import { resolveModelTag } from './engines.js';

describe('resolveModelTag', () => {
  it('resolves qwen3.6-27b', () => {
    expect(resolveModelTag('qwen3.6-27b')).toBe('qwen/qwen3.6-27b');
  });

  it('throws on an unrecognized engine name', () => {
    expect(() => resolveModelTag('made-up-engine')).toThrow(/Unknown OCR_ENGINE/);
  });
});
