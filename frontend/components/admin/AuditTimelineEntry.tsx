'use client';

import { useMemo } from 'react';
import { getRequestFieldLabel, getAuditEditScopeLabel } from '@/lib/constants/request-field-labels';
import type { AuditLogEntry } from '@/lib/timeline-merge';
import { formatThaiDate } from '@/lib/format-date';

/**
 * Timeline entry สำหรับ audit log การแก้ไขข้อมูลคำร้อง (edit_request_details)
 * โครง dot + header + bubble เหมือน comment entry ในหน้า request detail
 * แต่ tint ม่วงเพื่อแยก "แก้ไขข้อมูล" จาก SYSTEM (amber) และ ADMIN (brand)
 */
export function AuditTimelineEntry({ audit }: { audit: AuditLogEntry }) {
    const formatted = useMemo(() => {
        if (!audit.created_at) return '';
        return formatThaiDate(audit.created_at, { includeTime: true, yearFormat: 'numeric' });
    }, [audit.created_at]);

    const fields = audit.details?.fields ?? {};
    const scopeLabel = getAuditEditScopeLabel(Object.keys(fields));

    return (
        <div className="relative group">
            {/* Timeline Dot — ตำแหน่ง/ขนาดต้องตรงกับ dot ของ comment ให้แนวเส้นตรงกัน */}
            <div className="absolute -left-[45px] top-0 w-6 h-6 rounded-full border-[5px] border-surface shadow-md bg-violet-400 dark:bg-violet-500 shadow-violet-100 dark:shadow-violet-900/20"></div>

            {/* Header */}
            <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-violet-500 dark:text-violet-400 flex items-center gap-2">
                    {audit.admin_name ?? 'ไม่ระบุผู้ใช้'}
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-300">
                        {scopeLabel}
                    </span>
                </span>
                <span className="text-[10px] font-bold text-text-tertiary">{formatted}</span>
            </div>

            {/* Content Bubble — รายการ field ที่เปลี่ยน: ค่าเดิม → ค่าใหม่ */}
            <div className="bg-violet-50/60 dark:bg-violet-900/10 border border-violet-200 dark:border-violet-800 rounded-2xl rounded-tl-sm p-4 text-sm text-text-secondary leading-relaxed shadow-sm space-y-1.5">
                {Object.entries(fields).map(([field, change]) => {
                    const isDateField = field === 'due_date' || field.endsWith('_at');
                    const oldVal = isDateField && change.old ? formatThaiDate(change.old) : (change.old || '—');
                    const newVal = isDateField && change.new ? formatThaiDate(change.new) : (change.new || '—');
                    return (
                        <div key={field} className="flex flex-wrap items-baseline gap-x-2">
                            <span className="font-semibold text-text-primary">{getRequestFieldLabel(field)}:</span>
                            <span className="line-through text-text-tertiary thai-no-break">{oldVal}</span>
                            <span aria-hidden="true" className="text-text-tertiary">→</span>
                            <span className="font-medium thai-no-break">{newVal}</span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
