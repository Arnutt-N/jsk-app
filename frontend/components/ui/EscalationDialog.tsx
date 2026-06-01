'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Input } from '@/components/ui/Input';

interface EscalationDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (agency: string, reason: string) => void;
    isLoading?: boolean;
}

const ESCALATION_AGENCIES = [
    { value: 'ปปส', label: 'ป.ป.ส. (สำนักงานคณะกรรมการป้องกันและปราบปรามยาเสพติด)' },
    { value: 'ตำรวจ', label: 'ตำรวจ' },
    { value: 'กรมการปกครอง', label: 'กรมการปกครอง' },
    { value: 'อื่นๆ', label: 'กำหนดเอง' },
];

export function EscalationDialog({ isOpen, onClose, onConfirm, isLoading }: EscalationDialogProps) {
    const [agency, setAgency] = useState('');
    const [customAgency, setCustomAgency] = useState('');
    const [reason, setReason] = useState('');

    const handleConfirm = () => {
        const finalAgency = agency === 'อื่นๆ' ? customAgency : agency;
        onConfirm(finalAgency, reason);
        // Reset state
        setAgency('');
        setCustomAgency('');
        setReason('');
    };

    const isDisabled = !agency || (agency === 'อื่นๆ' && !customAgency.trim());

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="ส่งต่อหน่วยงานเฉพาะทาง" maxWidth="md">
            <div className="space-y-4">
                <div>
                    <label className="block text-xs font-medium text-text-secondary mb-1.5">
                        เลือกหน่วยงานที่จะส่งต่อ <span className="text-danger">*</span>
                    </label>
                    <Select
                        value={agency}
                        onChange={(e) => setAgency(e.target.value)}
                        options={[
                            { value: '', label: '-- เลือกหน่วยงาน --' },
                            ...ESCALATION_AGENCIES
                        ]}
                    />
                </div>

                {agency === 'อื่นๆ' && (
                    <div className="animate-in fade-in slide-in-from-top-2">
                        <label className="block text-xs font-medium text-text-secondary mb-1.5">
                            ระบุหน่วยงาน <span className="text-danger">*</span>
                        </label>
                        <Input
                            value={customAgency}
                            onChange={(e) => setCustomAgency(e.target.value)}
                            placeholder="พิมพ์ชื่อหน่วยงาน"
                        />
                    </div>
                )}

                <div>
                    <label className="block text-xs font-medium text-text-secondary mb-1.5">
                        เหตุผล (ไม่บังคับ)
                    </label>
                    <Input
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="ระบุเหตุผลในการส่งต่อ (ถ้ามี)"
                    />
                </div>

                <div className="flex gap-2 justify-end pt-4">
                    <Button variant="ghost" onClick={onClose} disabled={isLoading}>
                        ยกเลิก
                    </Button>
                    <Button
                        variant="warning"
                        onClick={handleConfirm}
                        disabled={isDisabled || isLoading}
                        isLoading={isLoading}
                    >
                        ส่งต่อ
                    </Button>
                </div>
            </div>
        </Modal>
    );
}
