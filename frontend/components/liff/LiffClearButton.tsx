'use client';

import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface LiffClearButtonProps {
  onClear: () => void;
  label?: string;
}

export function LiffClearButton({ onClear, label = 'ล้างค่า' }: LiffClearButtonProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={onClear}
      leftIcon={<RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />}
      className="h-7 shrink-0 px-2 text-xs text-text-tertiary"
    >
      {label}
    </Button>
  );
}
