import { describe, expect, it } from 'vitest';
import {
  OUTPUT_FORMATS,
  RESIZE_PRESETS,
  buildOutputFilename,
  computeLockedDimension,
  parseDimension,
} from '../image-utils';

describe('buildOutputFilename', () => {
  it('strips original extension and appends resize suffix', () => {
    expect(buildOutputFilename('my photo.png', 800, 600, 'webp')).toBe('my photo_resized_800x600.webp');
  });

  it('handles names with multiple dots', () => {
    expect(buildOutputFilename('banner.v2.final.jpg', 1200, 630, 'png')).toBe('banner.v2.final_resized_1200x630.png');
  });

  it('falls back to "image" when name has no base', () => {
    expect(buildOutputFilename('.png', 100, 100, 'jpg')).toBe('image_resized_100x100.jpg');
  });
});

describe('computeLockedDimension', () => {
  it('computes height from width preserving ratio', () => {
    expect(computeLockedDimension('width', 1250, 2500, 1686)).toBe(843);
  });

  it('computes width from height preserving ratio', () => {
    expect(computeLockedDimension('height', 843, 2500, 1686)).toBe(1250);
  });

  it('clamps to minimum 1', () => {
    expect(computeLockedDimension('width', 1, 10000, 1)).toBe(1);
  });

  it('rounds to nearest integer', () => {
    expect(computeLockedDimension('width', 100, 300, 200)).toBe(67);
  });

  it('returns value unchanged when source dimensions are zero', () => {
    expect(computeLockedDimension('width', 500, 0, 0)).toBe(500);
    expect(computeLockedDimension('height', 300, 0, 0)).toBe(300);
  });
});

describe('parseDimension', () => {
  it('accepts valid integers', () => {
    expect(parseDimension('1920')).toBe(1920);
    expect(parseDimension('1')).toBe(1);
    expect(parseDimension('10000')).toBe(10000);
  });

  it('rejects invalid values', () => {
    expect(parseDimension('')).toBeNull();
    expect(parseDimension('0')).toBeNull();
    expect(parseDimension('-5')).toBeNull();
    expect(parseDimension('10001')).toBeNull();
    expect(parseDimension('12.5')).toBeNull();
    expect(parseDimension('abc')).toBeNull();
  });
});

describe('RESIZE_PRESETS', () => {
  it('matches official LINE rich menu dimensions', () => {
    const large = RESIZE_PRESETS.find((p) => p.id === 'line-rich-large')!;
    expect(large).toMatchObject({ width: 2500, height: 1686 });

    const compact = RESIZE_PRESETS.find((p) => p.id === 'line-rich-compact')!;
    expect(compact).toMatchObject({ width: 2500, height: 843 });

    const hero = RESIZE_PRESETS.find((p) => p.id === 'line-flex-hero')!;
    expect(hero).toMatchObject({ width: 1040, height: 1040 });
  });
});

describe('OUTPUT_FORMATS', () => {
  it('marks only JPEG and WebP as lossy', () => {
    const byFormat = Object.fromEntries(OUTPUT_FORMATS.map((f) => [f.value, f.lossy]));
    expect(byFormat['image/png']).toBe(false);
    expect(byFormat['image/jpeg']).toBe(true);
    expect(byFormat['image/webp']).toBe(true);
  });

  it('JPEG does not support alpha', () => {
    const jpeg = OUTPUT_FORMATS.find((f) => f.value === 'image/jpeg')!;
    expect(jpeg.supportsAlpha).toBe(false);
    expect(jpeg.ext).toBe('jpg');
  });
});
