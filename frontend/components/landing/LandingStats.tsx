'use client';

import { t, type Locale } from '@/lib/i18n/landing';

interface LandingStatsProps {
  locale: Locale;
}

const stats = [
  { value: '24/7', labelKey: 'stat_24_7' },
  { value: '99.9%', labelKey: 'stat_uptime' },
  { value: '10x', labelKey: 'stat_response' },
  { value: '100k+', labelKey: 'stat_users' },
] as const;

export function LandingStats({ locale }: LandingStatsProps) {
  return (
    <section
      id="stats"
      className="py-16 border-y border-slate-200/60 dark:border-white/10 bg-white dark:bg-slate-900/50 relative z-10"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-12 text-center">
          {stats.map((stat, idx) => (
            <div key={idx} className="px-4 relative group">
              {idx !== 3 && (
                <div className="hidden md:block absolute right-0 top-1/2 -translate-y-1/2 w-px h-12 bg-slate-200 dark:bg-white/10" />
              )}
              <p className="font-heading text-4xl md:text-5xl font-black text-slate-900 dark:text-white tracking-tight mb-2 group-hover:text-blue-900 dark:group-hover:text-blue-400 transition-colors">
                {stat.value}
              </p>
              <p className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                {t(locale, stat.labelKey)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
