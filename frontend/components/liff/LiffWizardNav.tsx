'use client';

import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface NavSlot {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

interface LiffWizardNavProps {
  onCancel: () => void;
  cancelLabel?: string;
  back?: NavSlot;
  next?: NavSlot;
  submit?: NavSlot;
}

export function LiffWizardNav({ onCancel, cancelLabel = 'ยกเลิกรายการ', back, next, submit }: LiffWizardNavProps) {
  return (
    <div className="mt-4 flex flex-col gap-3">
      <div className="flex w-full gap-3">
        {back && (
          <Button
            type="button"
            variant="outline"
            className="h-auto flex-1 py-3"
            onClick={back.onClick}
            disabled={back.disabled}
            leftIcon={<ChevronLeft className="h-4 w-4" aria-hidden="true" />}
          >
            {back.label}
          </Button>
        )}
        {next && (
          <Button
            type="button"
            className="h-auto flex-[2] py-3"
            onClick={next.onClick}
            disabled={next.disabled}
            rightIcon={<ChevronRight className="h-4 w-4" aria-hidden="true" />}
          >
            {next.label}
          </Button>
        )}
        {submit && (
          <Button
            type="button"
            className="h-auto flex-[2] py-3 font-bold"
            onClick={submit.onClick}
            disabled={submit.disabled}
          >
            {submit.label}
          </Button>
        )}
      </div>
      <Button
        type="button"
        variant="ghost"
        className="h-auto w-full py-2 text-xs font-medium text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-900/20"
        onClick={onCancel}
        leftIcon={<X className="h-3.5 w-3.5" aria-hidden="true" />}
      >
        {cancelLabel}
      </Button>
    </div>
  );
}
