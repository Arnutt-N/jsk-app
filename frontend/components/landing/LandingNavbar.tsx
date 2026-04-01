'use client';

import Link from 'next/link';
import { motion } from 'motion/react';
import { useState, useEffect } from 'react';
import { ArrowRight, Menu, X, Sun, Moon } from 'lucide-react';
import { useTheme } from '@/components/providers';
import { LandingLanguageToggle } from './LandingLanguageToggle';
import { t, type Locale } from '@/lib/i18n/landing';

interface LandingNavbarProps {
  locale: Locale;
  onToggleLocale: () => void;
}

const NAV_LINKS = [
  { href: '#features', key: 'nav_features' },
  { href: '#stats', key: 'nav_stats' },
  { href: '#line', key: 'nav_integration' },
] as const;

export function LandingNavbar({ locale, onToggleLocale }: LandingNavbarProps) {
  const { resolvedTheme, toggleTheme } = useTheme();
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };

    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <motion.nav
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
      className="fixed top-0 left-0 right-0 z-50 py-4"
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div
          className={`flex items-center justify-between rounded-full border transition-all duration-300 px-4 sm:px-6 py-3 ${
            isScrolled
              ? 'bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl shadow-sm border-slate-200/50 dark:border-white/10'
              : 'bg-transparent border-white/0'
          }`}
        >
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3 shrink-0">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-900 to-blue-500 rounded-full flex items-center justify-center">
              <span className="text-white text-sm font-bold tracking-tight">
                JSK
              </span>
            </div>
            <span className="font-heading font-semibold text-slate-900 dark:text-white text-lg hidden sm:inline">
              JSK Platform
            </span>
          </Link>

          {/* Desktop Navigation - Center */}
          <div className="hidden md:flex items-center">
            <div className="bg-white/50 dark:bg-white/5 backdrop-blur-md px-8 py-2.5 rounded-full">
              <div className="flex items-center gap-8">
                {NAV_LINKS.map((link) => (
                  <a
                    key={link.key}
                    href={link.href}
                    className="text-sm font-semibold text-slate-600 dark:text-slate-300 hover:text-blue-900 dark:hover:text-blue-400 transition-colors"
                  >
                    {t(locale, link.key)}
                  </a>
                ))}
              </div>
            </div>
          </div>

          {/* Desktop Actions - Right */}
          <div className="hidden md:flex items-center gap-2">
            {/* Theme Toggle */}
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={
                resolvedTheme === 'dark'
                  ? 'Switch to light mode'
                  : 'Switch to dark mode'
              }
              className="w-10 h-10 flex items-center justify-center rounded-full border border-slate-200/70 dark:border-white/10 bg-white/75 dark:bg-white/5 text-slate-600 dark:text-white/70 hover:bg-white hover:text-slate-950 dark:hover:bg-white/10 dark:hover:text-white transition-colors"
            >
              {resolvedTheme === 'dark' ? (
                <Sun className="w-4 h-4" />
              ) : (
                <Moon className="w-4 h-4" />
              )}
            </button>

            {/* Language Toggle */}
            <LandingLanguageToggle locale={locale} onToggle={onToggleLocale} />

            {/* Login Link */}
            <Link
              href="/login"
              className="text-sm font-semibold text-slate-600 dark:text-white/70 hover:text-blue-900 dark:hover:text-blue-400 transition-colors px-3 py-2"
            >
              {t(locale, 'nav_login')}
            </Link>

            {/* Dashboard Button */}
            <Link
              href="/admin"
              className="group relative bg-blue-900 text-white px-5 py-2.5 rounded-full text-sm font-semibold transition-all duration-200 hover:scale-105 hover:shadow-[0_0_20px_rgba(30,58,138,0.4)] overflow-hidden flex items-center gap-1.5"
            >
              <span className="absolute inset-0 bg-gradient-to-r from-blue-500 to-blue-800 opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-full" />
              <span className="relative z-10 flex items-center gap-1.5">
                {t(locale, 'nav_dashboard')}
                <ArrowRight className="w-3.5 h-3.5" />
              </span>
            </Link>
          </div>

          {/* Mobile Hamburger */}
          <button
            type="button"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            aria-label={isMenuOpen ? 'Close menu' : 'Open menu'}
            className="md:hidden w-10 h-10 flex items-center justify-center rounded-full border border-slate-200/70 dark:border-white/10 bg-white/75 dark:bg-white/5 text-slate-600 dark:text-white/70 hover:bg-white hover:text-slate-950 dark:hover:bg-white/10 dark:hover:text-white transition-colors"
          >
            {isMenuOpen ? (
              <X className="w-4 h-4" />
            ) : (
              <Menu className="w-4 h-4" />
            )}
          </button>
        </div>

        {/* Mobile Menu Dropdown */}
        {isMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="mt-3 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl rounded-3xl border border-slate-200/50 dark:border-white/10 shadow-lg p-6"
          >
            {/* Mobile Nav Links */}
            <div className="flex flex-col gap-1">
              {NAV_LINKS.map((link) => (
                <a
                  key={link.key}
                  href={link.href}
                  onClick={() => setIsMenuOpen(false)}
                  className="text-sm font-semibold text-slate-600 dark:text-slate-300 hover:text-blue-900 dark:hover:text-blue-400 transition-colors py-3 px-3 rounded-xl hover:bg-slate-100/50 dark:hover:bg-white/5"
                >
                  {t(locale, link.key)}
                </a>
              ))}
            </div>

            {/* Mobile Divider */}
            <div className="my-4 border-t border-slate-200/50 dark:border-white/10" />

            {/* Mobile Actions */}
            <div className="flex items-center gap-2 mb-4">
              <button
                type="button"
                onClick={toggleTheme}
                aria-label={
                  resolvedTheme === 'dark'
                    ? 'Switch to light mode'
                    : 'Switch to dark mode'
                }
                className="w-10 h-10 flex items-center justify-center rounded-full border border-slate-200/70 dark:border-white/10 bg-white/75 dark:bg-white/5 text-slate-600 dark:text-white/70 hover:bg-white hover:text-slate-950 dark:hover:bg-white/10 dark:hover:text-white transition-colors"
              >
                {resolvedTheme === 'dark' ? (
                  <Sun className="w-4 h-4" />
                ) : (
                  <Moon className="w-4 h-4" />
                )}
              </button>

              <LandingLanguageToggle
                locale={locale}
                onToggle={onToggleLocale}
              />
            </div>

            {/* Mobile CTA Buttons */}
            <div className="flex flex-col gap-3">
              <Link
                href="/login"
                onClick={() => setIsMenuOpen(false)}
                className="text-center text-sm font-semibold text-slate-600 dark:text-white/70 hover:text-blue-900 dark:hover:text-blue-400 transition-colors py-3 px-4 rounded-full border border-slate-200/50 dark:border-white/10"
              >
                {t(locale, 'nav_login')}
              </Link>

              <Link
                href="/admin"
                onClick={() => setIsMenuOpen(false)}
                className="group relative bg-blue-900 text-white px-5 py-3 rounded-full text-sm font-semibold text-center transition-all duration-200 overflow-hidden flex items-center justify-center gap-1.5"
              >
                <span className="absolute inset-0 bg-gradient-to-r from-blue-500 to-blue-800 opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-full" />
                <span className="relative z-10 flex items-center gap-1.5">
                  {t(locale, 'nav_dashboard')}
                  <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </Link>
            </div>
          </motion.div>
        )}
      </div>
    </motion.nav>
  );
}
