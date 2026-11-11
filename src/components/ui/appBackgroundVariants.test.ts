import {
  APP_BACKGROUND_CONFIG,
  APP_BACKGROUND_VARIANTS,
  buildAmbientShapes,
} from './appBackgroundVariants';

describe('AppBackground variants', () => {
  it('defines exactly the five variants', () => {
    expect([...APP_BACKGROUND_VARIANTS].sort()).toEqual(
      ['default', 'form', 'hero', 'loading', 'summary'].sort(),
    );
    expect(Object.keys(APP_BACKGROUND_CONFIG).sort()).toEqual([...APP_BACKGROUND_VARIANTS].sort());
  });

  it.each(APP_BACKGROUND_VARIANTS)('has at least one ambient shape for "%s"', (variant) => {
    expect(APP_BACKGROUND_CONFIG[variant].length).toBeGreaterThan(0);
  });

  it.each(
    APP_BACKGROUND_VARIANTS.flatMap((variant) => [
      [variant, 390, 844] as const,
      [variant, 1280, 800] as const,
    ]),
  )('builds finite shapes inside the container for "%s" at %ix%i', (variant, width, height) => {
    const shapes = buildAmbientShapes(variant, width, height);
    expect(shapes).toHaveLength(APP_BACKGROUND_CONFIG[variant].length);
    for (const shape of shapes) {
      if (shape.kind === 'path') {
        expect(shape.d.length).toBeGreaterThan(0);
        const numbers = shape.d.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? [];
        expect(numbers.every(Number.isFinite)).toBe(true);
        // Every coordinate pair stays within the container (control points
        // may overshoot slightly vertically, never horizontally).
        const xs = numbers.filter((_, i) => i % 2 === 0);
        expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
        expect(Math.max(...xs)).toBeLessThanOrEqual(width);
      } else {
        expect(shape.r).toBeGreaterThan(0);
        expect(shape.cx).toBeLessThanOrEqual(width);
        expect(shape.cy).toBeLessThanOrEqual(height);
      }
    }
  });

  it('returns no shapes before the container has been measured', () => {
    expect(buildAmbientShapes('hero', 0, 0)).toEqual([]);
  });
});
