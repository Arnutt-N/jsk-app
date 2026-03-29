'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import {
  MessageCircle, ArrowRight, Bot, BarChart3,
  Shield, Globe, FileText, Headphones,
} from 'lucide-react';
import { LandingNavbar } from '@/components/landing/LandingNavbar';
import { HeroCarousel } from '@/components/landing/HeroCarousel';
import { LandingHero } from '@/components/landing/LandingHero';
import { LandingLineSection } from '@/components/landing/LandingLineSection';
import { LandingFooter } from '@/components/landing/LandingFooter';
import { AnimatedCounter } from '@/components/landing/AnimatedCounter';
import { t, type Locale } from '@/lib/i18n/landing';

const FEATURES_CONFIG = [
  { icon: Bot, key: 'chatbot', color: 'text-brand-600', bg: 'bg-brand-50 dark:bg-brand-950/30' },
  { icon: Headphones, key: 'livechat', color: 'text-brand-600', bg: 'bg-brand-50 dark:bg-brand-950/30' },
  { icon: BarChart3, key: 'analytics', color: 'text-brand-600', bg: 'bg-brand-50 dark:bg-brand-950/30' },
  { icon: FileText, key: 'request', color: 'text-brand-600', bg: 'bg-brand-50 dark:bg-brand-950/30' },
  { icon: Shield, key: 'security', color: 'text-brand-600', bg: 'bg-brand-50 dark:bg-brand-950/30' },
  { icon: Globe, key: 'multiplatform', color: 'text-brand-600', bg: 'bg-brand-50 dark:bg-brand-950/30' },
];

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
    <main className="min-h-screen bg-bg thai-text overflow-hidden">
      {/* Decorative background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-brand-500/5 rounded-full blur-3xl -translate-y-1/3 translate-x-1/4" />
        <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-info/5 rounded-full blur-3xl translate-y-1/3 -translate-x-1/4" />
        <div className="absolute top-1/2 left-1/2 w-[300px] h-[300px] bg-accent/5 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2" />
      </div>

      <LandingNavbar locale={locale} onToggleLocale={toggleLocale} />

      <HeroCarousel locale={locale} />

      <LandingHero locale={locale} />

      {/* Stats */}
      <section id="stats" className="py-16 border-y border-border-subtle bg-surface/50">
        <div className="max-w-4xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          {STATS.map((stat) => (
            <div key={stat.key}>
              <div className="text-3xl md:text-4xl font-bold text-text-primary font-mono tracking-tight">
                <AnimatedCounter end={parseInt(stat.value)} suffix={stat.suffix} />
              </div>
              <div className="text-sm text-text-tertiary mt-1">{t(locale, stat.key)}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="px-6 py-20 max-w-6xl mx-auto">
        <div className="text-center mb-14">
          <Badge variant="secondary" className="mb-4">{t(locale, 'feat_badge')}</Badge>
          <h2 className="text-3xl md:text-4xl font-bold text-text-primary mb-4 tracking-tight">
            {t(locale, 'feat_title')}
          </h2>
          <p className="text-text-secondary max-w-lg mx-auto">
            {t(locale, 'feat_subtitle')}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {FEATURES_CONFIG.map((feature) => {
            const Icon = feature.icon;
            return (
              <Card
                key={feature.key}
                variant="default"
                className="group hover:-translate-y-1 hover:shadow-lg transition-all duration-200"
              >
                <CardContent className="p-6">
                  <div className={`w-11 h-11 rounded-xl ${feature.bg} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-200`}>
                    <Icon className={`w-5 h-5 ${feature.color}`} />
                  </div>
                  <h3 className="font-semibold text-text-primary mb-2 thai-no-break">
                    {t(locale, `feat_${feature.key}`)}
                  </h3>
                  <p className="text-sm text-text-secondary leading-relaxed">
                    {t(locale, `feat_${feature.key}_desc`)}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      <LandingLineSection locale={locale} />

      {/* CTA */}
      <section className="py-20 px-6">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-2xl md:text-3xl font-bold text-text-primary mb-4 tracking-tight">
            {t(locale, 'cta_title')}
          </h2>
          <p className="text-text-secondary mb-8 max-w-md mx-auto">
            {t(locale, 'cta_subtitle')}
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Button asChild size="lg" glow>
              <Link href="/login">
                {t(locale, 'cta_login')}
                <ArrowRight className="w-4 h-4 ml-1" />
              </Link>
            </Button>
            <Button asChild variant="ghost" size="lg">
              <Link href="/liff/service-request">
                <MessageCircle className="w-4 h-4 mr-1" />
                {t(locale, 'cta_request')}
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <LandingFooter locale={locale} />
    </main>
  );
}
