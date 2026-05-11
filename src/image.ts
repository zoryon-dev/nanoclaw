/**
 * Host-side image normalisation.
 *
 * Converts any inbound image (including HEIC from iPhone) to JPEG and
 * resizes it so the longest edge is ≤ MAX_EDGE_PX. This ensures every
 * image arrives at the agent-runner formatter within the size + format
 * limits it enforces (≤ 6.7 MB base64, jpeg/png/gif/webp only).
 */
import sharp from 'sharp';

import { log } from './log.js';

/** Longest edge target (Claude's vision-friendly resolution). */
const MAX_EDGE_PX = 1568;

/** JPEG output quality (0-100). */
const JPEG_QUALITY = 85;

/**
 * Maximum byte-length of a base64-encoded image that the agent-runner
 * formatter accepts. Images already within this budget AND already JPEG
 * are passed through with only a format conversion (no resize).
 *
 * 6 700 000 base64 chars ≈ 5 MB raw. We use a slightly smaller threshold
 * so there's headroom after the JPEG re-encode.
 */
export const NEEDS_NORMALIZATION_THRESHOLD = 6_000_000; // base64 chars

/** Mime types that the agent-runner formatter accepts natively. */
const SUPPORTED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

export interface NormalizeResult {
  buffer: Buffer;
  mimeType: 'image/jpeg';
  width: number;
  height: number;
}

/**
 * Normalize an inbound image buffer:
 *  - Always outputs JPEG.
 *  - Resizes so longest edge ≤ MAX_EDGE_PX (preserving aspect ratio).
 *  - If the image is already small (longest edge ≤ MAX_EDGE_PX) AND
 *    already in a supported format, still converts to JPEG but skips resize.
 *
 * @throws if sharp cannot decode the buffer (caller should catch and fall back).
 */
export async function normalizeImage(buffer: Buffer, mimeType: string | undefined): Promise<NormalizeResult> {
  const meta = await sharp(buffer).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  const longestEdge = Math.max(width, height);

  const alreadySupported = SUPPORTED_MIME_TYPES.has(mimeType ?? '');
  const needsResize = longestEdge > MAX_EDGE_PX;

  // Build the sharp pipeline
  let pipeline = sharp(buffer);

  if (needsResize) {
    log.debug('normalizeImage: resizing', {
      from: { width, height, mimeType },
      to: { maxEdge: MAX_EDGE_PX },
    });
    pipeline = pipeline.resize(MAX_EDGE_PX, MAX_EDGE_PX, { fit: 'inside', withoutEnlargement: true });
  } else if (alreadySupported) {
    log.debug('normalizeImage: small supported image, converting to JPEG only', { width, height, mimeType });
  } else {
    log.debug('normalizeImage: unsupported format, converting to JPEG', { mimeType, width, height });
  }

  const outBuffer = await pipeline.jpeg({ quality: JPEG_QUALITY, mozjpeg: true }).toBuffer();
  const outMeta = await sharp(outBuffer).metadata();

  return {
    buffer: outBuffer,
    mimeType: 'image/jpeg',
    width: outMeta.width ?? width,
    height: outMeta.height ?? height,
  };
}
