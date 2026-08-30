import { describe, expect, it } from 'vitest';
import {
  RICH_MENU_IMAGE_LIMIT_BYTES,
  ensureRichMenuImage,
  planRichMenuFit,
  scaledToFit,
} from '../rich-menu';

/**
 * Unit tests for the rich-menu image auto-fit helpers (PRD 2026-08-31):
 * LINE caps rich-menu image content at 1 MB — fitting files must pass
 * through untouched (PNG alpha survives); oversized files get a scale ×
 * quality attempt ladder; browsers without canvas must block the upload
 * instead of POSTing a file LINE would refuse.
 */

describe('planRichMenuFit', () => {
  it('marks files at or under 1 MB as fitting with no attempts', () => {
    expect(planRichMenuFit(RICH_MENU_IMAGE_LIMIT_BYTES)).toEqual({ fits: true, attempts: [] });
    expect(planRichMenuFit(RICH_MENU_IMAGE_LIMIT_BYTES - 1)).toEqual({ fits: true, attempts: [] });
  });

  it('starts oversized plans at full scale and highest quality', () => {
    const { fits, attempts } = planRichMenuFit(RICH_MENU_IMAGE_LIMIT_BYTES + 1);
    expect(fits).toBe(false);
    expect(attempts[0]).toEqual({ scale: 1, quality: 0.9 });
  });

  it('walks quality down before shrinking the image', () => {
    const { attempts } = planRichMenuFit(5 * 1024 * 1024);
    expect(attempts[1]).toEqual({ scale: 1, quality: 0.8 });
    expect(attempts[4]).toEqual({ scale: 0.75, quality: 0.9 });
  });

  it('ends at the smallest, lowest-quality attempt', () => {
    const { attempts } = planRichMenuFit(5 * 1024 * 1024);
    expect(attempts).toHaveLength(16);
    expect(attempts[attempts.length - 1]).toEqual({ scale: 0.35, quality: 0.6 });
  });
});

describe('scaledToFit', () => {
  it('keeps the size when already inside the box', () => {
    expect(scaledToFit(2000, 1200, 2500, 1686)).toEqual({ width: 2000, height: 1200 });
  });

  it('clamps the long edge preserving aspect ratio', () => {
    expect(scaledToFit(4000, 2000, 2500, 1686)).toEqual({ width: 2500, height: 1250 });
  });

  it('clamps by height for tall sources', () => {
    const fitted = scaledToFit(1000, 3000, 2500, 1686);
    expect(fitted.height).toBe(1686);
    expect(Math.round((fitted.width / fitted.height) * 1000)).toBe(333);
  });
});

describe('ensureRichMenuImage', () => {
  it('passes fitting files through untouched (same object, no conversion)', async () => {
    const file = new File([new Uint8Array(10)], 'menu.png', { type: 'image/png' });
    const result = await ensureRichMenuImage(file);
    expect(result.file).toBe(file);
    expect(result.filename).toBe('menu.png');
    expect(result.converted).toBe(false);
  });

  it('blocks oversized files with guidance when canvas is unavailable', async () => {
    // jsdom has no 2d canvas, so the degraded-browser branch is the real path here
    const file = new File([new Uint8Array(RICH_MENU_IMAGE_LIMIT_BYTES + 1)], 'big.png', {
      type: 'image/png',
    });
    await expect(ensureRichMenuImage(file)).rejects.toThrow('/admin/image-resize');
  });
});
