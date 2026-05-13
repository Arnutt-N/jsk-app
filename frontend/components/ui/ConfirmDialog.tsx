'use client';

import React from 'react';
import { AlertTriangle, Trash2, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Modal } from './Modal';
import { Button } from './Button';

type ConfirmVariant = 'danger' | 'warning' | 'info';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  /**
   * Body content. Accepts ReactNode so callers can compose formatted
   * markup (e.g. `<b>` for the item name, a red warning line) while
   * keeping the dialog's chrome and button styling consistent across
   * surfaces. Plain strings still work for simple cases.
   */
  description?: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  variant?: ConfirmVariant;
  isLoading?: boolean;
}

const variantConfig: Record<ConfirmVariant, {
  icon: React.ReactNode;
  iconBg: string;
  confirmVariant: 'danger' | 'warning' | 'primary';
}> = {
  danger: {
    icon: <Trash2 className="w-6 h-6 text-danger" />,
    iconBg: 'bg-danger-light/30 dark:bg-danger/20',
    confirmVariant: 'danger',
  },
  warning: {
    icon: <AlertTriangle className="w-6 h-6 text-warning-dark" />,
    iconBg: 'bg-warning-light/30 dark:bg-warning/20',
    confirmVariant: 'warning',
  },
  info: {
    icon: <Info className="w-6 h-6 text-info" />,
    iconBg: 'bg-info-light/30 dark:bg-info/20',
    confirmVariant: 'primary',
  },
};

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmText = 'ยืนยัน',
  cancelText = 'ยกเลิก',
  variant = 'danger',
  isLoading = false,
}: ConfirmDialogProps) {
  const config = variantConfig[variant];

  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="sm" showCloseButton={false}>
      <div className="flex flex-col items-center text-center">
        <div className={cn('w-14 h-14 rounded-2xl flex items-center justify-center mb-4', config.iconBg)}>
          {config.icon}
        </div>
        <h3 className="text-lg font-semibold text-text-primary mb-2">{title}</h3>
        {description && (
          <p className="text-sm text-text-secondary mb-6">{description}</p>
        )}
        <div className="flex gap-3 w-full">
          <Button
            variant="outline"
            className="flex-1"
            onClick={onClose}
            disabled={isLoading}
          >
            {cancelText}
          </Button>
          <Button
            variant={config.confirmVariant}
            className="flex-1"
            onClick={onConfirm}
            isLoading={isLoading}
          >
            {confirmText}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export type { ConfirmDialogProps, ConfirmVariant };
export default ConfirmDialog;
