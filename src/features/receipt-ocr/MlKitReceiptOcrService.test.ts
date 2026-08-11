import { toBlock, toLine, toRect } from './MlKitReceiptOcrService';

describe('toRect', () => {
  it('maps ML Kit frame (top/left) to the neutral Rect shape (x/y)', () => {
    expect(toRect({ top: 10, left: 20, width: 100, height: 40 })).toEqual({
      x: 20,
      y: 10,
      width: 100,
      height: 40,
    });
  });

  it('returns undefined when no frame is present', () => {
    expect(toRect(undefined)).toBeUndefined();
  });

  it('falls back to a bounding box from cornerPoints when frame is missing', () => {
    // Observed on a real device: frame absent, cornerPoints present.
    const points = [
      { x: 20, y: 10 },
      { x: 120, y: 10 },
      { x: 120, y: 50 },
      { x: 20, y: 50 },
    ] as const;
    expect(toRect(undefined, points)).toEqual({ x: 20, y: 10, width: 100, height: 40 });
  });

  it('prefers frame over cornerPoints when both are present', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 999, y: 0 },
      { x: 999, y: 999 },
      { x: 0, y: 999 },
    ] as const;
    expect(toRect({ top: 10, left: 20, width: 100, height: 40 }, points)).toEqual({
      x: 20,
      y: 10,
      width: 100,
      height: 40,
    });
  });
});

describe('toLine', () => {
  it('carries text and frame through, leaving confidence undefined', () => {
    const line = toLine({
      text: 'TOTAL 506.50',
      frame: { top: 1, left: 2, width: 3, height: 4 },
      elements: [],
      recognizedLanguages: [],
    });

    expect(line).toEqual({
      text: 'TOTAL 506.50',
      frame: { x: 2, y: 1, width: 3, height: 4 },
    });
    expect(line.confidence).toBeUndefined();
  });
});

describe('toBlock', () => {
  it('maps nested lines and never invents a confidence value', () => {
    const block = toBlock({
      text: 'TOTAL 506.50',
      frame: { top: 1, left: 2, width: 3, height: 4 },
      lines: [
        {
          text: 'TOTAL 506.50',
          frame: { top: 1, left: 2, width: 3, height: 4 },
          elements: [],
          recognizedLanguages: [],
        },
      ],
      recognizedLanguages: [],
    });

    expect(block.text).toBe('TOTAL 506.50');
    expect(block.lines).toHaveLength(1);
    expect(block.confidence).toBeUndefined();
  });
});
