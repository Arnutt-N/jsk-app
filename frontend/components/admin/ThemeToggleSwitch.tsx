'use client';

import { motion } from 'motion/react';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '@/components/providers';
import { cn } from '@/lib/utils';

export function ThemeToggleSwitch({ className }: { className?: string }) {
  const { resolvedTheme, toggleTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      onClick={toggleTheme}
      className={cn(
        'relative inline-flex h-8 w-[3.75rem] shrink-0 items-center rounded-full p-0.5',
        'border border-gray-200 dark:border-white/10',
        'bg-gray-100 dark:bg-gray-800',
        'transition-colors duration-300 cursor-pointer',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 focus-visible:ring-offset-2',
        className
      )}
    >
      {/* Icons inside track */}
      <Sun className="absolute left-1.5 w-3.5 h-3.5 text-amber-500 opacity-60" />
      <Moon className="absolute right-1.5 w-3.5 h-3.5 text-brand-300 opacity-60" />

      {/* Sliding knob */}
      <motion.span
        layout
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        className={cn(
          'relative z-10 flex h-7 w-7 items-center justify-center rounded-full shadow-sm',
          isDark
            ? 'translate-x-[1.75rem] bg-gray-700'
            : 'translate-x-0 bg-white'
        )}
      >
        {isDark ? (
          <Moon className="w-3.5 h-3.5 text-brand-300" />
        ) : (
          <Sun className="w-3.5 h-3.5 text-amber-500" />
        )}
      </motion.span>
    </button>
  );
}

export default ThemeToggleSwitch;
