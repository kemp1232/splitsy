import { describe, expect, it } from 'vitest';

import { resolveModelTag } from './engines.js';

describe('resolveModelTag', () => {
  it('resolves qwen3-vl', () => {
    expect(resolveModelTag('qwen3-vl')).toBe('qwen3-vl:4b');
  });

  it('resolves qwen3-vl-8b', () => {
    expect(resolveModelTag('qwen3-vl-8b')).toBe('qwen3-vl:8b');
  });

  it('resolves paddleocr-vl', () => {
    expect(resolveModelTag('paddleocr-vl')).toBe('MedAIBase/PaddleOCR-VL:0.9b');
  });

  it('resolves minicpm-v', () => {
    expect(resolveModelTag('minicpm-v')).toBe('minicpm-v');
  });

  it('throws on an unrecognized engine name', () => {
    expect(() => resolveModelTag('made-up-engine')).toThrow(/Unknown OCR_ENGINE/);
  });
});
