import { describe, it, expect } from 'vitest';
import { REQUEST_FIELD_LABELS, getRequestFieldLabel, getAuditEditScopeLabel } from '../request-field-labels';

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

describe('getAuditEditScopeLabel', () => {
    it('labels a details-only edit', () => {
        expect(getAuditEditScopeLabel(['topic_category', 'description'])).toBe('แก้ไขรายละเอียดคำร้อง');
    });

    it('labels a contact-only edit (incl. address fields)', () => {
        expect(getAuditEditScopeLabel(['phone_number', 'province', 'district'])).toBe('แก้ไขข้อมูลผู้ติดต่อ');
    });

    it('falls back to the generic label for a mixed edit', () => {
        expect(getAuditEditScopeLabel(['description', 'phone_number'])).toBe('แก้ไขข้อมูลคำร้อง');
    });

    it('falls back to the generic label for empty or unknown fields', () => {
        expect(getAuditEditScopeLabel([])).toBe('แก้ไขข้อมูลคำร้อง');
        expect(getAuditEditScopeLabel(['mystery_field'])).toBe('แก้ไขข้อมูลคำร้อง');
    });
});
