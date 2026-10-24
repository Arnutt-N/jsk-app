'use client';

import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

interface LeaveConfirmDialogProps {
  isOpen: boolean;
  isInLineApp: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function LeaveConfirmDialog({ isOpen, isInLineApp, onClose, onConfirm }: LeaveConfirmDialogProps) {
  return (
    <ConfirmDialog
      isOpen={isOpen}
      onClose={onClose}
      onConfirm={onConfirm}
      variant="danger"
      title={isInLineApp ? 'ปิดแบบฟอร์มนี้?' : 'ออกจากหน้านี้?'}
      description={
        <>
          ข้อมูลที่กรอกไว้ทั้งหมดจะหายไป
          <br />
          และไม่สามารถกู้คืนได้
        </>
      }
      confirmText="ยืนยัน"
      cancelText="ไม่ใช่"
    />
  );
}
