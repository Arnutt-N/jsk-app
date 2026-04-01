'use client';

import Link from 'next/link';
import { motion } from 'motion/react';
import { MessageCircle, FileText, Search, Globe } from 'lucide-react';
import { t, type Locale } from '@/lib/i18n/landing';

interface LandingLineSectionProps {
  locale: Locale;
}

const items = [
  { icon: <MessageCircle className="w-6 h-6" />, titleKey: 'line_chat_title' as const, descKey: 'line_chat_desc' as const },
  { icon: <FileText className="w-6 h-6" />, titleKey: 'line_request_title' as const, descKey: 'line_request_desc' as const },
  { icon: <Search className="w-6 h-6" />, titleKey: 'line_track_title' as const, descKey: 'line_track_desc' as const },
];

export function LandingLineSection({ locale }: LandingLineSectionProps) {
  return (
    <section
      id="integration"
      className="py-32 bg-white dark:bg-slate-950 relative z-10 border-t border-slate-100 dark:border-white/10 overflow-hidden"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-[#F8FCF8] dark:bg-[#0A1F0A] rounded-[3rem] p-8 md:p-16 lg:p-20 relative shadow-[0_8px_30px_rgb(0,185,0,0.04)] border border-[#00B900]/10 overflow-hidden">
          {/* Decorative blur orbs */}
          <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-gradient-to-br from-[#00B900]/5 to-transparent rounded-full blur-[100px] -translate-y-1/2 translate-x-1/3 pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-gradient-to-tr from-[#00B900]/5 to-transparent rounded-full blur-[80px] translate-y-1/2 -translate-x-1/3 pointer-events-none" />

          <div className="relative z-10 flex flex-col lg:flex-row items-center gap-16">
            {/* Left content */}
            <div className="flex-1 text-center lg:text-left">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white dark:bg-white/10 border border-[#00B900]/20 text-[#00B900] text-sm font-bold mb-8 shadow-sm">
                <Globe className="w-4 h-4" /> {t(locale, 'line_badge')}
              </div>

              <h2 className="font-heading text-4xl md:text-5xl lg:text-6xl font-black text-slate-900 dark:text-white mb-6 tracking-tight leading-[1.1]">
                {t(locale, 'line_title_prefix')} <br />
                <span className="text-[#00B900] whitespace-nowrap">
                  {t(locale, 'line_title_accent')}
                </span>
              </h2>

              <p className="text-xl text-slate-600 dark:text-slate-300 mb-10 max-w-xl mx-auto lg:mx-0 leading-relaxed font-medium">
                {t(locale, 'line_subtitle')}
              </p>

              <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
                {/* Green gradient button */}
                <Link
                  href="/liff/service-request"
                  className="group relative inline-flex items-center justify-center gap-2 text-base font-bold bg-gradient-to-r from-[#00B900] to-[#00C900] text-white px-8 py-4 rounded-full overflow-hidden transition-all hover:scale-105 hover:shadow-[0_10px_30px_rgba(0,185,0,0.25)] w-full sm:w-auto"
                >
                  <span className="relative z-10 flex items-center gap-2">
                    <MessageCircle className="w-5 h-5 fill-current" />{' '}
                    {t(locale, 'line_cta_request')}
                  </span>
                </Link>

                {/* White outline button */}
                <a
                  href="#"
                  className="inline-flex items-center justify-center gap-2 text-base font-bold bg-white dark:bg-white/10 text-[#00B900] border border-[#00B900]/20 px-8 py-4 rounded-full hover:bg-[#00B900]/5 hover:border-[#00B900]/40 shadow-sm transition-all w-full sm:w-auto"
                >
                  {t(locale, 'line_cta_friend')}
                </a>
              </div>
            </div>

            {/* Right: Chat mockup cards */}
            <div className="flex-1 w-full max-w-lg relative">
              <div className="absolute -inset-4 bg-gradient-to-r from-white/50 dark:from-transparent to-transparent blur-2xl rounded-full opacity-80" />
              <div className="grid gap-5 relative z-10">
                {items.map((item, idx) => (
                  <motion.div
                    whileHover={{ x: 10, scale: 1.02 }}
                    key={idx}
                    className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border border-white dark:border-white/10 p-6 rounded-3xl flex items-center gap-6 hover:bg-white dark:hover:bg-slate-800 hover:border-[#00B900]/30 transition-all cursor-pointer shadow-[0_8px_30px_rgb(0,0,0,0.04)]"
                  >
                    <div className="w-16 h-16 rounded-2xl bg-[#00B900]/10 text-[#00B900] flex items-center justify-center shrink-0 border border-[#00B900]/20">
                      {item.icon}
                    </div>
                    <div>
                      <h4 className="font-heading text-xl font-bold text-slate-900 dark:text-white mb-1">
                        {t(locale, item.titleKey)}
                      </h4>
                      <p className="text-slate-500 dark:text-slate-400 text-sm font-medium">
                        {t(locale, item.descKey)}
                      </p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
