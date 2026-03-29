'use client';

import Link from 'next/link';
import { Settings, ArrowRight, Send } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { t, type Locale } from '@/lib/i18n/landing';

interface LandingHeroProps {
  locale: Locale;
}

export function LandingHero({ locale }: LandingHeroProps) {
  return (
    <section className="relative flex flex-col items-center justify-center min-h-[60vh] px-6 pt-16 pb-8 text-center">
      {/* Badge */}
      <Badge variant="primary" outline className="mb-8 px-4 py-1.5 text-sm animate-fade-in">
        {t(locale, 'hero_badge')}
      </Badge>

      {/* Heading */}
      <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6 tracking-tight leading-[1.1] animate-fade-in-up">
        <span className="text-text-primary">{t(locale, 'hero_title_1')}</span>
        <br />
        <span className="text-gradient">{t(locale, 'hero_title_2')}</span>
      </h1>

      {/* Subtitle + description */}
      <p className="text-lg md:text-xl text-text-secondary mb-4 max-w-2xl mx-auto leading-relaxed animate-fade-in-up">
        {t(locale, 'hero_subtitle')}
      </p>
      <p className="text-base text-text-tertiary mb-10 max-w-lg mx-auto animate-fade-in-up">
        {t(locale, 'hero_desc')}
      </p>

      {/* CTA buttons */}
      <div className="flex flex-col sm:flex-row gap-4 justify-center items-center animate-fade-in-up">
        <Button
          size="lg"
          className="w-full sm:w-auto"
          leftIcon={<Settings className="w-4 h-4" />}
          rightIcon={<ArrowRight className="w-4 h-4" />}
          glow
          asChild
        >
          <Link href="/admin">
            {t(locale, 'hero_cta_admin')}
          </Link>
        </Button>
        <Button
          size="lg"
          className="w-full sm:w-auto bg-[var(--color-line-green)] hover:bg-[var(--color-line-green-dark)] text-white border-0"
          leftIcon={<Send className="w-4 h-4" />}
          variant="secondary"
          asChild
        >
          <Link href="/liff/service-request">
            {t(locale, 'hero_cta_liff')}
          </Link>
        </Button>
      </div>

      {/* Dashboard mockup preview */}
      <div className="mt-16 w-full max-w-4xl mx-auto animate-fade-in-up">
        <div className="relative rounded-2xl border border-border-default bg-surface shadow-2xl shadow-brand-500/5 overflow-hidden">
          {/* Browser chrome */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border-subtle bg-bg">
            <div className="flex gap-1.5">
              <div className="w-3 h-3 rounded-full bg-danger/60" />
              <div className="w-3 h-3 rounded-full bg-warning/60" />
              <div className="w-3 h-3 rounded-full bg-success/60" />
            </div>
            <div className="flex-1 mx-12">
              <div className="h-5 bg-muted rounded-md max-w-xs mx-auto" />
            </div>
          </div>

          {/* Stat cards */}
          <div className="p-6 grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Total Requests', val: '4,521', trend: '+12%' },
              { label: 'Active Chats', val: '23', trend: '3 urgent' },
              { label: 'Avg Response', val: '1.2m', trend: '-8%' },
              { label: 'CSAT Score', val: '4.5', trend: '127 reviews' },
            ].map((stat) => (
              <div key={stat.label} className="rounded-xl bg-bg p-4 border border-border-subtle">
                <div className="text-xs text-text-tertiary mb-1">{stat.label}</div>
                <div className="text-xl font-bold text-text-primary font-mono">{stat.val}</div>
                <div className="text-xs text-text-tertiary mt-1">{stat.trend}</div>
              </div>
            ))}
          </div>

          {/* Placeholder chart areas */}
          <div className="px-6 pb-6 grid grid-cols-3 gap-4">
            <div className="col-span-2 h-32 rounded-xl bg-muted/50 border border-border-subtle" />
            <div className="h-32 rounded-xl bg-muted/50 border border-border-subtle" />
          </div>
        </div>
      </div>
    </section>
  );
}
