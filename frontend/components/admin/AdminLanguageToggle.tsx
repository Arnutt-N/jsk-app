'use client';

import { motion } from 'motion/react';
import { cn } from '@/lib/utils';

export type AdminLocale = 'th' | 'en';

interface AdminLanguageToggleProps {
  locale: AdminLocale;
  onToggle: () => void;
  className?: string;
}

export function AdminLanguageToggle({ locale, onToggle, className }: AdminLanguageToggleProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={`Switch to ${locale === 'th' ? 'English' : 'Thai'}`}
      className={cn(
        'relative inline-flex h-8 items-center rounded-full p-0.5',
        'border border-gray-200 dark:border-white/10',
        'bg-gray-100 dark:bg-gray-800',
        'transition-colors duration-300 cursor-pointer',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 focus-visible:ring-offset-2',
        className
      )}
    >
      {/* TH option */}
      <span
        className={cn(
          'relative z-10 flex h-7 w-9 items-center justify-center rounded-full text-xs font-bold transition-colors',
          locale === 'th' ? 'text-white' : 'text-gray-400'
        )}
      >
        TH
      </span>

      {/* EN option */}
      <span
        className={cn(
          'relative z-10 flex h-7 w-9 items-center justify-center rounded-full text-xs font-bold transition-colors',
          locale === 'en' ? 'text-white' : 'text-gray-400'
        )}
      >
        EN
      </span>

      {/* Sliding background */}
      <motion.span
        layout
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        className={cn(
          'absolute top-0.5 h-7 w-9 rounded-full bg-brand-600 shadow-sm',
          locale === 'th' ? 'left-0.5' : 'left-[2.375rem]'
        )}
      />
    </button>
  );
}

export default AdminLanguageToggle;
