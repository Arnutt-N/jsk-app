'use client';

import ConfirmDialog from '@/components/ui/ConfirmDialog';

interface LogoutConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

/**
 * Shared confirmation for every user-initiated logout (UserMenu,
 * CommandPalette, live-chat ProfileDropdown). System-initiated session
 * ends (jsk:auth-expired, session timeout, cross-tab broadcasts) bypass
 * this on purpose — nobody is present to confirm those.
 */
export default function LogoutConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
}: LogoutConfirmDialogProps) {
  return (
    <ConfirmDialog
      isOpen={isOpen}
      onClose={onClose}
      onConfirm={onConfirm}
      title="ต้องการออกจากระบบหรือไม่?"
      description="คุณจะต้องเข้าสู่ระบบอีกครั้งเพื่อกลับเข้าใช้งานหลังบ้าน"
      variant="warning"
    />
  );
}
