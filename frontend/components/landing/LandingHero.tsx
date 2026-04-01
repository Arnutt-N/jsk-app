'use client';

import Link from 'next/link';
import { motion } from 'motion/react';
import {
  Sparkles,
  ChevronRight,
  ArrowRight,
  LayoutDashboard,
  Users,
  MessageCircle,
  Zap,
  CheckCircle2,
} from 'lucide-react';
import { t, type Locale } from '@/lib/i18n/landing';

interface LandingHeroProps {
  locale: Locale;
}

const STAT_CARDS = [
  {
    labelKey: 'hero_mock_requests',
    valueKey: 'hero_mock_requests_val',
    trendKey: 'hero_mock_requests_trend',
    color: 'text-blue-900 dark:text-blue-400',
    bg: 'bg-blue-50 dark:bg-blue-900/20',
    icon: Users,
  },
  {
    labelKey: 'hero_mock_chats',
    valueKey: 'hero_mock_chats_val',
    trendKey: 'hero_mock_chats_trend',
    color: 'text-rose-600 dark:text-rose-400',
    bg: 'bg-rose-50 dark:bg-rose-900/20',
    icon: MessageCircle,
  },
  {
    labelKey: 'hero_mock_response',
    valueKey: 'hero_mock_response_val',
    trendKey: 'hero_mock_response_trend',
    color: 'text-emerald-600 dark:text-emerald-400',
    bg: 'bg-emerald-50 dark:bg-emerald-900/20',
    icon: Zap,
  },
  {
    labelKey: 'hero_mock_csat',
    valueKey: 'hero_mock_csat_val',
    trendKey: 'hero_mock_csat_trend',
    color: 'text-blue-600 dark:text-blue-400',
    bg: 'bg-blue-50 dark:bg-blue-900/20',
    icon: CheckCircle2,
  },
] as const;

const BAR_HEIGHTS = [40, 70, 45, 90, 65, 85, 100, 60, 80];

export function LandingHero({ locale }: LandingHeroProps) {
  const fadeUpVariant = {
    hidden: { opacity: 0, y: 30 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: 'easeOut' as const } },
  };
  const staggerContainer = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.1 } },
  };

  return (
    <section className="relative z-10 pt-32 pb-20 lg:pt-40 lg:pb-32 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto flex flex-col items-center text-center">
      <motion.div
        initial="hidden"
        animate="visible"
        variants={staggerContainer}
        className="max-w-4xl mx-auto flex flex-col items-center"
      >
        {/* Badge */}
        <motion.div
          variants={fadeUpVariant}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/60 dark:bg-white/5 backdrop-blur-md border border-slate-200/60 dark:border-white/10 shadow-[0_2px_10px_rgba(0,0,0,0.02)] mb-8 hover:shadow-md transition-all cursor-pointer group"
        >
          <Sparkles className="w-4 h-4 text-blue-800 dark:text-blue-400 group-hover:animate-pulse" />
          <span className="text-sm font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-950 to-blue-600 dark:from-blue-300 dark:to-blue-500">
            {t(locale, 'hero_badge')}
          </span>
          <ChevronRight className="w-4 h-4 text-slate-400" />
        </motion.div>

        {/* H1 */}
        <motion.h1
          variants={fadeUpVariant}
          className="font-heading text-5xl md:text-7xl lg:text-8xl font-black tracking-tight text-slate-900 dark:text-white mb-8 leading-[1.05]"
        >
          {t(locale, 'hero_title_line1')} <br />
          <span className="relative inline-block mt-2">
            <span className="relative z-10 text-[#00B900] drop-shadow-sm">
              {t(locale, 'hero_title_line2')}
            </span>
            <div className="absolute -bottom-2 left-0 right-0 h-4 bg-[#00B900]/20 -rotate-1 blur-sm rounded-full" />
          </span>
        </motion.h1>

        {/* Subtitle */}
        <motion.p
          variants={fadeUpVariant}
          className="text-lg md:text-xl text-slate-500 dark:text-slate-400 max-w-2xl mx-auto font-medium leading-relaxed mb-10"
        >
          {t(locale, 'hero_subtitle')}
        </motion.p>

        {/* CTA Buttons */}
        <motion.div
          variants={fadeUpVariant}
          className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto"
        >
          {/* Primary: blue navy */}
          <Link
            href="/admin"
            className="group relative inline-flex items-center justify-center gap-2 text-base font-bold bg-blue-900 text-white px-8 py-4 rounded-full overflow-hidden transition-all hover:scale-105 hover:shadow-[0_10px_40px_-10px_rgba(30,58,138,0.5)] w-full sm:w-auto"
          >
            <span className="relative z-10 flex items-center gap-2">
              {t(locale, 'hero_cta_start')}{' '}
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </span>
            <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-blue-800 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          </Link>
          {/* Secondary: glassmorphic */}
          <Link
            href="/liff/service-request"
            className="inline-flex items-center justify-center gap-2 text-base font-bold bg-white/50 dark:bg-white/5 backdrop-blur-md text-slate-700 dark:text-slate-200 border border-slate-200/80 dark:border-white/10 px-8 py-4 rounded-full hover:bg-white dark:hover:bg-white/10 hover:border-slate-300 hover:shadow-md transition-all w-full sm:w-auto"
          >
            <LayoutDashboard className="w-5 h-5 text-blue-800 dark:text-blue-400" />{' '}
            {t(locale, 'hero_cta_demo')}
          </Link>
        </motion.div>
      </motion.div>

      {/* Dashboard Mockup */}
      <motion.div
        initial={{ opacity: 0, y: 80 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="mt-24 w-full max-w-5xl relative"
      >
        {/* Decorative blurs */}
        <div className="absolute -top-10 -left-10 w-32 h-32 bg-blue-400/30 rounded-full blur-3xl" />
        <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-blue-900/30 rounded-full blur-3xl" />

        {/* Outer glassmorphic card */}
        <div className="rounded-[2.5rem] border border-white/60 dark:border-white/10 bg-white/30 dark:bg-white/5 backdrop-blur-3xl shadow-[0_40px_100px_-20px_rgba(0,0,0,0.1)] p-3 md:p-5 relative group">
          <div className="absolute inset-0 bg-gradient-to-tr from-blue-900/5 to-white/20 rounded-[2.5rem] opacity-0 group-hover:opacity-100 transition-opacity duration-700" />

          {/* Inner white card */}
          <div className="rounded-[2rem] border border-slate-100/80 dark:border-white/10 bg-white/90 dark:bg-slate-900/90 overflow-hidden shadow-2xl relative z-10">
            {/* Traffic lights header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-white/10 bg-slate-50/80 dark:bg-slate-800/80 backdrop-blur-md">
              <div className="flex gap-2">
                <div className="w-3.5 h-3.5 rounded-full bg-rose-400 shadow-sm" />
                <div className="w-3.5 h-3.5 rounded-full bg-amber-400 shadow-sm" />
                <div className="w-3.5 h-3.5 rounded-full bg-emerald-400 shadow-sm" />
              </div>
              <div className="flex gap-4">
                <div className="h-2.5 w-32 bg-slate-200/80 dark:bg-white/10 rounded-full" />
                <div className="h-2.5 w-20 bg-slate-200/80 dark:bg-white/10 rounded-full" />
              </div>
            </div>

            {/* Mockup content */}
            <div className="p-6 md:p-10 bg-slate-50/30 dark:bg-slate-900/30">
              {/* Stat cards grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 mb-8">
                {STAT_CARDS.map((card) => {
                  const Icon = card.icon;
                  return (
                    <motion.div
                      key={card.labelKey}
                      whileHover={{ y: -5, scale: 1.02 }}
                      className="p-5 rounded-2xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-white/10 shadow-[0_2px_10px_rgba(0,0,0,0.02)] hover:shadow-xl transition-all"
                    >
                      <div className={`inline-flex p-2 rounded-xl ${card.bg} mb-3`}>
                        <Icon className={`w-5 h-5 ${card.color}`} />
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                        {t(locale, card.labelKey)}
                      </p>
                      <p className={`text-2xl font-black mt-1 ${card.color}`}>
                        {t(locale, card.valueKey)}
                      </p>
                      <p className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold mt-1">
                        {t(locale, card.trendKey)}
                      </p>
                    </motion.div>
                  );
                })}
              </div>

              {/* Charts row */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Bar chart */}
                <div className="md:col-span-2 h-56 rounded-2xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-white/10 shadow-sm p-6">
                  <div className="flex items-end justify-between h-full gap-2">
                    {BAR_HEIGHTS.map((h, j) => (
                      <motion.div
                        key={j}
                        initial={{ height: 0 }}
                        animate={{ height: `${h}%` }}
                        transition={{
                          duration: 1,
                          delay: 0.5 + j * 0.1,
                          ease: 'easeOut',
                        }}
                        className="flex-1 rounded-t-lg bg-gradient-to-t from-blue-950 to-blue-400"
                      />
                    ))}
                  </div>
                </div>

                {/* Donut chart */}
                <div className="h-56 rounded-2xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-white/10 shadow-sm p-6 flex items-center justify-center">
                  <div className="relative">
                    <svg width={112} height={112} viewBox="0 0 112 112">
                      <circle
                        cx={56}
                        cy={56}
                        r={48}
                        fill="none"
                        strokeWidth={12}
                        className="stroke-slate-100 dark:stroke-white/10"
                      />
                      <motion.circle
                        cx={56}
                        cy={56}
                        r={48}
                        fill="none"
                        strokeWidth={12}
                        strokeLinecap="round"
                        className="stroke-blue-900 dark:stroke-blue-400"
                        initial={{ strokeDasharray: '0 300' }}
                        animate={{ strokeDasharray: '220 300' }}
                        transition={{
                          duration: 1.5,
                          delay: 0.8,
                          ease: 'easeOut',
                        }}
                        transform="rotate(-90 56 56)"
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="font-heading text-2xl font-black text-slate-900 dark:text-white">
                        75%
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </section>
  );
}
