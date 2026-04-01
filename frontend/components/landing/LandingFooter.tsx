'use client';

import { MessageSquare, HeadphonesIcon, Globe } from 'lucide-react';
import { t, type Locale } from '@/lib/i18n/landing';

interface LandingFooterProps {
  locale: Locale;
}

export function LandingFooter({ locale }: LandingFooterProps) {
  return (
    <footer className="bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-white/10 pt-24 pb-12 relative z-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Main grid: 5 columns */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-12 lg:gap-8 mb-16">
          {/* Brand column (col-span-2) */}
          <div className="lg:col-span-2">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 bg-gradient-to-br from-blue-900 to-blue-500 rounded-2xl flex items-center justify-center text-white font-bold text-lg shadow-lg">
                JSK
              </div>
              <span className="font-heading font-black text-3xl text-slate-900 dark:text-white tracking-tight">
                JSK Platform
              </span>
            </div>
            <p className="text-base text-slate-500 dark:text-slate-400 leading-relaxed max-w-sm font-medium">
              {t(locale, 'footer_brand_desc')}
            </p>
          </div>

          {/* About column */}
          <div>
            <h4 className="font-heading text-slate-900 dark:text-white font-bold text-lg mb-6 tracking-wide">
              {t(locale, 'footer_about')}
            </h4>
            <ul className="space-y-4 text-sm font-medium">
              <li>
                <a
                  href="#"
                  className="text-slate-500 dark:text-slate-400 hover:text-blue-900 dark:hover:text-blue-400 transition-colors"
                >
                  {t(locale, 'footer_about_system')}
                </a>
              </li>
              <li>
                <a
                  href="#"
                  className="text-slate-500 dark:text-slate-400 hover:text-blue-900 dark:hover:text-blue-400 transition-colors"
                >
                  {t(locale, 'footer_about_office')}
                </a>
              </li>
              <li>
                <a
                  href="#"
                  className="text-slate-500 dark:text-slate-400 hover:text-blue-900 dark:hover:text-blue-400 transition-colors"
                >
                  {t(locale, 'footer_about_policy')}
                </a>
              </li>
            </ul>
          </div>

          {/* Services column */}
          <div>
            <h4 className="font-heading text-slate-900 dark:text-white font-bold text-lg mb-6 tracking-wide">
              {t(locale, 'footer_services')}
            </h4>
            <ul className="space-y-4 text-sm font-medium">
              <li>
                <a
                  href="#"
                  className="text-slate-500 dark:text-slate-400 hover:text-blue-900 dark:hover:text-blue-400 transition-colors"
                >
                  {t(locale, 'footer_services_livechat')}
                </a>
              </li>
              <li>
                <a
                  href="#"
                  className="text-slate-500 dark:text-slate-400 hover:text-blue-900 dark:hover:text-blue-400 transition-colors"
                >
                  {t(locale, 'footer_services_request')}
                </a>
              </li>
              <li>
                <a
                  href="#"
                  className="text-slate-500 dark:text-slate-400 hover:text-blue-900 dark:hover:text-blue-400 transition-colors"
                >
                  {t(locale, 'footer_services_chatbot')}
                </a>
              </li>
              <li>
                <a
                  href="#"
                  className="text-slate-500 dark:text-slate-400 hover:text-blue-900 dark:hover:text-blue-400 transition-colors"
                >
                  {t(locale, 'footer_services_reports')}
                </a>
              </li>
            </ul>
          </div>

          {/* Contact column */}
          <div>
            <h4 className="font-heading text-slate-900 dark:text-white font-bold text-lg mb-6 tracking-wide">
              {t(locale, 'footer_contact')}
            </h4>
            <ul className="space-y-4 text-sm font-medium">
              <li className="flex items-start gap-3">
                <span className="text-slate-400 mt-0.5">
                  <MessageSquare className="w-4 h-4" />
                </span>
                <a
                  href="mailto:contact@rlpd.go.th"
                  className="text-slate-600 dark:text-slate-300 hover:text-blue-900 dark:hover:text-blue-400 transition-colors"
                >
                  contact@rlpd.go.th
                </a>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-slate-400 mt-0.5">
                  <HeadphonesIcon className="w-4 h-4" />
                </span>
                <span className="text-slate-600 dark:text-slate-300">
                  0-2141-2500
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-slate-400 mt-0.5">
                  <Globe className="w-4 h-4" />
                </span>
                <span className="text-slate-600 dark:text-slate-300 leading-relaxed">
                  {t(locale, 'footer_address')}
                </span>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="pt-8 border-t border-slate-200 dark:border-white/10 flex flex-col md:flex-row justify-between items-center gap-4 text-sm font-medium text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-slate-100 dark:bg-white/5 rounded-lg flex items-center justify-center text-xs font-bold text-slate-400">
              JSK
            </div>
            <span className="font-bold text-slate-700 dark:text-slate-200">
              JSK 4.0 Platform
            </span>
          </div>
          <p>
            &copy; {new Date().getFullYear()} {t(locale, 'footer_copyright')}
          </p>
        </div>
      </div>
    </footer>
  );
}
