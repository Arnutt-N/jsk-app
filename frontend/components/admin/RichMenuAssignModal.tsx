'use client';

import React, { useMemo, useState } from 'react';
import { Tag } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Select, type SelectOption } from '@/components/ui/Select';

/** A rich menu the operator may bind to a user. Only menus already synced to
 *  LINE (`line_rich_menu_id` set) are assignable — the backend returns 409
 *  otherwise — so callers should pre-filter. */
export interface AssignableRichMenu {
    id: number;
    name: string;
    line_rich_menu_id: string | null;
    user_link_count?: number;
}

interface FriendLike {
    line_user_id: string;
    display_name?: string;
    rich_menu_id?: number | null;
    rich_menu_name?: string | null;
}

interface RichMenuAssignModalProps {
    isOpen: boolean;
    onClose: () => void;
    /** Synced, assignable menus (caller filters out unsynced ones). */
    menus: AssignableRichMenu[];
    /** 'single' targets `friend`; 'bulk' targets the selected set. */
    mode: 'single' | 'bulk';
    friend: FriendLike | null;
    selectedCount: number;
    loading: boolean;
    onAssign: (richMenuId: number) => void;
    /** Single-mode only: revert the friend to the default menu. */
    onUnassign: () => void;
}

/**
 * Picker dialog shared by the per-row (single) and toolbar (bulk) flows on the
 * friends page. Single mode defaults the dropdown to the friend's current menu
 * and offers an Unassign action; bulk mode applies one menu to N selected users.
 */
export function RichMenuAssignModal({
    isOpen,
    onClose,
    menus,
    mode,
    friend,
    selectedCount,
    loading,
    onAssign,
    onUnassign,
}: RichMenuAssignModalProps) {
    // Initialised from props on mount. The parent passes a `key` that changes
    // each time the dialog opens, remounting this component so the dropdown
    // re-defaults to the friend's current menu (single mode). This avoids a
    // setState-in-effect cascade (react-hooks/set-state-in-effect).
    const [selectedMenuId, setSelectedMenuId] = useState<string>(() =>
        mode === 'single' && friend?.rich_menu_id ? String(friend.rich_menu_id) : '',
    );

    const options: SelectOption[] = useMemo(
        () => menus.map((m) => ({ value: String(m.id), label: m.name })),
        [menus],
    );

    const title =
        mode === 'single'
            ? `กำหนด Rich Menu — ${friend?.display_name || 'ผู้ใช้'}`
            : `กำหนด Rich Menu ให้ ${selectedCount} คน`;

    const canAssign = selectedMenuId !== '' && !loading;
    const hasCurrent = mode === 'single' && !!friend?.rich_menu_id;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={title} maxWidth="md">
            <div className="space-y-4 thai-text">
                {mode === 'single' && (
                    <div className="text-sm text-text-secondary">
                        เมนูปัจจุบัน:{' '}
                        <span className="font-medium text-text-primary">
                            {friend?.rich_menu_name || 'ยังไม่ได้กำหนด (เมนูหลัก)'}
                        </span>
                    </div>
                )}

                {options.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-border-default px-4 py-6 text-center text-sm text-text-tertiary">
                        ยังไม่มี Rich Menu ที่ sync ไปยัง LINE — กรุณา sync เมนูก่อนจึงจะกำหนดให้ผู้ใช้ได้
                    </p>
                ) : (
                    <div>
                        <label
                            htmlFor="rich-menu-assign-select"
                            className="mb-1.5 block text-sm font-medium text-text-primary"
                        >
                            เลือก Rich Menu
                        </label>
                        <Select
                            id="rich-menu-assign-select"
                            value={selectedMenuId}
                            onChange={(e) => setSelectedMenuId(e.target.value)}
                            options={options}
                            placeholder="— เลือกเมนู —"
                            leftIcon={<Tag className="h-4 w-4" />}
                            helperText="แสดงเฉพาะเมนูที่ sync ไปยัง LINE แล้วเท่านั้น"
                        />
                    </div>
                )}

                <div className="flex items-center justify-between gap-2 pt-2">
                    {hasCurrent ? (
                        <Button variant="outline" onClick={onUnassign} disabled={loading}>
                            ยกเลิกการกำหนด
                        </Button>
                    ) : (
                        <span />
                    )}
                    <div className="flex items-center gap-2">
                        <Button variant="ghost" onClick={onClose} disabled={loading}>
                            ปิด
                        </Button>
                        <Button
                            onClick={() => canAssign && onAssign(Number(selectedMenuId))}
                            disabled={!canAssign}
                            isLoading={loading}
                        >
                            กำหนด
                        </Button>
                    </div>
                </div>
            </div>
        </Modal>
    );
}

export default RichMenuAssignModal;
