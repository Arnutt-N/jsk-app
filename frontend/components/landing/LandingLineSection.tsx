'use client';

import Link from 'next/link';
import { MessageCircle, FileText, Search } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { t, type Locale } from '@/lib/i18n/landing';

interface LandingLineSectionProps {
  locale: Locale;
}

const features = [
  { icon: MessageCircle, titleKey: 'line_chat', descKey: 'line_chat_desc' },
  { icon: FileText, titleKey: 'line_request', descKey: 'line_request_desc' },
  { icon: Search, titleKey: 'line_track', descKey: 'line_track_desc' },
] as const;

export function LandingLineSection({ locale }: LandingLineSectionProps) {
  return (
    <section className="w-full bg-gradient-to-br from-[var(--color-line-green)] to-[var(--color-line-green-dark)] py-20 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto text-center">
        {/* Header */}
        <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-4">
          {t(locale, 'line_title')}
        </h2>
        <p className="text-lg sm:text-xl text-white/90 mb-12 max-w-2xl mx-auto">
          {t(locale, 'line_subtitle')}
        </p>

        {/* Feature Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-12">
          {features.map(({ icon: Icon, titleKey, descKey }) => (
            <div
              key={titleKey}
              className="bg-white/15 backdrop-blur-sm border border-white/20 rounded-xl p-6 text-left transition-all duration-300 hover:-translate-y-1 hover:bg-white/20"
            >
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-white/20 mb-4">
                <Icon className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">
                {t(locale, titleKey)}
              </h3>
              <p className="text-sm text-white/80 leading-relaxed">
                {t(locale, descKey)}
              </p>
            </div>
          ))}
        </div>

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Button
            asChild
            size="lg"
            className="bg-white text-[var(--color-line-green-dark)] font-semibold hover:bg-white/90 hover:shadow-lg shadow-md border-0"
          >
            <Link href="#">
              {t(locale, 'line_add_friend')}
            </Link>
          </Button>
          <Button
            asChild
            size="lg"
            className="bg-white text-[var(--color-line-green-dark)] font-semibold hover:bg-white/90 hover:shadow-lg shadow-md border-0"
          >
            <Link href="/liff/service-request">
              {t(locale, 'line_liff_form')}
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
