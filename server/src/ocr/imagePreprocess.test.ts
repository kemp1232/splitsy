import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { preprocessReceiptImage } from './imagePreprocess.js';

async function makeTestImage(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      // Not pure white/black — lets normalize() have contrast to stretch.
      background: { r: 180, g: 120, b: 60 },
    },
  })
    .jpeg()
    .toBuffer();
}

describe('preprocessReceiptImage', () => {
  it('converts to grayscale (single channel)', async () => {
    const input = await makeTestImage(100, 100);
    const output = await preprocessReceiptImage(input);
    const metadata = await sharp(output).metadata();
    expect(metadata.channels).toBe(1);
  });

  it('downsizes an image wider than the max width', async () => {
    const input = await makeTestImage(2000, 1000);
    const output = await preprocessReceiptImage(input, 1280);
    const metadata = await sharp(output).metadata();
    expect(metadata.width).toBe(1280);
    expect(metadata.height).toBe(640);
  });

  it('never upscales an image narrower than the max width', async () => {
    const input = await makeTestImage(400, 300);
    const output = await preprocessReceiptImage(input, 1280);
    const metadata = await sharp(output).metadata();
    expect(metadata.width).toBe(400);
  });

  it('outputs a decodable JPEG', async () => {
    const input = await makeTestImage(50, 50);
    const output = await preprocessReceiptImage(input);
    const metadata = await sharp(output).metadata();
    expect(metadata.format).toBe('jpeg');
  });
});
