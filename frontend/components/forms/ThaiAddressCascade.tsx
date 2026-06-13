'use client';

import { useEffect, useState } from 'react';
import type { Province, District, SubDistrict } from '@/types/location';
import { logger } from '@/lib/logger';
import { FormSelect } from '@/components/forms/FormSelect';

export interface ThaiAddress {
    province: string;
    district: string;
    sub_district: string;
}

interface ThaiAddressCascadeProps {
    value: ThaiAddress;
    onChange: (next: ThaiAddress) => void;
    labelClassName?: string;
}

const DEFAULT_LABEL_CLASS =
    'text-[11px] font-bold uppercase tracking-wider text-text-tertiary';

/**
 * Dropdown ที่อยู่แบบลำดับชั้น จังหวัด → อำเภอ/เขต → ตำบล/แขวง
 * ใช้ /api/v1/locations/* ชุดเดียวกับฟอร์ม LIFF (request-v2) เพื่อ unity/consistency
 *
 * ข้อกำหนดสำคัญสำหรับ edit mode:
 * - value เก็บ "ชื่อไทย" (ตรงกับคอลัมน์ใน service_requests) ไม่ใช่ ID —
 *   component จับคู่ชื่อ → ID หลังโหลดรายการเพื่อ preselect ค่าเดิม
 * - ห้ามเรียก onChange ตอน mount/preselect เด็ดขาด: มิฉะนั้น diff ฝั่งฟอร์ม
 *   (buildChangedFields) จะเห็นค่าถูกล้างแล้วบันทึกทับข้อมูลจริง
 * - ค่าเดิมที่ไม่อยู่ในชุดข้อมูล (legacy free-text) แสดงค้างบน option ว่าง
 *   จนกว่าผู้ใช้จะเลือกใหม่ — pattern เดียวกับ legacy passthrough ของ CATEGORIES
 *
 * โครง markup เป็น fragment 3 บล็อก (จังหวัด col-span-2, อำเภอ, ตำบล)
 * ออกแบบให้วางใน grid 2 คอลัมน์ของฟอร์มผู้ติดต่อ
 */
export function ThaiAddressCascade({
    value,
    onChange,
    labelClassName = DEFAULT_LABEL_CLASS,
}: ThaiAddressCascadeProps) {
    const [provinces, setProvinces] = useState<Province[]>([]);
    const [districts, setDistricts] = useState<District[]>([]);
    const [subDistricts, setSubDistricts] = useState<SubDistrict[]>([]);
    const [loadingDistricts, setLoadingDistricts] = useState(false);
    const [loadingSubDistricts, setLoadingSubDistricts] = useState(false);

    const selectedProvince = provinces.find((p) => p.PROVINCE_THAI === value.province);
    const selectedDistrict = districts.find((d) => d.DISTRICT_THAI === value.district);
    const selectedSubDistrict = subDistricts.find((s) => s.SUB_DISTRICT_THAI === value.sub_district);
    const provinceId = selectedProvince?.PROVINCE_ID ?? null;
    const districtId = selectedDistrict?.DISTRICT_ID ?? null;

    useEffect(() => {
        let cancelled = false;
        const fetchProvinces = async () => {
            try {
                const res = await fetch('/api/v1/locations/provinces');
                if (!res.ok) throw new Error('Failed to load provinces');
                const data = await res.json();
                if (!cancelled) setProvinces(data);
            } catch (err) {
                logger.error('Provinces fetch error:', err);
            }
        };
        void fetchProvinces();
        return () => { cancelled = true; };
    }, []);

    // โหลดอำเภอเมื่อรู้จังหวัด (ครอบคลุมทั้ง preselect จากค่าเดิมและการเลือกใหม่)
    useEffect(() => {
        if (!provinceId) {
            setDistricts([]);
            return;
        }
        let cancelled = false;
        const fetchDistricts = async () => {
            setLoadingDistricts(true);
            try {
                const res = await fetch(`/api/v1/locations/provinces/${provinceId}/districts`);
                if (!res.ok) throw new Error('Failed to load districts');
                const data = await res.json();
                if (!cancelled) setDistricts(data);
            } catch (err) {
                logger.error('Districts fetch error:', err);
            } finally {
                if (!cancelled) setLoadingDistricts(false);
            }
        };
        void fetchDistricts();
        return () => { cancelled = true; };
    }, [provinceId]);

    // โหลดตำบลเมื่อรู้อำเภอ
    useEffect(() => {
        if (!districtId) {
            setSubDistricts([]);
            return;
        }
        let cancelled = false;
        const fetchSubDistricts = async () => {
            setLoadingSubDistricts(true);
            try {
                const res = await fetch(`/api/v1/locations/districts/${districtId}/sub-districts`);
                if (!res.ok) throw new Error('Failed to load sub-districts');
                const data = await res.json();
                if (!cancelled) setSubDistricts(data);
            } catch (err) {
                logger.error('Sub-districts fetch error:', err);
            } finally {
                if (!cancelled) setLoadingSubDistricts(false);
            }
        };
        void fetchSubDistricts();
        return () => { cancelled = true; };
    }, [districtId]);

    const handleProvinceChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const p = provinces.find((x) => x.PROVINCE_ID === Number(e.target.value));
        onChange({ province: p?.PROVINCE_THAI || '', district: '', sub_district: '' });
    };

    const handleDistrictChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const d = districts.find((x) => x.DISTRICT_ID === Number(e.target.value));
        onChange({ ...value, district: d?.DISTRICT_THAI || '', sub_district: '' });
    };

    const handleSubDistrictChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const s = subDistricts.find((x) => x.SUB_DISTRICT_ID === Number(e.target.value));
        onChange({ ...value, sub_district: s?.SUB_DISTRICT_THAI || '' });
    };

    // legacy passthrough: ค่าเดิมที่หาไม่เจอในชุดข้อมูล แสดงบน option ว่างแทน placeholder
    const provincePlaceholder = value.province && !selectedProvince
        ? `${value.province} (ค่าเดิม)` : '— เลือกจังหวัด —';
    const districtPlaceholder = value.district && !selectedDistrict
        ? `${value.district} (ค่าเดิม)` : loadingDistricts ? 'กำลังโหลด...' : '— เลือกอำเภอ/เขต —';
    const subDistrictPlaceholder = value.sub_district && !selectedSubDistrict
        ? `${value.sub_district} (ค่าเดิม)` : loadingSubDistricts ? 'กำลังโหลด...' : '— เลือกตำบล/แขวง —';

    return (
        <>
            <div className="space-y-1 md:col-span-2">
                <label htmlFor="edit-province" className={labelClassName}>จังหวัด</label>
                <FormSelect
                    id="edit-province"
                    value={provinceId ?? ''}
                    onChange={handleProvinceChange}
                >
                    <option value="">{provincePlaceholder}</option>
                    {provinces.map((p) => (
                        <option key={p.PROVINCE_ID} value={p.PROVINCE_ID}>{p.PROVINCE_THAI}</option>
                    ))}
                </FormSelect>
            </div>
            <div className="space-y-1">
                <label htmlFor="edit-district" className={labelClassName}>อำเภอ/เขต</label>
                <FormSelect
                    id="edit-district"
                    value={districtId ?? ''}
                    onChange={handleDistrictChange}
                    disabled={!provinceId}
                >
                    <option value="">{districtPlaceholder}</option>
                    {districts.map((d) => (
                        <option key={d.DISTRICT_ID} value={d.DISTRICT_ID}>{d.DISTRICT_THAI}</option>
                    ))}
                </FormSelect>
            </div>
            <div className="space-y-1">
                <label htmlFor="edit-sub-district" className={labelClassName}>ตำบล/แขวง</label>
                <FormSelect
                    id="edit-sub-district"
                    value={selectedSubDistrict?.SUB_DISTRICT_ID ?? ''}
                    onChange={handleSubDistrictChange}
                    disabled={!districtId}
                >
                    <option value="">{subDistrictPlaceholder}</option>
                    {subDistricts.map((s) => (
                        <option key={s.SUB_DISTRICT_ID} value={s.SUB_DISTRICT_ID}>{s.SUB_DISTRICT_THAI}</option>
                    ))}
                </FormSelect>
            </div>
        </>
    );
}
