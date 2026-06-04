'use client';

import { motion } from 'motion/react';
import { cn } from '@/lib/utils';

export type AdminLocale = 'th' | 'en';

interface AdminLanguageToggleProps {
  locale: AdminLocale;
  onToggle: () => void;
  className?: string;
}

/**
 * Language switch (TH / EN) for the admin Navbar.
 *
 * Why a "pending i18n" notice in the tooltip: the admin app currently has
 * no real i18n dictionary, so toggling only flips a persisted flag. We
 * surface that explicitly so users know the switch is recorded but won't
 * change visible copy yet. When translation keys land, remove the
 * "(coming soon)" suffix from the title.
 */
export function AdminLanguageToggle({ locale, onToggle, className }: AdminLanguageToggleProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      title={`เปลี่ยนเป็นภาษา${locale === 'th' ? 'อังกฤษ' : 'ไทย'} (เร็วๆ นี้)`}
      aria-label={`เปลี่ยนเป็นภาษา${locale === 'th' ? 'อังกฤษ' : 'ไทย'}`}
      data-locale={locale}
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
          'relative z-10 flex h-7 w-9 items-center justify-center rounded-full text-xs font-bold transition-colors select-none',
          locale === 'th' ? 'text-white' : 'text-gray-400'
        )}
        aria-hidden="true"
      >
        TH
      </span>

      {/* EN option */}
      <span
        className={cn(
          'relative z-10 flex h-7 w-9 items-center justify-center rounded-full text-xs font-bold transition-colors select-none',
          locale === 'en' ? 'text-white' : 'text-gray-400'
        )}
        aria-hidden="true"
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
