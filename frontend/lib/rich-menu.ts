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

export interface SyncResultPayload {
  success?: boolean;
  message?: string;
  error?: string;
  image_upload_error?: string;
}

/** Interpret a POST /{id}/sync response body into a user-facing outcome.
 *  A 200 response can still carry `success:false` or `image_upload_error` —
 *  only checking `res.ok` showed success toasts for half-failed syncs. */
export function parseSyncResult(payload: SyncResultPayload | null): {
  ok: boolean;
  message: string;
} {
  if (!payload) {
    return { ok: false, message: 'ไม่ได้รับข้อมูลจากเซิร์ฟเวอร์' };
  }
  if (payload.image_upload_error) {
    return {
      ok: false,
      message: `เมนูถูกสร้างบน LINE แล้ว แต่อัปโหลดรูปไม่สำเร็จ (LINE จะไม่รับเมนูที่ไม่มีรูป): ${payload.image_upload_error}`,
    };
  }
  if (payload.success === false) {
    return { ok: false, message: payload.message || payload.error || 'Sync ไปยัง LINE ล้มเหลว' };
  }
  return { ok: true, message: payload.message || 'Sync ไปยัง LINE สำเร็จ' };
}
