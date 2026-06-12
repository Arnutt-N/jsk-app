/**
 * รวม comments + audit entries เป็น timeline เดียวของแท็บ "การดำเนินงาน/ความเห็น"
 *
 * แหล่งข้อมูล 2 ทาง:
 * - comments: GET /admin/requests/{id}/comments (เรียงเก่า→ใหม่)
 * - audits:   GET /admin/audit/logs?resource_id=... (เรียงใหม่→เก่า)
 * ลำดับจาก API ต่างกัน — ฟังก์ชันนี้ sort ใหม่ทั้งหมด ไม่พึ่งลำดับขาเข้า
 */

/** รูปร่าง audit log จาก GET /admin/audit/logs (Phase 1) */
export interface AuditFieldChange {
    old: string | null;
    new: string | null;
}

export interface AuditLogEntry {
    id: number;
    admin_name: string | null;
    action: string;
    details: { fields?: Record<string, AuditFieldChange> } | null;
    created_at: string | null;
}

export interface TimelineComment {
    id: number;
    content: string;
    user_id: number;
    display_name: string;
    created_at: string;
}

export type TimelineItem =
    | { kind: 'comment'; createdAt: string; comment: TimelineComment }
    | { kind: 'audit'; createdAt: string; audit: AuditLogEntry };

/**
 * รวม comments + audit entries เรียงเวลาเก่า→ใหม่
 * - timestamp เท่ากัน: audit มาก่อน comment (การแก้ข้อมูลเกิดก่อนการคุยถึงผลการแก้)
 * - audit ที่ไม่มี created_at หรือไม่มี fields diff ถูกตัดทิ้ง (payload ผิดรูป
 *   ไม่ควรทำให้ timeline ทั้งแท็บพัง)
 */
export function mergeTimeline(
    comments: TimelineComment[],
    audits: AuditLogEntry[],
): TimelineItem[] {
    const items: TimelineItem[] = [
        ...audits
            .filter((a) => a.created_at && a.details?.fields && Object.keys(a.details.fields).length > 0)
            .map((a) => ({ kind: 'audit' as const, createdAt: a.created_at as string, audit: a })),
        ...comments.map((c) => ({ kind: 'comment' as const, createdAt: c.created_at, comment: c })),
    ];
    // Array.prototype.sort เป็น stable (ES2019+) — ลำดับเดิมภายในชนิดเดียวกันคงอยู่
    return items.sort((x, y) => {
        const dx = new Date(x.createdAt).getTime();
        const dy = new Date(y.createdAt).getTime();
        if (dx !== dy) return dx - dy;
        if (x.kind === y.kind) return 0;
        return x.kind === 'audit' ? -1 : 1;
    });
}
