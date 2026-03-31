'use client';

import { cn } from '@/lib/utils';

interface LandingBrandMarkProps {
  tone?: 'light' | 'dark';
  compact?: boolean;
  className?: string;
}

export function LandingBrandMark({
  tone = 'light',
  compact = false,
  className,
}: LandingBrandMarkProps) {
  const dark = tone === 'dark';

  return (
    <div className={cn('flex min-w-0 items-center gap-3', className)}>
      <div
        className={cn(
          'relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border text-[0.62rem] font-semibold tracking-[0.24em]',
          dark
            ? 'border-white/10 bg-slate-800 text-white'
            : 'border-slate-200 bg-slate-900 text-white shadow-sm'
        )}
      >
        <span>JSK</span>
        <span className="absolute inset-x-2 bottom-1 h-px rounded-full bg-[linear-gradient(90deg,transparent,hsl(220_60%_60%_/_0.6),transparent)]" />
      </div>

      <div className="min-w-0">
        <p
          className={cn(
            'truncate text-[0.62rem] font-semibold uppercase tracking-[0.28em]',
            dark ? 'text-white/50' : 'text-slate-500'
          )}
        >
          Community Justice
        </p>
        <p
          className={cn(
            'thai-no-break truncate text-sm font-semibold tracking-tight',
            dark ? 'text-white' : 'text-slate-950'
          )}
        >
          JSK Platform
        </p>
        {!compact && (
          <p
            className={cn(
              'thai-no-break truncate text-xs',
              dark ? 'text-white/60' : 'text-slate-500'
            )}
          >
            Public Service Operations
          </p>
        )}
      </div>
    </div>
  );
}
