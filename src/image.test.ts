/**
 * Unit tests for host-side image normalisation.
 * Run: npx vitest run src/image.test.ts
 */
import sharp from 'sharp';
import { describe, it, expect } from 'vitest';

import { normalizeImage, NEEDS_NORMALIZATION_THRESHOLD } from './image.js';

// ── helpers ──────────────────────────────────────────────────────────────────

/** Create a raw JPEG buffer at the requested pixel dimensions (solid colour). */
async function makeJpeg(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 100, g: 150, b: 200 } },
  })
    .jpeg({ quality: 80 })
    .toBuffer();
}

/** Create a small PNG buffer (solid colour). */
async function makePng(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 100, b: 50 } },
  })
    .png()
    .toBuffer();
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('normalizeImage', () => {
  it('resizes a large JPEG (4000×3000) to ≤1568px on longest edge', async () => {
    const input = await makeJpeg(4000, 3000);
    const { buffer, mimeType } = await normalizeImage(input, 'image/jpeg');

    const meta = await sharp(buffer).metadata();
    expect(mimeType).toBe('image/jpeg');
    expect(meta.format).toBe('jpeg');
    // Longest edge must be ≤ 1568 (landscape: width is longest)
    expect(meta.width).toBeLessThanOrEqual(1568);
    // Aspect ratio preserved: height ≈ width * 3/4
    expect(meta.height).toBeCloseTo((meta.width ?? 0) * (3 / 4), 0);
    // Output must be < 1.5 MB
    expect(buffer.byteLength).toBeLessThan(1.5 * 1024 * 1024);
  });

  it('converts a small PNG to JPEG without resize when already small', async () => {
    const input = await makePng(200, 150);
    const { buffer, mimeType } = await normalizeImage(input, 'image/png');

    const meta = await sharp(buffer).metadata();
    expect(mimeType).toBe('image/jpeg');
    expect(meta.format).toBe('jpeg');
    // Small image: dimensions unchanged
    expect(meta.width).toBe(200);
    expect(meta.height).toBe(150);
  });

  it('passes a small JPEG through with format preserved as JPEG', async () => {
    const input = await makeJpeg(640, 480);
    const { buffer, mimeType } = await normalizeImage(input, 'image/jpeg');

    const meta = await sharp(buffer).metadata();
    expect(mimeType).toBe('image/jpeg');
    expect(meta.format).toBe('jpeg');
    expect(meta.width).toBe(640);
    expect(meta.height).toBe(480);
  });

  it('converts a synthetic HEIC-like buffer by falling back to sharp decode', async () => {
    // We can't easily create a real HEIC in tests, so we use a WebP (unsupported
    // by formatter.ts) as a stand-in for "not jpeg/png/gif/webp accepted by agent".
    // The important thing: normalizeImage must return mimeType === 'image/jpeg'.
    const input = await sharp({
      create: { width: 100, height: 100, channels: 3, background: { r: 0, g: 0, b: 0 } },
    })
      .webp()
      .toBuffer();

    const { buffer, mimeType } = await normalizeImage(input, 'image/webp');
    const meta = await sharp(buffer).metadata();
    expect(mimeType).toBe('image/jpeg');
    expect(meta.format).toBe('jpeg');
  });

  it('resizes a tall portrait image correctly (longest edge = height)', async () => {
    const input = await makeJpeg(1000, 4000);
    const { buffer, mimeType } = await normalizeImage(input, 'image/jpeg');

    const meta = await sharp(buffer).metadata();
    expect(mimeType).toBe('image/jpeg');
    // Height is the longest edge; must be ≤ 1568
    expect(meta.height).toBeLessThanOrEqual(1568);
    // Width should scale proportionally
    expect(meta.width).toBeCloseTo((meta.height ?? 0) * (1000 / 4000), 0);
  });

  it('exports NEEDS_NORMALIZATION_THRESHOLD constant', () => {
    expect(typeof NEEDS_NORMALIZATION_THRESHOLD).toBe('number');
    expect(NEEDS_NORMALIZATION_THRESHOLD).toBeGreaterThan(0);
  });
});
