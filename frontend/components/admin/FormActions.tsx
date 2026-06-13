'use client';

import { Save, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface FormActionsProps {
    onCancel: () => void;
    onSave: () => void;
    /** True while the save request is in flight: disables both buttons + spins save. */
    saving?: boolean;
    /** Extra gate on save independent of `saving` (e.g. empty comment field). */
    saveDisabled?: boolean;
    saveLabel?: string;
    cancelLabel?: string;
}

/**
 * Canonical cancel/save button pair for request-detail edit forms.
 *
 * Every editable tab (รายละเอียด / ที่อยู่ / การดำเนินงาน·ความเห็น / จัดการคำร้อง)
 * renders this so size, icons, and loading/disabled behaviour stay identical
 * across tabs. Renders the two buttons only (no wrapper) so each call site
 * keeps its own bottom-right container.
 */
export function FormActions({
    onCancel,
    onSave,
    saving = false,
    saveDisabled = false,
    saveLabel = 'บันทึก',
    cancelLabel = 'ยกเลิก',
}: FormActionsProps) {
    return (
        <>
            <Button
                variant="ghost"
                size="sm"
                onClick={onCancel}
                disabled={saving}
                leftIcon={<X size={14} />}
            >
                {cancelLabel}
            </Button>
            <Button
                variant="primary"
                size="sm"
                onClick={onSave}
                disabled={saving || saveDisabled}
                isLoading={saving}
                leftIcon={<Save size={14} />}
            >
                {saveLabel}
            </Button>
        </>
    );
}
