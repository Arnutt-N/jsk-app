/**
 * เปรียบเทียบค่าในฟอร์มกับ baseline (ข้อมูลจาก API) แล้วคืนเฉพาะ field ที่เปลี่ยน
 *
 * ใช้กับ edit mode ของหน้า request detail: payload ที่ส่งไป
 * PATCH /admin/requests/{id} ต้องมีเฉพาะ field ที่ผู้ใช้แก้จริง
 * (PATCH semantic ฝั่ง backend: field ที่ไม่ส่ง = ไม่อัปเดต,
 * empty string = ตั้งใจลบค่า)
 *
 * - baseline ที่เป็น null/undefined ถือว่าเทียบเท่า '' (legacy rows
 *   ส่ง null มาจาก API แต่ฟอร์ม snapshot เก็บเป็น '') — จึงไม่เกิด
 *   false positive ว่า "เปลี่ยน" ทั้งที่ผู้ใช้ไม่ได้แตะ
 * - เทียบเฉพาะ key ที่อยู่ในฟอร์ม key อื่นใน baseline ถูกข้าม
 */
export function buildChangedFields(
    form: Record<string, string>,
    baseline: Record<string, unknown>,
): Record<string, string> {
    const changed: Record<string, string> = {};
    for (const key of Object.keys(form)) {
        const baselineValue = baseline[key] ?? '';
        if (form[key] !== baselineValue) {
            changed[key] = form[key];
        }
    }
    return changed;
}
