import { describe, it, expect } from 'vitest';
import { REQUEST_FIELD_LABELS, getRequestFieldLabel } from '../request-field-labels';

// ต้องตรงกับ EDITABLE_DETAIL_CONTACT_FIELDS ฝั่ง backend
// (backend/app/api/v1/endpoints/admin_requests.py) — ถ้า backend เพิ่ม/ลบ field
// ให้แก้ทั้งสองที่พร้อมกัน
const EXPECTED_FIELDS = [
    'topic_category',
    'topic_subcategory',
    'description',
    'prefix',
    'firstname',
    'lastname',
    'phone_number',
    'email',
    'sub_district',
    'district',
    'province',
    'agency',
];

describe('REQUEST_FIELD_LABELS', () => {
    it('covers exactly the 12 editable detail/contact fields', () => {
        expect(Object.keys(REQUEST_FIELD_LABELS).sort()).toEqual([...EXPECTED_FIELDS].sort());
    });

    it('every label is a non-empty Thai string', () => {
        for (const field of EXPECTED_FIELDS) {
            expect(REQUEST_FIELD_LABELS[field]).toBeTruthy();
        }
    });
});

describe('getRequestFieldLabel', () => {
    it('returns the Thai label for a known field', () => {
        expect(getRequestFieldLabel('phone_number')).toBe('หมายเลขโทรศัพท์');
        expect(getRequestFieldLabel('agency')).toBe('หน่วยงาน');
    });

    it('falls back to the raw field name for unknown fields', () => {
        expect(getRequestFieldLabel('future_field')).toBe('future_field');
    });
});
