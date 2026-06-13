/**
 * ชื่อ field ภาษาไทยของ details/contact tabs — ใช้แสดง audit diff ใน timeline
 * หน้า request detail (action `edit_request_details`)
 *
 * ต้อง sync กับ EDITABLE_DETAIL_CONTACT_FIELDS ฝั่ง backend
 * (backend/app/api/v1/endpoints/admin_requests.py) และ label จริงในฟอร์ม
 * แท็บรายละเอียด/ผู้ติดต่อ — มี test กัน drift ใน __tests__/
 */
export const REQUEST_FIELD_LABELS: Record<string, string> = {
    topic_category: 'หมวดหมู่',
    topic_subcategory: 'ประเภท',
    description: 'รายละเอียดเพิ่มเติม',
    prefix: 'คำนำหน้า',
    firstname: 'ชื่อ',
    lastname: 'นามสกุล',
    phone_number: 'หมายเลขโทรศัพท์',
    email: 'อีเมล',
    sub_district: 'ตำบล/แขวง',
    district: 'อำเภอ/เขต',
    province: 'จังหวัด',
    agency: 'หน่วยงาน',
};

/** คืน label ไทย; field ที่ไม่รู้จัก (เช่น backend เพิ่มทีหลัง) คืนชื่อ field ดิบ */
export function getRequestFieldLabel(field: string): string {
    return REQUEST_FIELD_LABELS[field] ?? field;
}

// แท็บ "รายละเอียดคำร้อง" vs "ข้อมูลผู้ติดต่อ" — ใช้แยกว่า audit entry แก้ส่วนไหน
const DETAILS_FIELDS = new Set(['topic_category', 'topic_subcategory', 'description']);

/**
 * ป้ายกำกับ audit entry ตามกลุ่ม field ที่เปลี่ยน:
 * - ทุก field อยู่กลุ่มรายละเอียด → "แก้ไขรายละเอียดคำร้อง"
 * - ทุก field อยู่กลุ่มผู้ติดต่อ → "แก้ไขข้อมูลผู้ติดต่อ"
 * - ปนกัน/ไม่รู้จัก → "แก้ไขข้อมูลคำร้อง" (generic)
 */
export function getAuditEditScopeLabel(fields: string[]): string {
    if (fields.length === 0) return 'แก้ไขข้อมูลคำร้อง';
    const allDetails = fields.every((f) => DETAILS_FIELDS.has(f));
    if (allDetails) return 'แก้ไขรายละเอียดคำร้อง';
    const allContact = fields.every((f) => f in REQUEST_FIELD_LABELS && !DETAILS_FIELDS.has(f));
    if (allContact) return 'แก้ไขข้อมูลผู้ติดต่อ';
    return 'แก้ไขข้อมูลคำร้อง';
}
