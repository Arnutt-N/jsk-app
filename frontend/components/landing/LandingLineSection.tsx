'use client';

import Link from 'next/link';
import { MessageCircle, FileText, Search } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { t, type Locale } from '@/lib/i18n/landing';
import { landingPublicLinks } from '@/lib/public-links';

interface LandingLineSectionProps {
  locale: Locale;
}

const features = [
  { icon: MessageCircle, titleKey: 'line_chat', descKey: 'line_chat_desc' },
  { icon: FileText, titleKey: 'line_request', descKey: 'line_request_desc' },
  { icon: Search, titleKey: 'line_track', descKey: 'line_track_desc' },
] as const;

export function LandingLineSection({ locale }: LandingLineSectionProps) {
  const lineOfficialAccountUrl = landingPublicLinks.lineOfficialAccount;
  const primaryLineLabel = lineOfficialAccountUrl ? t(locale, 'line_add_friend') : t(locale, 'line_contact_cta');

  return (
    <section id="line" className="scroll-mt-28 px-6 py-20 sm:py-24">
      <div className="mx-auto max-w-7xl landing-surface rounded-2xl px-6 py-8 sm:px-8 sm:py-10">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,0.88fr)_minmax(0,1.12fr)]">
          <div className="max-w-xl">
            <Badge
              variant="outline"
              className="navy-chip rounded-full px-4 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.24em]"
            >
              {t(locale, 'line_badge')}
            </Badge>

            <h2 className="mt-6 text-balance text-3xl font-semibold tracking-tight text-slate-950 dark:text-white sm:text-4xl">
              {t(locale, 'line_title_prefix')}{' '}
              <span className="line-accent md:whitespace-nowrap font-semibold">
                {t(locale, 'line_title')}
              </span>
            </h2>

            <p className="mt-4 text-base leading-7 text-slate-600 dark:text-slate-300 sm:text-lg">
              {t(locale, 'line_subtitle')}
            </p>

            <div className="mt-8 flex flex-col gap-4 sm:flex-row">
              <Button
                asChild
                size="lg"
                variant="secondary"
                className="thai-no-break rounded-full border-0 bg-[var(--color-line-green)] px-6 text-white shadow-sm hover:bg-[var(--color-line-green-dark)] hover:text-white"
              >
                {lineOfficialAccountUrl ? (
                  <a href={lineOfficialAccountUrl} target="_blank" rel="noopener noreferrer">
                    {primaryLineLabel}
                  </a>
                ) : (
                  <Link href="#contact">
                    {primaryLineLabel}
                  </Link>
                )}
              </Button>

              <Button
                asChild
                size="lg"
                variant="secondary"
                className="thai-no-break rounded-full border-slate-200 bg-white px-6 text-slate-900 shadow-sm hover:bg-slate-50 dark:border-white/15 dark:bg-white/10 dark:text-white dark:hover:bg-white/15"
              >
                <Link href="/liff/service-request">
                  {t(locale, 'line_request_cta')}
                </Link>
              </Button>
            </div>
          </div>

          <div className="divide-y divide-slate-200 dark:divide-white/10">
            {features.map(({ icon: Icon, titleKey, descKey }, index) => (
              <div
                key={titleKey}
                className="flex gap-4 py-6 first:pt-0 last:pb-0"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-sm font-semibold text-slate-500 dark:border-white/10 dark:bg-white/5 dark:text-white/50">
                  {String(index + 1).padStart(2, '0')}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-lg font-semibold text-slate-950 dark:text-white">
                        {t(locale, titleKey)}
                      </h3>
                      <p className="mt-2 text-sm leading-7 text-slate-600 dark:text-slate-300 sm:text-[0.95rem]">
                        {t(locale, descKey)}
                      </p>
                    </div>

                    <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 dark:border-white/10 dark:bg-white/5 dark:text-white/60">
                      <Icon className="h-5 w-5" />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
