'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ArrowRight, Bot, FileText, Headphones, Shield } from 'lucide-react';
import { LandingBrandMark } from '@/components/landing/LandingBrandMark';
import { LandingNavbar } from '@/components/landing/LandingNavbar';
import { LandingHero } from '@/components/landing/LandingHero';
import { LandingLineSection } from '@/components/landing/LandingLineSection';
import { LandingFooter } from '@/components/landing/LandingFooter';
import { AnimatedCounter } from '@/components/landing/AnimatedCounter';
import { t, type Locale } from '@/lib/i18n/landing';

const CAPABILITIES = [
  { icon: Bot, key: 'channels', line: true },
  { icon: FileText, key: 'request', line: true },
  { icon: Headphones, key: 'operations', line: false },
  { icon: Shield, key: 'governance', line: false },
] as const;

const STATS = [
  { value: '24', key: 'stats_models', suffix: '' },
  { value: '17', key: 'stats_services', suffix: '' },
  { value: '25', key: 'stats_endpoints', suffix: '+' },
  { value: '198', key: 'stats_tests', suffix: '' },
];

export default function Home() {
  const [locale, setLocale] = useState<Locale>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('jsk-landing-locale');
      if (saved === 'en' || saved === 'th') return saved;
    }
    return 'th';
  });

  useEffect(() => {
    localStorage.setItem('jsk-landing-locale', locale);
  }, [locale]);

  const toggleLocale = () => setLocale((prev) => (prev === 'th' ? 'en' : 'th'));

  return (
    <main className="landing-page thai-text min-h-screen overflow-hidden">
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="landing-grid-overlay absolute inset-x-0 top-0 h-[42rem]" />
      </div>

      <LandingNavbar locale={locale} onToggleLocale={toggleLocale} />
      <LandingHero locale={locale} />

      <section id="overview" className="scroll-mt-28 px-6 pb-8 pt-2 sm:pb-12">
        <div className="mx-auto max-w-7xl landing-surface rounded-2xl px-6 py-8 sm:px-8 sm:py-10">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)] lg:items-end">
            <div className="max-w-xl">
              <Badge
                variant="outline"
                className="navy-chip rounded-full px-4 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.24em]"
              >
                {t(locale, 'stats_badge')}
              </Badge>

              <h2 className="mt-5 text-balance text-3xl font-semibold tracking-tight text-slate-950 dark:text-white sm:text-4xl">
                {t(locale, 'stats_title')}
              </h2>

              <p className="mt-4 text-base leading-7 text-slate-600 dark:text-slate-300">
                {t(locale, 'stats_desc')}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-x-6 gap-y-8 md:grid-cols-4">
              {STATS.map((stat, index) => (
                <div
                  key={stat.key}
                  className={`${
                    index === 0 ? '' : 'md:border-l md:border-slate-200 md:pl-6 dark:border-white/10'
                  }`}
                >
                  <div className="text-3xl font-semibold tracking-tight text-slate-950 dark:text-white sm:text-4xl">
                    <AnimatedCounter end={parseInt(stat.value, 10)} suffix={stat.suffix} />
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
                    {t(locale, stat.key)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="capabilities" className="scroll-mt-28 px-6 py-20 sm:py-24">
        <div className="mx-auto grid max-w-7xl gap-14 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
          <div className="max-w-xl">
            <Badge
              variant="outline"
              className="navy-chip rounded-full px-4 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.24em]"
            >
              {t(locale, 'capabilities_badge')}
            </Badge>

            <h2 className="mt-5 text-balance text-3xl font-semibold tracking-tight text-slate-950 dark:text-white sm:text-4xl">
              {t(locale, 'capabilities_title')}
            </h2>

            <p className="mt-4 text-base leading-7 text-slate-600 dark:text-slate-300">
              {t(locale, 'capabilities_desc')}
            </p>
          </div>

          <div className="landing-surface rounded-2xl px-6 py-4 sm:px-8">
            <div className="divide-y divide-slate-200 dark:divide-white/10">
              {CAPABILITIES.map((capability, index) => {
                const Icon = capability.icon;

                return (
                  <div key={capability.key} className="py-6 first:pt-2 last:pb-2">
                    <div className="flex items-start gap-5">
                      <div
                        className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border ${
                          capability.line
                            ? 'border-[hsl(141_73%_42%_/_0.16)] bg-[hsl(141_73%_42%_/_0.08)] text-[var(--color-line-green-dark)]'
                            : 'border-slate-200 bg-slate-900 text-white dark:border-white/10 dark:bg-white dark:text-slate-950'
                        }`}
                      >
                        <Icon className="h-5 w-5" />
                      </div>

                      <div className="min-w-0">
                        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-slate-400 dark:text-slate-500">
                          0{index + 1}
                        </p>
                        <h3 className="mt-2 text-lg font-semibold text-slate-950 dark:text-white">
                          {t(locale, `capability_${capability.key}_title`)}
                        </h3>
                        <p className="mt-2 text-sm leading-7 text-slate-600 dark:text-slate-300 sm:text-[0.95rem]">
                          {t(locale, `capability_${capability.key}_desc`)}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <LandingLineSection locale={locale} />

      <section className="px-6 pb-24 pt-6 sm:pb-28">
        <div className="mx-auto max-w-6xl overflow-hidden rounded-2xl bg-slate-900 px-6 py-10 shadow-[0_24px_64px_hsl(224_71%_4%_/_0.2)] sm:px-8 sm:py-12 dark:bg-slate-900/80 dark:border dark:border-white/10">
          <div className="relative grid gap-8 lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:items-center">
            <LandingBrandMark tone="dark" compact className="shrink-0" />

            <div className="max-w-2xl">
              <Badge
                variant="outline"
                className="rounded-full border-white/12 bg-white/8 px-4 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-white/60"
              >
                {t(locale, 'cta_badge')}
              </Badge>

              <h2 className="mt-5 text-balance text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                {t(locale, 'cta_title')}
              </h2>

              <p className="mt-4 text-base leading-7 text-white/70">
                {t(locale, 'cta_subtitle')}
              </p>
            </div>

            <div className="flex flex-col gap-4 sm:flex-row lg:flex-col xl:flex-row">
              <Button
                asChild
                size="lg"
                variant="secondary"
                className="thai-no-break rounded-full border-white/10 bg-white text-slate-950 hover:bg-slate-100"
              >
                <Link href="/login">
                  {t(locale, 'cta_login')}
                  <ArrowRight className="w-4 h-4 ml-1" />
                </Link>
              </Button>

              <Button
                asChild
                size="lg"
                variant="secondary"
                className="thai-no-break rounded-full border-0 bg-[var(--color-line-green)] text-white hover:bg-[var(--color-line-green-dark)] hover:text-white"
              >
                <Link href="/liff/service-request">
                  {t(locale, 'cta_request')}
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      <LandingFooter locale={locale} />
    </main>
  );
}
