'use client';

import { passwordStrength } from '@/lib/password-strength';

interface PasswordStrengthMeterProps {
  /** Current password value; renders an empty meter when blank */
  password: string;
}

export function PasswordStrengthMeter({ password }: PasswordStrengthMeterProps) {
  const strength = passwordStrength(password);
  return (
    <div className="mt-2">
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${strength.color}`}
            style={{ width: `${strength.level * 25}%` }}
          />
        </div>
        <span className="text-xs text-text-secondary">{strength.label}</span>
      </div>
    </div>
  );
}

export default PasswordStrengthMeter;
