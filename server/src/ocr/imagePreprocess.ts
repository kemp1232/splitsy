import sharp from 'sharp';

// Receipts are effectively black text on paper — color carries no information
// the VLM needs, and dropping it removes tint/shadow noise from a phone photo
// for free.
//
// Deliberately NOT a hard black/white threshold: naive binarization clips any
// pixel below/above a cutoff to pure black or white, which can wipe out
// faint thermal-print text entirely — exactly the failure mode this exists to
// fix. `.normalize()` stretches existing contrast to the full range instead,
// boosting legibility without discarding faded detail.
//
// Resizing down trades resolution for fewer image tokens (faster inference,
// smaller upload) — the client already caps at 1600px wide before upload, this
// is a second, tunable cap specifically for what the model receives.
const DEFAULT_MAX_WIDTH = 1280;

export async function preprocessReceiptImage(
  input: Buffer,
  maxWidth: number = DEFAULT_MAX_WIDTH,
): Promise<Buffer> {
  return (
    sharp(input)
      .resize({ width: maxWidth, withoutEnlargement: true })
      .grayscale()
      // `.grayscale()` alone still encodes as a 3-channel sRGB JPEG (R=G=B) —
      // this is what actually drops it to a single-channel image on output.
      .toColourspace('b-w')
      .normalize()
      .sharpen()
      .jpeg({ quality: 90 })
      .toBuffer()
  );
}
