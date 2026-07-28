export type OutputFormat = 'image/png' | 'image/jpeg' | 'image/webp';

export interface FormatOption {
  value: OutputFormat;
  label: string;
  lossy: boolean;
  supportsAlpha: boolean;
  ext: string;
}

export const OUTPUT_FORMATS: FormatOption[] = [
  { value: 'image/png', label: 'PNG', lossy: false, supportsAlpha: true, ext: 'png' },
  { value: 'image/jpeg', label: 'JPEG', lossy: true, supportsAlpha: false, ext: 'jpg' },
  { value: 'image/webp', label: 'WebP', lossy: true, supportsAlpha: true, ext: 'webp' },
];

export interface ResizePreset {
  id: string;
  label: string;
  width: number;
  height: number;
  group: 'line' | 'general';
}

export const RESIZE_PRESETS: ResizePreset[] = [
  { id: 'line-rich-large', label: 'Rich Menu Large', width: 2500, height: 1686, group: 'line' },
  { id: 'line-rich-compact', label: 'Rich Menu Compact', width: 2500, height: 843, group: 'line' },
  { id: 'line-flex-hero', label: 'Flex Hero', width: 1040, height: 1040, group: 'line' },
  { id: 'og-image', label: 'OG Image', width: 1200, height: 630, group: 'general' },
  { id: 'square-1080', label: 'Square 1:1', width: 1080, height: 1080, group: 'general' },
];

export const ACCEPTED_TYPES: Record<string, string[]> = {
  'image/png': ['.png'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/webp': ['.webp'],
  'image/gif': ['.gif'],
};

export const MAX_SOURCE_BYTES = 25 * 1024 * 1024;
export const MAX_MEDIA_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_DIMENSION = 10000;

export function buildOutputFilename(originalName: string, w: number, h: number, ext: string): string {
  const base = originalName.replace(/\.[^.]+$/, '') || 'image';
  return `${base}_resized_${w}x${h}.${ext}`;
}

export function computeLockedDimension(
  changed: 'width' | 'height',
  value: number,
  sourceW: number,
  sourceH: number,
): number {
  if (sourceW === 0 || sourceH === 0) return value;
  const ratio = changed === 'width' ? sourceH / sourceW : sourceW / sourceH;
  return Math.max(1, Math.round(value * ratio));
}

export function parseDimension(raw: string): number | null {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > MAX_DIMENSION) return null;
  return n;
}

export async function decodeDimensions(file: File): Promise<{ width: number; height: number }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file);
      const dims = { width: bitmap.width, height: bitmap.height };
      bitmap.close();
      return dims;
    } catch {
      // fall through to Image-based decode
    }
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('ไม่สามารถอ่านไฟล์รูปภาพได้'));
    };
    img.src = url;
  });
}

export async function resizeImage(
  file: File,
  width: number,
  height: number,
  format: OutputFormat,
  quality: number,
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('เบราว์เซอร์ไม่รองรับ Canvas');

  let bitmap: ImageBitmap | null = null;
  let fallbackUrl: string | null = null;
  let source: CanvasImageSource | null = null;

  try {
    if (typeof createImageBitmap === 'function') {
      try {
        bitmap = await createImageBitmap(file);
        source = bitmap;
      } catch {
        bitmap = null;
      }
    }
    if (!bitmap) {
      fallbackUrl = URL.createObjectURL(file);
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error('ไม่สามารถอ่านไฟล์รูปภาพได้'));
        el.src = fallbackUrl!;
      });
      source = img;
    }

    if (!source) throw new Error('ไม่สามารถอ่านไฟล์รูปภาพได้');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    if (format === 'image/jpeg') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
    }
    ctx.drawImage(source, 0, 0, width, height);
  } finally {
    bitmap?.close();
    if (fallbackUrl) URL.revokeObjectURL(fallbackUrl);
  }

  const isLossy = OUTPUT_FORMATS.find((f) => f.value === format)?.lossy ?? false;
  const safeQuality = Math.min(1, Math.max(0, quality));
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('ไม่สามารถแปลงรูปภาพได้ — ลองเปลี่ยนรูปแบบไฟล์'));
      },
      format,
      isLossy ? safeQuality : undefined,
    );
  });
}
