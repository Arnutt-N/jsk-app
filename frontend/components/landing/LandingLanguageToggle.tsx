'use client';

import { cn } from '@/lib/utils';
import type { Locale } from '@/lib/i18n/landing';

interface LandingLanguageToggleProps {
  locale: Locale;
  onToggle: () => void;
}

export function LandingLanguageToggle({ locale, onToggle }: LandingLanguageToggleProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="relative flex h-10 items-center rounded-full border border-slate-200/70 bg-white/75 p-1 text-[11px] font-semibold tracking-[0.18em] text-slate-500 shadow-sm transition-colors hover:border-slate-300 hover:bg-white dark:border-white/10 dark:bg-white/5 dark:text-white/60 dark:hover:border-white/20 dark:hover:bg-white/10 cursor-pointer"
      aria-label={locale === 'th' ? 'Switch to English' : 'เปลี่ยนเป็นภาษาไทย'}
    >
      <span
        className={cn(
          'relative z-10 flex h-8 w-10 items-center justify-center rounded-full transition-colors duration-200',
          locale === 'th'
            ? 'bg-slate-950 text-white shadow-sm dark:bg-white dark:text-slate-950'
            : 'text-slate-500 hover:text-slate-950 dark:text-white/60 dark:hover:text-white cursor-pointer'
        )}
      >
        TH
      </span>
      <span
        className={cn(
          'relative z-10 flex h-8 w-10 items-center justify-center rounded-full transition-colors duration-200',
          locale === 'en'
            ? 'bg-slate-950 text-white shadow-sm dark:bg-white dark:text-slate-950'
            : 'text-slate-500 hover:text-slate-950 dark:text-white/60 dark:hover:text-white cursor-pointer'
        )}
      >
        EN
      </span>
    </button>
  );
}
