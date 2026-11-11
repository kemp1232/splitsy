// Pure data + geometry behind AppBackground.tsx (kept React-free so it can be
// unit-tested without rendering SVG). Each variant is a short list of soft,
// organic "ambient" shapes rising from the screen's corners, sized as
// fractions of the measured container (never hardcoded screen dimensions).

export type AppBackgroundVariant = 'default' | 'hero' | 'form' | 'summary' | 'loading';

export const APP_BACKGROUND_VARIANTS: readonly AppBackgroundVariant[] = [
  'default',
  'hero',
  'form',
  'summary',
  'loading',
];

export type AmbientTone = 'ambient' | 'ambientStrong';

type CornerSpec = {
  kind: 'corner';
  corner: 'bottomLeft' | 'bottomRight' | 'topRight';
  // Fraction of the container height the shape reaches into the screen.
  heightFrac: number;
  // Fraction of the container width the shape spans along its edge.
  widthFrac: number;
  tone: AmbientTone;
  // Fill opacity at the shape's outer edge (screen corner) and at its inner,
  // wavy edge — the fade between the two is what keeps the edge soft.
  edgeOpacity: number;
  innerOpacity: number;
};

type GlowSpec = {
  kind: 'glow';
  // Center, as fractions of the container size, and radius as a fraction of
  // its shorter side.
  cxFrac: number;
  cyFrac: number;
  radiusFrac: number;
  tone: AmbientTone;
  opacity: number;
};

export type AmbientShapeSpec = CornerSpec | GlowSpec;

export const APP_BACKGROUND_CONFIG: Record<AppBackgroundVariant, readonly AmbientShapeSpec[]> = {
  default: [
    {
      kind: 'corner',
      corner: 'bottomLeft',
      heightFrac: 0.16,
      widthFrac: 0.6,
      tone: 'ambient',
      edgeOpacity: 1,
      innerOpacity: 0.55,
    },
    {
      kind: 'corner',
      corner: 'bottomRight',
      heightFrac: 0.24,
      widthFrac: 0.72,
      tone: 'ambient',
      edgeOpacity: 1,
      innerOpacity: 0.5,
    },
  ],
  hero: [
    {
      kind: 'corner',
      corner: 'topRight',
      heightFrac: 0.16,
      widthFrac: 0.5,
      tone: 'ambient',
      edgeOpacity: 0.9,
      innerOpacity: 0.35,
    },
    {
      kind: 'corner',
      corner: 'bottomLeft',
      heightFrac: 0.22,
      widthFrac: 0.62,
      tone: 'ambient',
      edgeOpacity: 1,
      innerOpacity: 0.55,
    },
    {
      kind: 'corner',
      corner: 'bottomRight',
      heightFrac: 0.3,
      widthFrac: 0.78,
      tone: 'ambientStrong',
      edgeOpacity: 0.85,
      innerOpacity: 0.35,
    },
  ],
  form: [
    {
      kind: 'corner',
      corner: 'bottomLeft',
      heightFrac: 0.12,
      widthFrac: 0.5,
      tone: 'ambient',
      edgeOpacity: 0.9,
      innerOpacity: 0.45,
    },
    {
      kind: 'corner',
      corner: 'bottomRight',
      heightFrac: 0.17,
      widthFrac: 0.62,
      tone: 'ambient',
      edgeOpacity: 0.9,
      innerOpacity: 0.45,
    },
  ],
  summary: [
    {
      kind: 'corner',
      corner: 'topRight',
      heightFrac: 0.12,
      widthFrac: 0.42,
      tone: 'ambient',
      edgeOpacity: 0.85,
      innerOpacity: 0.3,
    },
    {
      kind: 'corner',
      corner: 'bottomLeft',
      heightFrac: 0.18,
      widthFrac: 0.6,
      tone: 'ambient',
      edgeOpacity: 1,
      innerOpacity: 0.5,
    },
    {
      kind: 'corner',
      corner: 'bottomRight',
      heightFrac: 0.26,
      widthFrac: 0.72,
      tone: 'ambientStrong',
      edgeOpacity: 0.8,
      innerOpacity: 0.3,
    },
  ],
  loading: [
    {
      kind: 'glow',
      cxFrac: 0.5,
      cyFrac: 0.42,
      radiusFrac: 0.62,
      tone: 'ambientStrong',
      opacity: 0.7,
    },
    {
      kind: 'corner',
      corner: 'bottomLeft',
      heightFrac: 0.14,
      widthFrac: 0.55,
      tone: 'ambient',
      edgeOpacity: 1,
      innerOpacity: 0.5,
    },
    {
      kind: 'corner',
      corner: 'bottomRight',
      heightFrac: 0.2,
      widthFrac: 0.68,
      tone: 'ambient',
      edgeOpacity: 1,
      innerOpacity: 0.5,
    },
  ],
};

// How wide a corner shape may grow on a very wide (desktop web) viewport, so
// it stays an organic corner accent instead of a full-width band.
const MAX_SHAPE_WIDTH = 640;

export type AmbientPath = {
  kind: 'path';
  d: string;
  tone: AmbientTone;
  // Gradient axis (absolute y coordinates) from the outer edge to the inner
  // wavy edge, with their opacities.
  y1: number;
  y2: number;
  edgeOpacity: number;
  innerOpacity: number;
};

export type AmbientGlow = {
  kind: 'glow';
  cx: number;
  cy: number;
  r: number;
  tone: AmbientTone;
  opacity: number;
};

export type AmbientShape = AmbientPath | AmbientGlow;

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

// One gently double-curved ("wavy") edge from the screen's side to its
// bottom/top edge — a cubic followed by a smooth (S) continuation.
function cornerPath(spec: CornerSpec, width: number, height: number): AmbientPath {
  const span = Math.min(width * spec.widthFrac, MAX_SHAPE_WIDTH);
  const reach = height * spec.heightFrac;
  const r = round;

  if (spec.corner === 'topRight') {
    const x0 = width;
    const d = [
      `M${r(x0)} 0`,
      `L${r(x0)} ${r(reach)}`,
      `C${r(x0 - span * 0.22)} ${r(reach * 1.12)} ${r(x0 - span * 0.42)} ${r(reach * 0.55)} ${r(x0 - span * 0.6)} ${r(reach * 0.45)}`,
      `S${r(x0 - span * 0.9)} ${r(reach * 0.12)} ${r(x0 - span)} 0`,
      'Z',
    ].join(' ');
    return {
      kind: 'path',
      d,
      tone: spec.tone,
      y1: 0,
      y2: reach,
      edgeOpacity: spec.edgeOpacity,
      innerOpacity: spec.innerOpacity,
    };
  }

  const top = height - reach;
  const left = spec.corner === 'bottomLeft';
  // Mirrors x for the right-hand corner.
  const x = (offset: number) => r(left ? offset : width - offset);
  const d = [
    `M${x(0)} ${r(height)}`,
    `L${x(0)} ${r(top)}`,
    `C${x(span * 0.22)} ${r(top - reach * 0.14)} ${x(span * 0.42)} ${r(top + reach * 0.42)} ${x(span * 0.6)} ${r(top + reach * 0.5)}`,
    `S${x(span * 0.9)} ${r(height - reach * 0.12)} ${x(span)} ${r(height)}`,
    'Z',
  ].join(' ');
  return {
    kind: 'path',
    d,
    tone: spec.tone,
    y1: height,
    y2: top,
    edgeOpacity: spec.edgeOpacity,
    innerOpacity: spec.innerOpacity,
  };
}

export function buildAmbientShapes(
  variant: AppBackgroundVariant,
  width: number,
  height: number,
): AmbientShape[] {
  if (width <= 0 || height <= 0) return [];
  return APP_BACKGROUND_CONFIG[variant].map((spec) => {
    if (spec.kind === 'glow') {
      return {
        kind: 'glow',
        cx: round(width * spec.cxFrac),
        cy: round(height * spec.cyFrac),
        r: round(Math.min(width, height) * spec.radiusFrac),
        tone: spec.tone,
        opacity: spec.opacity,
      };
    }
    return cornerPath(spec, width, height);
  });
}
