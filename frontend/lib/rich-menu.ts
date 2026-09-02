// Rich-menu sync-state helpers — the ONE place that interprets sync status,
// so badge/button gating and toast handling never diverge between the list,
// new, and edit pages (mirrors backend RichMenuSyncStatus).

export const RichMenuSyncStatus = {
  PENDING: 'PENDING',
  SYNCED: 'SYNCED',
  FAILED: 'FAILED',
} as const;

export type RichMenuSyncStatusValue =
  (typeof RichMenuSyncStatus)[keyof typeof RichMenuSyncStatus];

export interface RichMenuSyncFields {
  line_rich_menu_id?: string | null;
  sync_status?: string | null;
  last_sync_error?: string | null;
}

/**
 * "Set Active" is only offered when the menu actually exists on LINE AND its
 * last sync succeeded — a FAILED sync (e.g. image upload rejected by LINE)
 * must not offer publishing (that is exactly how the old LINE 400 happened).
 */
export function canPublish(menu: RichMenuSyncFields): boolean {
  return !!menu.line_rich_menu_id && menu.sync_status === RichMenuSyncStatus.SYNCED;
}

/**
 * True when a synced menu has local edits that are NOT on LINE yet. The
 * backend flags PENDING on PUT/upload of a synced menu (LINE rich menus are
 * immutable — the next Sync recreates the menu there), so the UI must say
 * "รอซิงค์" instead of pretending the live copy is current.
 */
export function needsResync(menu: RichMenuSyncFields): boolean {
  return !!menu.line_rich_menu_id && menu.sync_status === RichMenuSyncStatus.PENDING;
}

// ---- Display settings (แสดงตลอดเวลา / ตามช่วงเวลา / ซ่อน) ------------------

export const RichMenuDisplayMode = {
  ALWAYS: 'ALWAYS',
  SCHEDULED: 'SCHEDULED',
  MANUAL: 'MANUAL',
} as const;

export type RichMenuDisplayModeValue =
  (typeof RichMenuDisplayMode)[keyof typeof RichMenuDisplayMode];

export interface RichMenuDisplayFields {
  status?: string | null;
  display_mode?: string | null;
  display_start_at?: string | null;
  display_end_at?: string | null;
}

export type RichMenuPillTone =
  | 'active'
  | 'error'
  | 'pending'
  | 'scheduled'
  | 'inactive'
  | 'hidden'
  | 'synced'
  | 'draft';

export interface RichMenuPill {
  label: string;
  tone: RichMenuPillTone;
  title?: string;
}

/** The ONE status-pill resolver shared by the list and edit pages, so the
 *  states can never diverge (sync state first, then display mode). */
export function menuStatusPill(
  menu: RichMenuSyncFields & RichMenuDisplayFields,
): RichMenuPill {
  if (menu.status === 'PUBLISHED' && !needsResync(menu)) {
    return { label: 'ACTIVE', tone: 'active' };
  }
  if (menu.sync_status === RichMenuSyncStatus.FAILED) {
    return { label: 'SYNC FAILED', tone: 'error', title: menu.last_sync_error || undefined };
  }
  if (needsResync(menu)) {
    return { label: 'รอซิงค์', tone: 'pending', title: 'แก้ไขในระบบแล้ว ยังไม่ส่งไป LINE' };
  }
  if (menu.display_mode === RichMenuDisplayMode.SCHEDULED) {
    if (menu.status === 'INACTIVE') {
      return { label: 'หมดเวลา', tone: 'inactive', title: 'ช่วงเวลาการแสดงผลจบแล้ว' };
    }
    const start = menu.display_start_at ? new Date(menu.display_start_at) : null;
    const end = menu.display_end_at ? new Date(menu.display_end_at) : null;
    const title =
      start && end && !isNaN(start.getTime()) && !isNaN(end.getTime())
        ? `แสดงตามเวลา: ${start.toLocaleString('th-TH')} – ${end.toLocaleString('th-TH')}`
        : 'แสดงตามช่วงเวลาที่กำหนด';
    return { label: 'ตามเวลา', tone: 'scheduled', title };
  }
  if (menu.display_mode === RichMenuDisplayMode.MANUAL && menu.status !== 'PUBLISHED') {
    return { label: 'ซ่อน', tone: 'hidden', title: 'ซิงค์แล้วแต่ไม่ตั้งเป็นเมนูหลัก (ใช้กับ alias / ผู้ใช้เฉพาะราย)' };
  }
  if (menu.line_rich_menu_id) {
    return { label: 'SYNCED', tone: 'synced' };
  }
  return { label: 'DRAFT', tone: 'draft' };
}

/** ISO string -> value usable by <input type="datetime-local"> in the user's
 *  local timezone (a plain slice(0,16) would show UTC, not local wall time). */
export function toLocalDatetimeInputValue(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export interface SyncResultPayload {
  success?: boolean;
  message?: string;
  error?: string;
  image_upload_error?: string;
  /** Sync rebuilt the menu on LINE (edits can't be applied in place). */
  recreated?: boolean;
  /** Non-fatal issues encountered while moving bindings to the new menu. */
  warnings?: string[];
}

/** Interpret a POST /{id}/sync response body into a user-facing outcome.
 *  A 200 response can still carry `success:false` or `image_upload_error` —
 *  only checking `res.ok` showed success toasts for half-failed syncs. */
export function parseSyncResult(payload: SyncResultPayload | null): {
  ok: boolean;
  message: string;
  recreated: boolean;
} {
  if (!payload) {
    return { ok: false, message: 'ไม่ได้รับข้อมูลจากเซิร์ฟเวอร์', recreated: false };
  }
  if (payload.image_upload_error) {
    return {
      ok: false,
      message: `เมนูถูกสร้างบน LINE แล้ว แต่อัปโหลดรูปไม่สำเร็จ (LINE จะไม่รับเมนูที่ไม่มีรูป): ${payload.image_upload_error}`,
      recreated: false,
    };
  }
  if (payload.success === false) {
    return {
      ok: false,
      message: payload.message || payload.error || 'Sync ไปยัง LINE ล้มเหลว',
      recreated: false,
    };
  }
  const warnings = payload.warnings?.length
    ? ` (${payload.warnings.join(' / ')})`
    : '';
  return {
    ok: true,
    message: (payload.message || 'Sync ไปยัง LINE สำเร็จ') + warnings,
    recreated: !!payload.recreated,
  };
}

// ---- Image auto-fit (LINE caps rich-menu image content at 1 MB) ----------
// The Messaging API rejects POST /v2/bot/richmenu/{id}/content bodies over
// 1 MB (HTTP 413) regardless of what LINE OA Manager's UI accepts. Files at
// or under the cap pass through untouched — never re-encode a fitting image
// (PNG alpha must survive); oversized ones are downscaled and JPEG-compressed
// client-side, which is what OA Manager does before its own upload.

export const RICH_MENU_IMAGE_LIMIT_BYTES = 1024 * 1024;
export const RICH_MENU_IMAGE_MAX_W = 2500;
export const RICH_MENU_IMAGE_MAX_H = 1686;

const RICH_MENU_FIT_GUIDANCE =
  'ไม่สามารถย่อรูปอัตโนมัติได้ — โปรดใช้รูปขนาดไม่เกิน 1 MB หรือย่อรูปที่หน้า /admin/image-resize ก่อนอัปโหลด';

export interface RichMenuFitAttempt {
  scale: number;
  quality: number;
}

/** Ordered downscale attempts, least-degradation first: keep full resolution
 *  and walk JPEG quality down before shrinking the image. */
export function planRichMenuFit(fileSize: number): {
  fits: boolean;
  attempts: RichMenuFitAttempt[];
} {
  if (fileSize <= RICH_MENU_IMAGE_LIMIT_BYTES) {
    return { fits: true, attempts: [] };
  }
  const attempts: RichMenuFitAttempt[] = [];
  for (const scale of [1, 0.75, 0.5, 0.35]) {
    for (const quality of [0.9, 0.8, 0.7, 0.6]) {
      attempts.push({ scale, quality });
    }
  }
  return { fits: false, attempts };
}

/** Largest rectangle fitting the box, aspect preserved, never upscaling. */
export function scaledToFit(
  width: number,
  height: number,
  maxW: number,
  maxH: number,
): { width: number; height: number } {
  const ratio = Math.min(maxW / width, maxH / height, 1);
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  };
}

export interface EnsureRichMenuImageResult {
  file: File | Blob;
  filename: string;
  converted: boolean;
}

function richMenuCanvasSupported(): boolean {
  try {
    return !!document.createElement('canvas').getContext('2d');
  } catch {
    return false;
  }
}

async function decodeRichMenuSource(
  file: File,
): Promise<{ source: CanvasImageSource; width: number; height: number; release: () => void }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file);
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        release: () => bitmap.close(),
      };
    } catch {
      // fall through to the Image element path
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('ไม่สามารถอ่านไฟล์รูปภาพได้'));
      el.src = url;
    });
    return {
      source: img,
      width: img.naturalWidth,
      height: img.naturalHeight,
      release: () => URL.revokeObjectURL(url),
    };
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
}

async function encodeRichMenuJpeg(
  source: CanvasImageSource,
  width: number,
  height: number,
  quality: number,
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error(RICH_MENU_FIT_GUIDANCE);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(source, 0, 0, width, height);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', quality),
  );
  if (!blob) throw new Error(RICH_MENU_FIT_GUIDANCE);
  return blob;
}

function toJpegFilename(name: string): string {
  return `${name.replace(/\.[^.]+$/, '') || 'image'}.jpg`;
}

/** Return an image at or under LINE's 1 MB cap. Fitting files pass through
 *  unchanged; oversized ones are downscaled + JPEG-compressed client-side.
 *  Throws when the browser cannot canvas-decode, so callers block the upload
 *  instead of POSTing a file LINE would refuse. */
export async function ensureRichMenuImage(file: File): Promise<EnsureRichMenuImageResult> {
  if (file.size <= RICH_MENU_IMAGE_LIMIT_BYTES) {
    return { file, filename: file.name, converted: false };
  }
  if (typeof document === 'undefined' || !richMenuCanvasSupported()) {
    throw new Error(RICH_MENU_FIT_GUIDANCE);
  }

  const decoded = await decodeRichMenuSource(file);
  try {
    const target = scaledToFit(
      decoded.width,
      decoded.height,
      RICH_MENU_IMAGE_MAX_W,
      RICH_MENU_IMAGE_MAX_H,
    );
    const { attempts } = planRichMenuFit(file.size);
    let best: Blob | null = null;
    for (const { scale, quality } of attempts) {
      const blob = await encodeRichMenuJpeg(
        decoded.source,
        Math.max(1, Math.round(target.width * scale)),
        Math.max(1, Math.round(target.height * scale)),
        quality,
      );
      if (!best || blob.size < best.size) best = blob;
      if (blob.size <= RICH_MENU_IMAGE_LIMIT_BYTES) {
        return { file: blob, filename: toJpegFilename(file.name), converted: true };
      }
    }
    // Every attempt is still over the cap (near-impossible for a 2500 px
    // JPEG): send the smallest encoding and let the backend's 413 mapping
    // deliver the final verdict — it is authoritative and now readable.
    if (!best) throw new Error(RICH_MENU_FIT_GUIDANCE);
    return { file: best, filename: toJpegFilename(file.name), converted: true };
  } finally {
    decoded.release();
  }
}
