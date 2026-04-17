'use client';

import { motion } from 'motion/react';
import {
  Sparkles,
  MessageSquare,
  HeadphonesIcon,
  BarChart3,
  FileText,
} from 'lucide-react';
import { t, type Locale } from '@/lib/i18n/landing';

interface LandingFeaturesProps {
  locale: Locale;
}

const kanbanItems = [
  { titleKey: 'feature_kanban_new', status: 'bg-rose-500', time: '10m ago' },
  { titleKey: 'feature_kanban_progress', status: 'bg-amber-500', time: '1h ago' },
  { titleKey: 'feature_kanban_review', status: 'bg-blue-500', time: '2h ago' },
] as const;

const cardMotion = {
  whileHover: { y: -8, scale: 1.01 },
  transition: { duration: 0.3 },
} as const;

export function LandingFeatures({ locale }: LandingFeaturesProps) {
  return (
    <section
      id="features"
      className="py-32 relative z-10 bg-slate-50/50 dark:bg-slate-900/30"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-20">
          <h2 className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-100/50 dark:bg-blue-900/20 text-blue-900 dark:text-blue-300 text-sm font-bold tracking-wide uppercase mb-6 border border-blue-200/50 dark:border-blue-800/30">
            <Sparkles className="w-4 h-4" /> {t(locale, 'features_badge')}
          </h2>
          <h3 className="font-heading text-4xl md:text-5xl lg:text-6xl font-black text-slate-900 dark:text-white mb-6 tracking-tight leading-tight">
            {t(locale, 'features_title_prefix')}{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-950 to-blue-500 dark:from-blue-300 dark:to-blue-500">
              {t(locale, 'features_title_accent')}
            </span>
          </h3>
          <p className="text-xl text-slate-500 dark:text-slate-400 font-medium">
            {t(locale, 'features_subtitle')}
          </p>
        </div>

        {/* Bento Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 auto-rows-[minmax(320px,auto)]">
          {/* Card 1 - Chatbot (large, col-span-2) */}
          <motion.div
            {...cardMotion}
            className="md:col-span-2 rounded-[2.5rem] bg-white dark:bg-slate-800 border border-slate-200/60 dark:border-white/10 p-8 md:p-12 shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_20px_40px_rgb(0,0,0,0.08)] transition-all overflow-hidden relative group"
          >
            <div className="absolute top-0 right-0 w-80 h-80 bg-gradient-to-br from-sky-100 dark:from-blue-900/20 to-blue-50 dark:to-transparent rounded-full blur-3xl -mr-20 -mt-20" />
            <div className="relative z-10">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-900 to-blue-500 text-white flex items-center justify-center mb-6">
                <MessageSquare className="w-8 h-8" />
              </div>
              <h4 className="font-heading text-3xl font-black text-slate-900 dark:text-white mb-4">
                {t(locale, 'feature_chatbot_title')}
              </h4>
              <p className="text-lg text-slate-600 dark:text-slate-300 max-w-md leading-relaxed font-medium mb-8">
                {t(locale, 'feature_chatbot_desc')}
              </p>
              <div className="flex flex-wrap gap-3">
                <span className="px-4 py-2 bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-slate-300 text-sm font-bold rounded-xl border border-slate-200/60 dark:border-white/10">
                  {t(locale, 'feature_chatbot_tag1')}
                </span>
                <span className="px-4 py-2 bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-slate-300 text-sm font-bold rounded-xl border border-slate-200/60 dark:border-white/10">
                  {t(locale, 'feature_chatbot_tag2')}
                </span>
                <span className="px-4 py-2 bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-slate-300 text-sm font-bold rounded-xl border border-slate-200/60 dark:border-white/10">
                  {t(locale, 'feature_chatbot_tag3')}
                </span>
              </div>
            </div>
          </motion.div>

          {/* Card 2 - Live Chat */}
          <motion.div
            {...cardMotion}
            className="rounded-[2.5rem] bg-white dark:bg-slate-800 border border-slate-200/60 dark:border-white/10 p-8 md:p-12 shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_20px_40px_rgb(0,0,0,0.08)] transition-all overflow-hidden relative group"
          >
            <div className="absolute bottom-0 right-0 w-64 h-64 bg-blue-50 dark:bg-blue-900/10 rounded-full blur-3xl -mr-10 -mb-10" />
            <div className="relative z-10">
              <div className="w-16 h-16 rounded-2xl bg-blue-100 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border border-blue-200/50 dark:border-blue-800/30 flex items-center justify-center mb-6">
                <HeadphonesIcon className="w-8 h-8" />
              </div>
              <h4 className="font-heading text-3xl font-black text-slate-900 dark:text-white mb-4">
                {t(locale, 'feature_livechat_title')}
              </h4>
              <p className="text-lg text-slate-600 dark:text-slate-300 leading-relaxed font-medium">
                {t(locale, 'feature_livechat_desc')}
              </p>
            </div>
          </motion.div>

          {/* Card 3 - Analytics */}
          <motion.div
            {...cardMotion}
            className="rounded-[2.5rem] bg-white dark:bg-slate-800 border border-slate-200/60 dark:border-white/10 p-8 md:p-12 shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_20px_40px_rgb(0,0,0,0.08)] transition-all overflow-hidden relative group"
          >
            <div className="absolute top-0 right-0 w-48 h-48 bg-emerald-50 dark:bg-emerald-900/10 rounded-full blur-3xl -mr-10 -mt-10" />
            <div className="relative z-10">
              <div className="w-16 h-16 rounded-2xl bg-emerald-100 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200/50 dark:border-emerald-800/30 flex items-center justify-center mb-6">
                <BarChart3 className="w-8 h-8" />
              </div>
              <h4 className="font-heading text-3xl font-black text-slate-900 dark:text-white mb-4">
                {t(locale, 'feature_analytics_title')}
              </h4>
              <p className="text-lg text-slate-600 dark:text-slate-300 leading-relaxed font-medium">
                {t(locale, 'feature_analytics_desc')}
              </p>
            </div>
          </motion.div>

          {/* Card 4 - Service Request (large, col-span-2) */}
          <motion.div
            {...cardMotion}
            className="md:col-span-2 rounded-[2.5rem] bg-white dark:bg-slate-800 border border-slate-200/60 dark:border-white/10 p-8 md:p-12 shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_20px_40px_rgb(0,0,0,0.08)] transition-all overflow-hidden relative group flex flex-col md:flex-row gap-10 items-center"
          >
            <div className="absolute bottom-0 left-0 w-80 h-80 bg-rose-50 dark:bg-rose-900/10 rounded-full blur-3xl -ml-20 -mb-20" />
            <div className="relative z-10 flex-1">
              <div className="w-16 h-16 rounded-2xl bg-rose-100 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 border border-rose-200/50 dark:border-rose-800/30 flex items-center justify-center mb-6">
                <FileText className="w-8 h-8" />
              </div>
              <h4 className="font-heading text-3xl font-black text-slate-900 dark:text-white mb-4">
                {t(locale, 'feature_request_title')}
              </h4>
              <p className="text-lg text-slate-600 dark:text-slate-300 leading-relaxed font-medium">
                {t(locale, 'feature_request_desc')}
              </p>
            </div>

            {/* Kanban mockup */}
            <div className="w-full md:w-1/2 bg-slate-50/80 dark:bg-white/5 backdrop-blur-sm rounded-3xl p-6 border border-slate-200/60 dark:border-white/10 shadow-inner relative z-10">
              <div className="space-y-3">
                {kanbanItems.map((item, idx) => (
                  <div
                    key={idx}
                    className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-100 dark:border-white/10 flex items-center justify-between shadow-sm hover:shadow-md transition-shadow cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-2.5 h-2.5 rounded-full ${item.status}`} />
                      <span className="text-sm font-bold text-slate-700 dark:text-slate-200">
                        {t(locale, item.titleKey)}
                      </span>
                    </div>
                    <span className="text-xs text-slate-400 dark:text-slate-500 font-medium">
                      {item.time}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
